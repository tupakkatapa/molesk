const express = require("express");
const { constants, promises: fs } = require("fs");
const path = require("path");
const { MD_EXTENSIONS } = require("./helpers");
const {
  checkNewName,
  fsyncDir,
  httpError,
  resolveWritable,
  statOf,
  withWriteLock,
  writeAtomic,
} = require("./files");

const startsWith = (data, signature, at = 0) =>
  data
    .subarray(at, at + signature.length)
    .equals(Buffer.from(signature, "latin1"));

const IMAGES = {
  "image/png": {
    extensions: [".png"],
    matches: (data) => startsWith(data, "\u0089PNG\r\n\u001A\n"),
  },
  "image/jpeg": {
    extensions: [".jpg", ".jpeg"],
    matches: (data) => startsWith(data, "\u00FF\u00D8\u00FF"),
  },
  "image/gif": {
    extensions: [".gif"],
    matches: (data) => startsWith(data, "GIF87a") || startsWith(data, "GIF89a"),
  },
  "image/webp": {
    extensions: [".webp"],
    matches: (data) => startsWith(data, "RIFF") && startsWith(data, "WEBP", 8),
  },
};
const EXTENSIONS = Object.values(IMAGES).flatMap((image) => image.extensions);

const parseImage = express.raw({ type: Object.keys(IMAGES), limit: "10mb" });
const readImage = (req, res) =>
  new Promise((resolve, reject) => {
    parseImage(req, res, (err) => (err ? reject(err) : resolve()));
  });

// An image pasted into a page, stored in an assets folder beside it and
// never over another file. It stays a PUT: a cross-origin PUT always needs
// a preflight, which is refused, where a POST could be sent as a simple
// request.
const uploadAsset = (root) => async (req, res) => {
  const rel = req.params.path;
  const type = (req.get("Content-Type") ?? "").split(";")[0].trim();
  const image = IMAGES[type.toLowerCase()];
  if (!image?.extensions.includes(path.extname(rel).toLowerCase())) {
    throw httpError(415, "Upload a PNG, JPEG, GIF or WebP image");
  }
  if (req.get("If-None-Match") !== "*") {
    throw httpError(428, "If-None-Match: * required");
  }
  await readImage(req, res);
  if (!image.matches(req.body)) {
    throw httpError(415, "The file isn't the image its type says");
  }
  const file = await resolveWritable(root, rel, { extensions: EXTENSIONS });
  if (rel.split("/").at(-2) !== "assets") {
    throw httpError(400, "Images go in an assets folder");
  }
  checkNewName(rel);
  await withWriteLock(async () => {
    if (await statOf(file)) throw httpError(412, "File already exists");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await writeAtomic(file, req.body);
  });
  res.status(201).json({ path: rel });
};

// Image links into the page's own assets folder: `assets/x.png`,
// `./assets/x.png` or `<assets/x 1.png>`, in markdown or an img tag.
const ASSET_LINK = /(?:\]\(<?|src=["'])(?:\.\/)?assets\/([^/<>"')\n]+)/gu;

const decode = (name) => {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
};

const assetNames = (text) =>
  new Set(
    [...text.matchAll(ASSET_LINK)]
      .map((match) => decode(match[1].trim()))
      .filter((name) => EXTENSIONS.includes(path.extname(name).toLowerCase())),
  );

async function linkedFrom(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const pages = entries.filter(
    (entry) =>
      entry.isFile() &&
      MD_EXTENSIONS.includes(path.extname(entry.name).toLowerCase()),
  );
  const texts = await Promise.all(
    pages.map((entry) => fs.readFile(path.join(dir, entry.name), "utf8")),
  );
  return new Set(texts.flatMap((text) => [...assetNames(text)]));
}

// A page moved to another folder takes the images it links in its assets
// folder along. Ones another page left behind still links are copied, and
// an image already at the target is left alone.
async function carryAssets(root, from, to, text) {
  const fromDir = path.posix.dirname(from);
  const toDir = path.posix.dirname(to);
  const names = assetNames(text);
  if (fromDir === toDir || names.size === 0) return;
  const shared = await linkedFrom(path.join(root, fromDir));
  const resolve = (dir, name) =>
    resolveWritable(root, path.posix.join(dir, "assets", name), {
      extensions: EXTENSIONS,
    }).catch(() => null);
  for (const name of names) {
    const source = await resolve(fromDir, name);
    const target = await resolve(toDir, name);
    if (!source || !target || !(await statOf(source)) || (await statOf(target)))
      continue;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await (shared.has(name)
      ? fs.copyFile(source, target, constants.COPYFILE_EXCL)
      : fs.rename(source, target));
    await fsyncDir(path.dirname(source));
    await fsyncDir(path.dirname(target));
  }
}

module.exports = { carryAssets, uploadAsset };
