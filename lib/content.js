const fs = require("fs").promises;
const path = require("path");
const {
  MD_EXTENSIONS,
  formatDay,
  byDateThenName,
  byName,
  noteTitle,
  isPathSafe,
} = require("./helpers");
const {
  excerptOf,
  isPublished,
  parseMetadataOnly,
  splitFrontMatter,
} = require("./markdown");
const { pageHref } = require("../public/slug.mjs");
const { expiring } = require("./cache");

// Entries can vanish between readdir and read while notes are being edited,
// and one unreadable entry must not take the rest of the site down with it.
const UNREADABLE = new Set(["EACCES", "EPERM", "ELOOP", "ENOTDIR"]);
const warned = new Set();
const ignoreMissing = (fallback) => (err) => {
  if (err.code === "ENOENT") return fallback;
  if (!UNREADABLE.has(err.code)) throw err;
  if (!warned.has(err.path)) {
    warned.add(err.path);
    console.warn(`Skipping unreadable ${err.path}: ${err.code}`);
  }
  return fallback;
};

const isNote = (name) =>
  MD_EXTENSIONS.includes(path.extname(name).toLowerCase());

const HOME_NAMES = ["index.md", "readme.md", "home.md"];
const FOLDER_INDEX_NAMES = ["index.md", "readme.md"];

const isPublishedFile = async (config, file) =>
  config.EDIT ||
  isPublished(
    parseMetadataOnly(await fs.readFile(file, "utf8").catch(ignoreMissing(""))),
    config,
  );

async function findNamed(config, dir, names) {
  const files = await fs.readdir(dir).catch(ignoreMissing([]));
  for (const name of names) {
    const match = files.find((file) => file.toLowerCase() === name);
    if (match && (await isPublishedFile(config, path.join(dir, match)))) {
      return match;
    }
  }
  return null;
}

// Home note relative to the data dir, or null for none.
async function findHome(config) {
  if (config.SINGLE_FILE) return path.basename(config.SINGLE_FILE);
  if (config.HOME === false) return null;
  if (config.HOME === null) {
    return findNamed(config, config.CONTENTS_DIR, HOME_NAMES);
  }
  if (!isPathSafe(config.CONTENTS_DIR, config.HOME)) return null;
  const file = path.join(config.CONTENTS_DIR, config.HOME);
  const exists = await fs.access(file).then(
    () => true,
    () => false,
  );
  return exists && (await isPublishedFile(config, file))
    ? path.relative(config.CONTENTS_DIR, file)
    : null;
}

const findFolderIndex = (config, dir) =>
  findNamed(config, dir, FOLDER_INDEX_NAMES);

async function findFirstNote(config, directory) {
  const files = await fs.readdir(directory).catch(ignoreMissing([]));
  const notes = files
    .filter((file) => !file.startsWith(".") && isNote(file))
    .sort(byName);
  for (const note of notes) {
    const file = path.join(directory, note);
    if (await isPublishedFile(config, file)) return file;
  }
  return null;
}

// A folder holds published notes somewhere below; in edit mode a folder
// with no entries besides dotfiles counts too.
async function isDirectoryValid(config, dirPath) {
  const dirItems = (
    await fs.readdir(dirPath, { withFileTypes: true }).catch(ignoreMissing([]))
  ).filter((item) => !item.name.startsWith("."));
  if (config.EDIT && dirItems.length === 0) return true;
  for (const item of dirItems) {
    const full = path.join(dirPath, item.name);
    const valid = item.isDirectory()
      ? await isDirectoryValid(config, full)
      : isNote(item.name) && (await isPublishedFile(config, full));
    if (valid) return true;
  }
  return false;
}

async function describeNote(fullPath, name) {
  const text = await fs.readFile(fullPath, "utf8").catch(ignoreMissing(null));
  if (text === null) return null;
  const { meta, body } = splitFrontMatter(text);
  return {
    name,
    path: fullPath,
    isDirectory: false,
    date: meta.date,
    draft: meta.draft,
    excerpt: meta.description || excerptOf(body),
  };
}

// One folder's published notes and the subfolders that hold any (see
// isDirectoryValid); `hide` holds full paths to skip.
async function listFolder(config, dir, { hide = [] } = {}) {
  const entries = await fs
    .readdir(dir, { withFileTypes: true })
    .catch(ignoreMissing([]));
  const items = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (hide.includes(fullPath)) continue;
    if (entry.isDirectory()) {
      if (await isDirectoryValid(config, fullPath)) {
        items.push({ name: entry.name, path: fullPath, isDirectory: true });
      }
    } else if (isNote(entry.name)) {
      const note = await describeNote(fullPath, entry.name);
      if (note && isPublished(note, config)) items.push(note);
    }
  }
  return items;
}

function sortDetailedItems(items) {
  items.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? 1 : -1;
    return a.isDirectory ? byName(a.name, b.name) : byDateThenName(a, b);
  });
}

// The sidebar tree: notes (dated ones newest first) above folders.
async function buildTree(config, dir, options) {
  const root = config.CONTENTS_DIR;
  const items = await listFolder(config, dir, options);
  sortDetailedItems(items);
  return Promise.all(
    items.map(async (item) => {
      const rel = path.relative(root, item.path).split(path.sep).join("/");
      const node = { title: noteTitle(item.name), path: rel };
      if (item.isDirectory) {
        return {
          ...node,
          folder: true,
          children: await buildTree(config, item.path, options),
        };
      }
      return {
        ...node,
        href: pageHref(rel),
        date: item.date,
        day: formatDay(item.date),
        draft: item.draft,
      };
    }),
  );
}

let tree = null;
function generateFolderStructure(config) {
  if (config.SINGLE_FILE) return Promise.resolve([]);
  const root = config.CONTENTS_DIR;
  tree ??= expiring(() =>
    findHome(config).then((home) =>
      buildTree(config, root, { hide: home ? [path.join(root, home)] : [] }),
    ),
  );
  return tree.get();
}

const invalidateCache = () => tree?.invalidate();
const unreadableCount = () => warned.size;

// Every note below `dir` relative to the data dir, hidden paths left out;
// in single-file mode only that note.
async function walkNotes(config, dir = config.CONTENTS_DIR, notes = []) {
  if (config.SINGLE_FILE) return [path.basename(config.SINGLE_FILE)];
  const entries = await fs
    .readdir(dir, { withFileTypes: true })
    .catch(ignoreMissing([]));
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walkNotes(config, full, notes);
    else if (isNote(entry.name)) {
      notes.push(path.relative(config.CONTENTS_DIR, full));
    }
  }
  return notes;
}

module.exports = {
  findFirstNote,
  findFolderIndex,
  findHome,
  generateFolderStructure,
  isNote,
  listFolder,
  walkNotes,
  invalidateCache,
  unreadableCount,
};
