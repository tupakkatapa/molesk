const express = require("express");
const { constants, promises: fs } = require("fs");
const path = require("path");
const { MD_EXTENSIONS } = require("./helpers");
const {
  checkNewName,
  fsyncDir,
  httpError,
  removeTempFiles,
  resolveWritable,
  statOf,
  withWriteLock,
  writeAtomic,
} = require("./files");

const startsWith = (data, signature, at = 0) =>
  data
    .subarray(at, at + signature.length)
    .equals(Buffer.from(signature, "latin1"));

const IMAGE_LIMIT = "10mb";
// ponytail: the body is buffered whole, so a video upload holds up to 100 MB
// in memory; stream it to disk if larger clips are needed.
const VIDEO_LIMIT = "100mb";
const isoMedia = (brand) => (data) =>
  startsWith(data, "ftyp", 4) && (!brand || startsWith(data, brand, 8));

const MEDIA = {
  "image/png": {
    extensions: [".png"],
    limit: IMAGE_LIMIT,
    matches: (data) => startsWith(data, "\u0089PNG\r\n\u001A\n"),
  },
  "image/jpeg": {
    extensions: [".jpg", ".jpeg"],
    limit: IMAGE_LIMIT,
    matches: (data) => startsWith(data, "\u00FF\u00D8\u00FF"),
  },
  "image/gif": {
    extensions: [".gif"],
    limit: IMAGE_LIMIT,
    matches: (data) => startsWith(data, "GIF87a") || startsWith(data, "GIF89a"),
  },
  "image/webp": {
    extensions: [".webp"],
    limit: IMAGE_LIMIT,
    matches: (data) => startsWith(data, "RIFF") && startsWith(data, "WEBP", 8),
  },
  "video/mp4": {
    extensions: [".mp4"],
    limit: VIDEO_LIMIT,
    matches: isoMedia(),
  },
  "video/quicktime": {
    extensions: [".mov"],
    limit: VIDEO_LIMIT,
    matches: isoMedia("qt  "),
  },
  "video/webm": {
    extensions: [".webm"],
    limit: VIDEO_LIMIT,
    matches: (data) => startsWith(data, "\u001A\u0045\u00DF\u00A3"),
  },
};
const EXTENSIONS = Object.values(MEDIA).flatMap((media) => media.extensions);

const readBody = (req, res, type) =>
  new Promise((resolve, reject) => {
    const parse = express.raw({ type, limit: MEDIA[type].limit });
    parse(req, res, (err) => (err ? reject(err) : resolve()));
  });

async function store(root, req, res, { type, media, rel }) {
  const file = await resolveWritable(root, rel, { extensions: EXTENSIONS });
  if (rel.split("/").at(-2) !== "assets") {
    throw httpError(400, "Uploads go in an assets folder");
  }
  checkNewName(rel);
  await readBody(req, res, type);
  if (!Buffer.isBuffer(req.body) || !media.matches(req.body)) {
    throw httpError(415, "The file isn't the type it says");
  }
  await withWriteLock(async () => {
    if (await statOf(file)) throw httpError(412, "File already exists");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await writeAtomic(file, req.body);
  });
}

// One video is buffered at a time, which bounds memory to about twice
// VIDEO_LIMIT.
let videoBusy = false;

// An image or video pasted into a page, stored in an assets folder beside
// it and never over another file. It stays a PUT: a cross-origin PUT always
// needs a preflight, which is refused, where a POST could be sent as a
// simple request.
const uploadAsset = (root) => async (req, res) => {
  const rel = req.params.path;
  const type = (req.get("Content-Type") ?? "").split(";")[0].trim();
  const media = MEDIA[type.toLowerCase()];
  if (!media?.extensions.includes(path.extname(rel).toLowerCase())) {
    throw httpError(
      415,
      "Upload a PNG, JPEG, GIF or WebP image, or an MP4, MOV or WebM video",
    );
  }
  if (req.get("If-None-Match") !== "*") {
    throw httpError(428, "If-None-Match: * required");
  }
  const upload = { type: type.toLowerCase(), media, rel };
  if (media.limit !== VIDEO_LIMIT) {
    await store(root, req, res, upload);
  } else if (videoBusy) {
    res.set("Retry-After", "10");
    throw httpError(503, "Another video is uploading; try again shortly");
  } else {
    videoBusy = true;
    try {
      await store(root, req, res, upload);
    } finally {
      videoBusy = false;
    }
  }
  res.status(201).json({ path: rel });
};

// Temp files a stopped upload left in any assets folder.
async function removeStaleUploads(root) {
  const entries = await fs
    .readdir(root, { recursive: true, withFileTypes: true })
    .catch(() => []);
  const folders = entries.filter(
    (entry) => entry.isDirectory() && entry.name === "assets",
  );
  await Promise.allSettled(
    folders.map((entry) =>
      removeTempFiles(path.join(entry.parentPath, entry.name)),
    ),
  );
}

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

module.exports = { carryAssets, removeStaleUploads, uploadAsset };
