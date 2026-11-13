const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const {
  asyncHandler,
  byDateThenName,
  byName,
  formatDay,
  indexOff,
  noteTitle,
  isPathSafe,
  ERROR_MESSAGES,
  MEDIA_EXTENSIONS,
  MD_EXTENSIONS,
  toSlash,
} = require("./helpers");
const { etagOf, httpError, notFound, resolveReadable } = require("./files");
const { movedTo, resolveAddress } = require("./addresses");
const { backlinksOf, siteIndex } = require("./site");
const { downloadHref, pageHref } = require("../public/slug.mjs");
const { describe, isPublished, parseMetadataOnly } = require("./frontmatter");
const { metadataToHtml, parseFileContent, tagsToHtml } = require("./markdown");
const {
  contentActions,
  crumbsOf,
  folderHref,
  renderView,
  send,
} = require("./shell");
const { pagerOf } = require("./publish");
const { serveFavicon, serveProfilePic } = require("./profile");
const {
  findFirstNote,
  findFolderIndex,
  findHome,
  generateFolderStructure,
  listFolder,
} = require("./content");

async function folderModel(config, rel) {
  const root = config.CONTENTS_DIR;
  const items = await listFolder(config, path.join(root, rel));
  const notes = items
    .filter((item) => !item.isDirectory)
    .sort(byDateThenName)
    .map((item) => ({
      title: item.title,
      href: pageHref(toSlash(path.relative(root, item.path))),
      date: item.date,
      day: formatDay(item.date),
      draft: item.draft,
      excerpt: item.excerpt === item.title ? "" : item.excerpt,
    }));
  const folders = items
    .filter((item) => item.isDirectory)
    .map((item) => ({
      name: noteTitle(item.name),
      raw: item.name,
      href: folderHref(path.relative(root, item.path)),
    }))
    .sort((a, b) => byName(a.raw, b.raw));
  const slashed = toSlash(rel);
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
  const text = raw.toString("utf8");
  const site = await siteIndex(config).get();
  const { content, metadata } = parseFileContent(text, {
    site,
    toc: config.SHOW_TOC,
  });
  const { meta, title, excerpt } = describe(text, path.basename(filePath));
  if (!isPublished(meta, config)) throw notFound();
  const rel = path.relative(config.CONTENTS_DIR, filePath);
  const moved = await movedTo(
    config,
    req,
    pageHref(toSlash(rel)),
    toSlash(rel),
  );
  if (moved) return res.redirect(301, moved);
  const current = toSlash(rel);
  const pager =
    config.SHOW_PAGER &&
    pagerOf(await generateFolderStructure(config), current);
  return send(config, req, res, {
    html:
      metadataToHtml(metadata) +
      content +
      tagsToHtml(metadata.tags, config.SHOW_INDEX) +
      (await renderView(req.app, "footer", {
        pager,
        backlinks: config.SHOW_BACKLINKS ? backlinksOf(site, current) : [],
      })),
    actions: contentActions(rel, config, config.EDIT ? etagOf(raw) : ""),
    title: `${title} - ${config.TITLE}`,
    heading: title,
    current,
    description: excerpt,
    article: true,
    image: meta.image,
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
    ![...MD_EXTENSIONS, ...MEDIA_EXTENSIONS].includes(requestedExt) &&
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
  if (MEDIA_EXTENSIONS.includes(ext)) {
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

module.exports = { pageRouter };
