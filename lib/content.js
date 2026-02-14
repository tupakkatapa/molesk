const fs = require("fs").promises;
const path = require("path");
const RSS = require("rss");
const {
  MD_EXTENSIONS,
  IGNORED_FILES,
  ERROR_MESSAGES,
  escapeHtml,
  capitalize,
} = require("./helpers");
const { parseMetadataOnly } = require("./markdown");

const folderStructureCache = new Map();

async function serveStaticFile(filePath, res) {
  const data = await fs.readFile(filePath);
  const { default: mime } = await import("mime");
  const mimeType = mime.getType(filePath);
  if (!mimeType) {
    throw Object.assign(
      new Error(`Unable to determine MIME type for: ${filePath}`),
      { status: 415 },
    );
  }
  res.setHeader("Content-Type", mimeType);
  res.send(data);
}

async function findIndexFile(directory) {
  const files = await fs.readdir(directory);
  const validFiles = files
    .filter(
      (file) =>
        !file.startsWith(".") &&
        MD_EXTENSIONS.includes(path.extname(file).toLowerCase()),
    )
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  if (validFiles.length === 0) {
    throw new Error(ERROR_MESSAGES.NO_VALID_FILES);
  }
  return path.join(directory, validFiles[0]);
}

async function isDirectoryValid(dirPath) {
  const dirItems = await fs.readdir(dirPath, { withFileTypes: true });
  for (const item of dirItems) {
    if (item.name.startsWith(".")) continue;
    const fullPath = path.join(dirPath, item.name);
    const valid = item.isDirectory()
      ? await isDirectoryValid(fullPath)
      : MD_EXTENSIONS.includes(path.extname(item.name).toLowerCase());
    if (valid) return true;
  }
  return false;
}

function buildFolderItemHtml(item) {
  const safeName = escapeHtml(capitalize(item.name));
  return (
    `<li class="folder open"><span><i class="fas fa-folder-open"></i> ${safeName}</span>` +
    item.content
  );
}

function buildFileItemHtml(item, contentsDir) {
  const itemName = escapeHtml(
    capitalize(path.basename(item.name, path.extname(item.name))),
  );
  const isHome = itemName.toLowerCase() === "home";
  const icon = isHome
    ? '<i class="fas fa-home"></i>'
    : '<i class="fas fa-file-alt"></i>';
  const relPath = path
    .relative(contentsDir, item.path)
    .split(path.sep)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const dateDisplay = item.date
    ? `<div class="file-date">${escapeHtml(item.date)}</div>`
    : "";
  if (isHome) {
    return `<li class="folder"><a href="/content/${relPath}">${icon} ${itemName}</a></li>`;
  }
  return `<li><a href="/content/${relPath}">${icon} ${itemName}</a>${dateDisplay}</li>`;
}

function sortDetailedItems(items) {
  items.sort((a, b) => {
    if (!a.isDirectory && !b.isDirectory) {
      if (!a.date || !b.date) return a.name.localeCompare(b.name);
      return b.date.localeCompare(a.date);
    }
    return a.isDirectory === b.isDirectory
      ? a.name.localeCompare(b.name)
      : a.isDirectory
        ? 1
        : -1;
  });
}

async function collectItems(dir, contentsDir) {
  const items = await fs.readdir(dir, { withFileTypes: true });
  const detailedItems = [];
  for (const item of items) {
    if (item.name.startsWith(".")) continue;
    const baseName = path
      .basename(item.name, path.extname(item.name))
      .toLowerCase();
    if (IGNORED_FILES.includes(baseName)) continue;
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (!(await isDirectoryValid(fullPath))) continue;
      const content = await generateFolderStructure(
        fullPath,
        contentsDir,
        false,
      );
      if (!content.trim() || content.trim() === "<ul></ul>") continue;
      detailedItems.push({
        name: item.name,
        path: fullPath,
        isDirectory: true,
        content,
      });
    } else if (MD_EXTENSIONS.includes(path.extname(item.name).toLowerCase())) {
      const fileContent = await fs.readFile(fullPath, "utf8");
      const metadata = parseMetadataOnly(fileContent);
      detailedItems.push({
        name: item.name,
        path: fullPath,
        isDirectory: false,
        date: metadata.date,
      });
    }
  }
  return detailedItems;
}

async function generateFolderStructure(dir, contentsDir, isRoot = true) {
  if (isRoot && folderStructureCache.has(dir)) {
    return folderStructureCache.get(dir);
  }
  const detailedItems = await collectItems(dir, contentsDir);
  sortDetailedItems(detailedItems);
  const structure = ["<ul>"];
  for (const item of detailedItems) {
    if (item.isDirectory) {
      structure.push(buildFolderItemHtml(item));
    } else {
      structure.push(buildFileItemHtml(item, contentsDir));
    }
  }
  structure.push("</ul>");
  const result = structure.join("");
  if (isRoot) folderStructureCache.set(dir, result);
  return result;
}

async function collectRSSFiles(directory, feed, config) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectRSSFiles(fullPath, feed, config);
    } else if (MD_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
      await addRSSItem(fullPath, entry.name, feed, config);
    }
  }
}

async function addRSSItem(filePath, fileName, feed, config) {
  try {
    const rawData = await fs.readFile(filePath, "utf8");
    const metadata = parseMetadataOnly(rawData);
    const title = fileName
      .replace(/\..+$/, "")
      .split("-")
      .map((word) => capitalize(word))
      .join(" ");
    const relativePath = path
      .relative(config.CONTENTS_DIR, filePath)
      .split(path.sep)
      .join("/");
    const encodedPath = relativePath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const categoryArr = path.dirname(relativePath).split("/").filter(Boolean);
    const category = categoryArr.length > 0 ? categoryArr.join(" > ") : "";
    const baseUrl = `http://${config.HOST}:${config.PORT}`;
    feed.item({
      title,
      description: metadata.description || "A new content piece is available.",
      url: `${baseUrl}/content/${encodedPath}`,
      date: metadata.date || new Date().toISOString(),
      guid: `${baseUrl}/content/${encodedPath}`,
      categories: category ? [category] : [],
    });
  } catch (error) {
    console.error(`Error processing ${filePath} for RSS:`, error.message);
  }
}

async function generateRSSFeed(config) {
  const baseUrl = `http://${config.HOST}:${config.PORT}`;
  const feed = new RSS({
    title: config.TITLE,
    description: `RSS feed for ${config.TITLE}'s content`,
    feed_url: `${baseUrl}/rss.xml`,
    site_url: baseUrl,
    image_url: config.IMAGE,
    pubDate: new Date().toString(),
  });
  await collectRSSFiles(config.CONTENTS_DIR, feed, config);
  return feed.xml({ indent: true });
}

function invalidateCache() {
  folderStructureCache.clear();
}

module.exports = {
  serveStaticFile,
  findIndexFile,
  generateFolderStructure,
  generateRSSFeed,
  invalidateCache,
};
