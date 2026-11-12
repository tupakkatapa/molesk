const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const { asyncHandler } = require("./helpers");
const { editHref, slugPath } = require("../public/slug.mjs");
const { generateFolderStructure } = require("./content");
const {
  parseFileContent,
  splitFrontMatter,
  metadataToHtml,
} = require("./markdown");
const { recordAlias } = require("./aliases");
const { siteIndex } = require("./site");
const { historyHandler } = require("./history");
const { crumbsOf, folderHref } = require("./pages");
const { carryAssets, uploadAsset } = require("./assets");
const {
  checkNewName,
  checkPrecondition,
  copyToTrash,
  etagOf,
  fsyncDir,
  httpError,
  moveToTrash,
  readCurrent,
  removeTempFiles,
  resolveWritable,
  statOf,
  withWriteLock,
  writeAtomic,
} = require("./files");
const { resolveAddress } = require("./addresses");

function sendError(res, err) {
  if (err.expose && err.status) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err.code === "ENOTDIR" || err.code === "EEXIST") {
    return res.status(409).json({ error: "Path conflicts with a file" });
  }
  console.error("Edit API error:", err);
  res.status(500).json({ error: "Write failed" });
}

const api = (fn) => (req, res) =>
  Promise.resolve()
    .then(() => fn(req, res))
    .catch((err) => sendError(res, err));

const parseMarkdown = express.text({ type: "text/markdown", limit: "1mb" });

function editorModel(config, rel, current) {
  const ext = path.extname(rel);
  const dir = rel.slice(0, rel.lastIndexOf("/") + 1);
  const index = config.SHOW_INDEX;
  const { front, body, meta } = splitFrontMatter(
    current === null ? "" : current.toString("utf8"),
  );
  return {
    path: rel,
    href: slugPath(rel),
    name: path.basename(rel, ext),
    ext,
    dir,
    crumbs: crumbsOf(rel, config.TITLE).map((crumb) => ({
      ...crumb,
      href: index ? crumb.href : null,
    })),
    folderHref: index ? folderHref(dir.slice(0, -1)) : "/",
    download: config.SHOW_DOWNLOAD,
    history: config.GIT,
    front,
    text: body,
    metadata: metadataToHtml(meta),
    etag: current === null ? "" : etagOf(current),
  };
}

function renderEditor(config) {
  const root = config.CONTENTS_DIR;
  return asyncHandler(async (req, res) => {
    // An address that names no page yet is a new page's own path.
    const rel = await resolveAddress(config, req.params.path).catch(
      () => req.params.path,
    );
    const file = await resolveWritable(root, rel);
    const current = await readCurrent(file);
    const canonical = editHref(rel);
    const slug = decodeURIComponent(canonical.slice("/edit/".length));
    if (
      current !== null &&
      slug !== req.params.path &&
      (await resolveAddress(config, slug).catch(() => null)) === rel
    ) {
      res.redirect(301, canonical);
      return;
    }
    const editor = editorModel(config, rel, current);
    res.render("index", {
      tree: await generateFolderStructure(config),
      current: editor.path,
      initialContent: "",
      editor,
      pageTitle: `${editor.name} - ${config.TITLE}`,
      heading: editor.name,
    });
  });
}

const getFile = (root) =>
  api(async (req, res) => {
    const current = await readCurrent(
      await resolveWritable(root, req.params.path),
    );
    if (current === null) throw httpError(404, "Not found");
    res.setHeader("ETag", etagOf(current));
    res.type("text/markdown").send(current);
  });

// An overwrite of different text with If-Match: * keeps the old text in
// the trash, so "Keep mine" never destroys theirs.
const putFile = (root, onChange) =>
  api(async (req, res) => {
    if (typeof req.body !== "string") {
      throw httpError(415, "Content-Type must be text/markdown");
    }
    const rel = req.params.path;
    const file = await resolveWritable(root, rel);
    const body = Buffer.from(req.body);
    await withWriteLock(async () => {
      const current = await readCurrent(file);
      checkPrecondition(req, current);
      if (current === null) checkNewName(rel);
      if (req.get("If-Match") === "*" && !current.equals(body)) {
        await copyToTrash(root, rel, current);
      }
      await fs.mkdir(path.dirname(file), { recursive: true });
      await writeAtomic(file, body);
      onChange();
      res.setHeader("ETag", etagOf(body));
      res.status(current === null ? 201 : 200).json({});
    });
  });

const trashFile = (root, onChange) =>
  api(async (req, res) => {
    if (!req.get("If-Match")) throw httpError(428, "If-Match required");
    const file = await resolveWritable(root, req.params.path);
    await withWriteLock(async () => {
      checkPrecondition(req, await readCurrent(file));
      await moveToTrash(root, req.params.path, file);
      onChange();
      res.status(204).end();
    });
  });

