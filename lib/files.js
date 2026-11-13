const crypto = require("crypto");
const fs = require("fs").promises;
const path = require("path");
const {
  MEDIA_EXTENSIONS,
  isPathSafe,
  MD_EXTENSIONS,
  TRASH,
} = require("./helpers");

const MAX_SEGMENT_BYTES = 255;
// New names leave room for the trash and conflict-copy suffixes.
const MAX_NEW_NAME_BYTES = 200;
const MISSING = new Set(["ENOENT", "ENOTDIR"]);
const TEMP = /^\.molesk-[0-9a-f]+\.tmp$/u;

const httpError = (status, message) =>
  Object.assign(new Error(message), { status, expose: true });

const etagOf = (data) =>
  `"sha256-${crypto.createHash("sha256").update(data).digest("hex")}"`;

const isValidSegment = (segment) =>
  segment !== "" &&
  !segment.startsWith(".") &&
  Buffer.byteLength(segment) <= MAX_SEGMENT_BYTES &&
  ![...segment].some((char) => char.codePointAt(0) < 32 || char === "\u007F");

async function nearestExistingRealpath(file) {
  let current = file;
  for (;;) {
    try {
      return await fs.realpath(current);
    } catch (err) {
      if (!MISSING.has(err.code)) throw err;
      current = path.dirname(current);
    }
  }
}

async function isInside(root, file) {
  const realRoot = await fs.realpath(root);
  const real = await nearestExistingRealpath(file);
  return real === realRoot || real.startsWith(realRoot + path.sep);
}

// A path with one of `extensions`, or with `folder` any path, inside root
// and not hidden.
async function resolveWritable(
  root,
  rel,
  { folder = false, extensions = MD_EXTENSIONS } = {},
) {
  if (typeof rel !== "string") throw httpError(400, "Path required");
  if (!isPathSafe(root, rel)) throw httpError(403, "Access denied");
  const segments = rel.split("/");
  if (!segments.every((segment) => isValidSegment(segment)))
    throw httpError(400, "Invalid path");
  const ext = path.extname(segments.at(-1)).toLowerCase();
  if (!folder && !extensions.includes(ext)) {
    throw httpError(400, "Unsupported file type");
  }
  const file = path.join(root, ...segments);
  if (!(await isInside(root, file))) throw httpError(403, "Access denied");
  return file;
}

function checkNewName(rel) {
  if (Buffer.byteLength(path.basename(rel)) > MAX_NEW_NAME_BYTES) {
    throw httpError(400, `Names can be at most ${MAX_NEW_NAME_BYTES} bytes`);
  }
}

const notFound = () => Object.assign(new Error("Not Found"), { status: 404 });

// A path the read routes may serve: never hidden, in single-file mode only
// that note and media, and in edit mode not through symlinks out of the
// notes. Read-only mode follows symlinks, which only the operator can place.
async function resolveReadable(config, rel) {
  const root = config.CONTENTS_DIR;
  if (!isPathSafe(root, rel)) throw httpError(403, "Access denied");
  if (rel.split("/").some((segment) => segment.startsWith("."))) {
    throw notFound();
  }
  const ext = path.extname(rel).toLowerCase();
  if (
    config.SINGLE_FILE &&
    rel !== path.basename(config.SINGLE_FILE) &&
    !MEDIA_EXTENSIONS.includes(ext)
  ) {
    throw notFound();
  }
  const file = path.join(root, rel);
  if (config.EDIT && !(await isInside(root, file))) throw notFound();
  return file;
}

async function readCurrent(file) {
  try {
    return await fs.readFile(file);
  } catch (err) {
    if (MISSING.has(err.code)) return null;
    throw err;
  }
}

// The rename already happened, so a failed folder sync only risks the entry
// on power loss; the write is reported as done.
async function fsyncDir(dir) {
  try {
    const handle = await fs.open(dir, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (err) {
    console.warn(`Warning: couldn't sync folder ${dir}: ${err.message}`);
  }
}

async function writeAtomic(file, data) {
  const dir = path.dirname(file);
  const suffix = crypto.randomBytes(6).toString("hex");
  const tmp = path.join(dir, `.molesk-${suffix}.tmp`);
  const mode = await fs.stat(file).then(
    (stat) => stat.mode & 0o7777,
    () => null,
  );
  try {
    const handle = await fs.open(tmp, "wx");
    try {
      await handle.writeFile(data);
      if (mode !== null) await handle.chmod(mode);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
  await fsyncDir(dir);
}

const removeTempFiles = async (dir) => {
  const names = await fs.readdir(dir).catch(() => []);
  const stale = names.filter((name) => TEMP.test(name));
  await Promise.all(stale.map((name) => fs.rm(path.join(dir, name))));
};

// ponytail: one lock for every write, fine for a single-user notes app;
// writers outside this process are caught by the ETag precondition, not
// serialised.
let writeTail = Promise.resolve();
function withWriteLock(fn) {
  const run = writeTail.then(fn);
  writeTail = run.catch(() => {});
  return run;
}

const statOf = (file) =>
  fs.lstat(file).catch((err) => {
    if (MISSING.has(err.code)) return null;
    throw err;
  });

// Cuts `name` by whole characters until it fits a segment with `suffix`.
function fitName(name, suffix) {
  const chars = [...name];
  while (Buffer.byteLength(chars.join("") + suffix) > MAX_SEGMENT_BYTES) {
    chars.pop();
  }
  return chars.join("") + suffix;
}

// Trash names keep the note's folder and a filesystem-safe timestamp, with
// a counter when the same note is trashed twice in one millisecond.
async function trashTarget(root, rel) {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const dir = path.join(root, TRASH, path.dirname(rel));
  for (let n = 0; ; n++) {
    const suffix = `~${stamp}${n ? `-${n}` : ""}`;
    const candidate = path.join(dir, fitName(path.basename(rel), suffix));
    if (!(await statOf(candidate))) return candidate;
  }
}

async function copyToTrash(root, rel, data) {
  const target = await trashTarget(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await writeAtomic(target, data);
}

async function moveToTrash(root, rel, file) {
  const target = await trashTarget(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.rename(file, target);
  await fsyncDir(path.dirname(file));
}

function checkPrecondition(req, current) {
  const ifMatch = req.get("If-Match");
  const ifNoneMatch = req.get("If-None-Match");
  if (ifNoneMatch === "*") {
    if (current !== null) throw httpError(412, "File already exists");
    return;
  }
  if (!ifMatch) throw httpError(428, "If-Match or If-None-Match required");
  if (current === null) throw httpError(412, "File no longer exists");
  if (ifMatch !== "*" && ifMatch !== etagOf(current)) {
    throw httpError(412, "File changed elsewhere");
  }
}

module.exports = {
  notFound,
  checkNewName,
  checkPrecondition,
  copyToTrash,
  etagOf,
  fsyncDir,
  httpError,
  moveToTrash,
  readCurrent,
  removeTempFiles,
  resolveReadable,
  resolveWritable,
  statOf,
  withWriteLock,
  writeAtomic,
};
