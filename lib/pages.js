const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const {
  asyncHandler,
  byDateThenName,
  byName,
  formatDay,
  siteOrigin,
  noteTitle,
  contentActions,
  isPathSafe,
  ERROR_MESSAGES,
  IMAGE_EXTENSIONS,
  MD_EXTENSIONS,
} = require("./helpers");
const { etagOf, httpError, resolveReadable } = require("./files");
const { movedTo, resolveAddress } = require("./addresses");
const { backlinksOf, siteIndex } = require("./site");
const {
  downloadHref,
  folderHref: slugFolderHref,
  pageHref,
} = require("../public/slug.mjs");
const {
  excerptOf,
  isPublished,
  parseFileContent,
  parseMetadataOnly,
  metadataToHtml,
} = require("./markdown");
const { pagerOf } = require("./publish");
const { serveFavicon, serveProfilePic } = require("./profile");
const {
  findFirstNote,
  findFolderIndex,
  findHome,
  generateFolderStructure,
  listFolder,
} = require("./content");

const notFound = () => Object.assign(new Error("Not Found"), { status: 404 });

const toSlash = (rel) => rel.split(path.sep).join("/");
const folderHref = (rel) => slugFolderHref(toSlash(rel));

// Breadcrumbs from the root down to, not including, `rel`.
function crumbsOf(rel, title) {
  const crumbs = [{ name: title, href: "/" }];
  const segments = rel ? rel.split(path.sep) : [];
  segments.slice(0, -1).forEach((segment, i) => {
    crumbs.push({
      name: noteTitle(segment),
      href: folderHref(segments.slice(0, i + 1).join(path.sep)),
    });
  });
  return crumbs;
}

async function folderModel(config, rel) {
  const root = config.CONTENTS_DIR;
  const items = await listFolder(config, path.join(root, rel));
  const notes = items
    .filter((item) => !item.isDirectory)
    .sort(byDateThenName)
    .map((item) => ({
      title: noteTitle(item.name),
      href: pageHref(toSlash(path.relative(root, item.path))),
      date: item.date,
      day: formatDay(item.date),
      draft: item.draft,
      excerpt: item.excerpt,
    }));
  const folders = items
    .filter((item) => item.isDirectory)
    .map((item) => ({
      name: noteTitle(item.name),
      raw: item.name,
      href: folderHref(path.relative(root, item.path)),
    }))
    .sort((a, b) => byName(a.raw, b.raw));
  const slashed = rel.split(path.sep).join("/");
  return {
    title: rel ? noteTitle(path.basename(rel)) : config.TITLE,
    path: slashed,
    name: path.basename(rel),
    parent: folderHref(path.dirname(rel) === "." ? "" : path.dirname(rel)),
    crumbs: rel ? crumbsOf(rel, config.TITLE) : [],
    dir: rel ? `${slashed}/` : "",
    folders,
    notes,
  };
}

// Link preview tags; the request's own address makes the URLs absolute.
function linkPreview(config, req, { heading, description = "", article }) {
  const origin = siteOrigin(config, req);
  return {
    title: heading,
    description,
    type: article ? "article" : "website",
    url: origin + req.originalUrl,
    image: config.IMAGE ? `${origin}/profile-pic` : "",
  };
}

async function send(
  config,
  req,
  res,
  { html, actions = "", title, heading, current = "", description, article },
) {
  if (req.xhr) {
    res.setHeader("Content-Type", "text/html");
    res.setHeader("X-Page-Title", encodeURIComponent(title));
    res.setHeader("X-Page-Heading", encodeURIComponent(heading));
    res.setHeader("X-Page-Path", encodeURIComponent(current));
    return res.send(actions + html);
  }
  res.render("index", {
    tree: await generateFolderStructure(config),
    current,
    initialContent: html,
    actions,
    pageTitle: title,
    heading,
    singleFile: !!config.SINGLE_FILE,
    preview: linkPreview(config, req, { heading, description, article }),
  });
}

const renderView = (app, view, locals) =>
  new Promise((resolve, reject) => {
    app.render(view, locals, (err, out) => (err ? reject(err) : resolve(out)));
  });

async function renderFolder(config, req, res, rel) {
  const index = await folderModel(config, rel);
  const html = await renderView(req.app, "folder", { index });
  const title = rel ? `${index.title} - ${config.TITLE}` : config.TITLE;
  return send(config, req, res, {
    html,
    title,
    heading: index.title,
    current: index.path,
  });
}

const indexOff = (config) => !config.SHOW_INDEX || config.SINGLE_FILE;
const noteHref = (config, file) =>
  pageHref(toSlash(path.relative(config.CONTENTS_DIR, file)));

async function serveRoot(config, req, res) {
  const home = await findHome(config);
  if (home) return res.redirect(pageHref(toSlash(home)));
  const first = indexOff(config)
    ? await findFirstNote(config, config.CONTENTS_DIR)
    : null;
  if (first) return res.redirect(noteHref(config, first));
  return renderFolder(config, req, res, "");
}