async function resolveMove(root, from, to) {
  const source = await resolveWritable(root, from, { folder: true });
  const stat = await statOf(source);
  if (!stat) throw httpError(404, "Not found");
  const folder = stat.isDirectory();
  if (!folder) await resolveWritable(root, from);
  return {
    source,
    folder,
    target: await resolveWritable(root, to, { folder }),
  };
}

async function renameEntry(source, target, to) {
  checkNewName(to);
  if (await statOf(target)) throw httpError(409, "Already exists");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.rename(source, target).catch((err) => {
    throw err.code === "EINVAL"
      ? httpError(400, "Can't move a folder into itself")
      : err;
  });
  await fsyncDir(path.dirname(source));
  await fsyncDir(path.dirname(target));
}

// With history on, a move is a commit of its own, so git can follow it.
const moveEntry = (root, onChange, history) =>
  api(async (req, res) => {
    const { from, to } = req.body ?? {};
    await history?.flush();
    await withWriteLock(async () => {
      const { source, target, folder } = await resolveMove(root, from, to);
      if (!folder && !req.get("If-Match")) {
        throw httpError(428, "If-Match required");
      }
      const current = folder ? null : await readCurrent(source);
      if (!folder) checkPrecondition(req, current);
      let note = current;
      if (source !== target) {
        if (note)
          note = await recordAlias(source, target, { from, to, current });
        // The alias edit is committed under the old name, so the rename
        // is a pure one git can follow
        await history?.flush();
        await renameEntry(source, target, to);
        if (note) await carryAssets(root, from, to, note.toString());
      }
      onChange();
      if (note) res.setHeader("ETag", etagOf(note));
      res.json(
        note
          ? { path: to, front: splitFrontMatter(note.toString()).front }
          : { path: to },
      );
    });
    await history?.flush(`Rename ${from} to ${to}`);
  });

const makeDir = (root, onChange) =>
  api(async (req, res) => {
    const dir = await resolveWritable(root, req.params.path, { folder: true });
    await withWriteLock(async () => {
      const stat = await statOf(dir);
      if (stat && !stat.isDirectory())
        throw httpError(409, "A page has that name");
      if (!stat) checkNewName(req.params.path);
      await fs.mkdir(dir, { recursive: true });
      if (!stat) onChange();
      res.status(stat ? 200 : 201).json({});
    });
  });

const removeDir = (root, onChange) =>
  api(async (req, res) => {
    const dir = await resolveWritable(root, req.params.path, { folder: true });
    await withWriteLock(async () => {
      const stat = await statOf(dir);
      if (!stat?.isDirectory()) throw httpError(404, "Not found");
      await removeTempFiles(dir);
      await fs.rmdir(dir).catch((err) => {
        throw err.code === "ENOTEMPTY"
          ? httpError(409, "Folder isn't empty")
          : err;
      });
      onChange();
      res.status(204).end();
    });
  });

const previewOf = (config) =>
  api(async (req, res) => {
    if (typeof req.body !== "string") {
      throw httpError(415, "Content-Type must be text/markdown");
    }
    const site = await siteIndex(config).get();
    const parsed = parseFileContent(req.body, { site });
    res.type("html").send(metadataToHtml(parsed.metadata) + parsed.content);
  });

const parseJson = express.json({ limit: "16kb" });

function guardWrites(req, res, next) {
  const site = req.get("Sec-Fetch-Site");
  if (site && site !== "same-origin") {
    return sendError(res, httpError(403, "Cross-site request refused"));
  }
  const fail = (err) => sendError(res, err);
  parseMarkdown(req, res, (err) =>
    err ? fail(err) : parseJson(req, res, (e) => (e ? fail(e) : next())),
  );
}

function editRouter(config, onChange, history) {
  const root = config.CONTENTS_DIR;
  const router = express.Router();
  router.use(["/edit", "/api"], (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.use("/api", guardWrites);
  router.get("/edit/:path(*)", renderEditor(config));
  router.get("/api/files/:path(*)", getFile(root));
  router.put("/api/files/:path(*)", putFile(root, onChange));
  router.delete("/api/files/:path(*)", trashFile(root, onChange));
  router.post("/api/move", moveEntry(root, onChange, history));
  router.put("/api/dirs/:path(*)", makeDir(root, onChange));
  router.delete("/api/dirs/:path(*)", removeDir(root, onChange));
  router.post("/api/preview", previewOf(config));
  router.put("/api/assets/:path(*)", api(uploadAsset(root)));
  if (history) {
    router.get("/api/history/:path(*)", api(historyHandler(config, history)));
  }
  return router;
}

module.exports = { editRouter };