async function serveFolder(config, req, res, rel) {
  if (indexOff(config)) throw notFound();
  if (!req.params.path.endsWith("/")) {
    return res.redirect(301, folderHref(rel));
  }
  if (!rel) return res.redirect(301, "/");
  const dir = path.join(config.CONTENTS_DIR, rel);
  const own = await findFolderIndex(config, dir);
  if (own) return res.redirect(noteHref(config, path.join(dir, own)));
  return renderFolder(config, req, res, rel);
}

async function serveNote(config, req, res, filePath) {
  const raw = await fs.readFile(filePath);
  const site = await siteIndex(config).get();
  const { content, metadata, meta, body } = parseFileContent(
    raw.toString("utf8"),
    { site },
  );
  if (!isPublished(meta, config)) throw notFound();
  const rel = path.relative(config.CONTENTS_DIR, filePath);
  const moved = await movedTo(
    config,
    req,
    pageHref(toSlash(rel)),
    toSlash(rel),
  );
  if (moved) return res.redirect(301, moved);
  const name = noteTitle(path.basename(filePath));
  const current = rel.split(path.sep).join("/");
  const pager = pagerOf(await generateFolderStructure(config), current);
  return send(config, req, res, {
    html:
      metadataToHtml(metadata, { tagLinks: config.SHOW_INDEX }) +
      content +
      (await renderView(req.app, "footer", {
        pager,
        backlinks: backlinksOf(site, current),
      })),
    actions: contentActions(rel, config, config.EDIT ? etagOf(raw) : ""),
    title: `${name} - ${config.TITLE}`,
    heading: name,
    current,
    description: meta.description || excerptOf(body),
    article: true,
  });
}

async function serveContent(config, req, res) {
  const root = config.CONTENTS_DIR;
  if (!isPathSafe(root, req.params.path)) {
    return res.status(403).send("Access denied");
  }
  if (req.params.path.split("/").some((segment) => segment.startsWith("."))) {
    throw notFound();
  }
  const requestedExt = path.extname(req.params.path).toLowerCase();
  if (
    requestedExt &&
    ![...MD_EXTENSIONS, ...IMAGE_EXTENSIONS].includes(requestedExt) &&
    !req.params.path.endsWith("/")
  ) {
    throw httpError(400, ERROR_MESSAGES.UNSUPPORTED_FILE);
  }
  const trailing = req.params.path.endsWith("/");
  const rel = await resolveAddress(config, req.params.path, {
    folder: trailing,
  });
  const filePath = await resolveReadable(config, rel);
  const stat = await fs.stat(filePath).catch(() => null);
  if (stat?.isDirectory()) {
    const moved =
      rel &&
      (await movedTo(config, req, folderHref(rel), rel, { folder: true }));
    if (moved) return res.redirect(301, moved);
    return serveFolder(config, req, res, path.relative(root, filePath));
  }
  if (trailing) throw notFound();
  const ext = path.extname(filePath).toLowerCase();
  if (IMAGE_EXTENSIONS.includes(ext)) {
    return res.sendFile(path.relative(root, filePath), {
      root,
      dotfiles: "deny",
    });
  }
  if (!MD_EXTENSIONS.includes(ext)) {
    throw httpError(400, ERROR_MESSAGES.UNSUPPORTED_FILE);
  }
  return serveNote(config, req, res, filePath);
}

async function serveDownload(config, req, res) {
  if (!isPathSafe(config.CONTENTS_DIR, req.params.path)) {
    return res.status(403).send("Access denied");
  }
  const rel = await resolveAddress(config, req.params.path);
  const filePath = await resolveReadable(config, rel);
  if (!MD_EXTENSIONS.includes(path.extname(filePath).toLowerCase())) {
    return res.status(400).send(ERROR_MESSAGES.UNSUPPORTED_FILE);
  }
  const meta = parseMetadataOnly(await fs.readFile(filePath, "utf8"));
  if (!isPublished(meta, config)) throw notFound();
  const moved = await movedTo(config, req, downloadHref(rel), rel);
  if (moved) return res.redirect(301, moved);
  const prefix = config.TITLE.toLowerCase().replaceAll(/\s+/gu, "_");
  const filename = path
    .basename(filePath)
    .toLowerCase()
    .replaceAll(/\s+/gu, "_");
  res.download(
    path.relative(config.CONTENTS_DIR, filePath),
    `${prefix}_${filename}`,
    {
      root: config.CONTENTS_DIR,
      dotfiles: "deny",
    },
  );
}

function pageRouter(config) {
  const router = express.Router();
  const handle = (fn) => asyncHandler((req, res) => fn(config, req, res));
  router.get("/", handle(serveRoot));
  router.get("/content/:path(*)", handle(serveContent));
  if (config.SHOW_DOWNLOAD) {
    router.get("/download/:path(*)", handle(serveDownload));
  }
  router.get("/profile-pic", handle(serveProfilePic));
  router.get("/favicon.svg", handle(serveFavicon));
  router.get("/favicon.ico", (req, res) =>
    config.IMAGE ? res.redirect(301, "/favicon.svg") : res.status(204).end(),
  );
  return router;
}

module.exports = { crumbsOf, folderHref, pageRouter, renderView, send };
