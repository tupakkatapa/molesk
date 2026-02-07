#!/usr/bin/env node
const express = require("express");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const MarkdownIt = require("markdown-it");
const markdownItAnchor = require("markdown-it-anchor");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const RSS = require("rss");

// Cache ESM mime module (v4 is ESM-only)
const mimePromise = import("mime").then((m) => m.default);

// Constants & Defaults
const IGNORED_FILES = [];
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"];
const MD_EXTENSIONS = [".md", ".txt"];

// Security: HTML entity escaping
const escapeHtml = (str) =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

// Security: Validate path is within allowed directory
const isPathSafe = (basePath, requestedPath) => {
  const resolvedBase = path.resolve(basePath);
  const resolvedPath = path.resolve(path.join(basePath, requestedPath));
  return (
    resolvedPath.startsWith(resolvedBase + path.sep) ||
    resolvedPath === resolvedBase
  );
};

// Error messages
const ERROR_MESSAGES = {
  UNSUPPORTED_FILE: "File type not supported",
  NOT_FOUND: "# 404 Not Found\n\nThe requested resource could not be found.",
  GENERIC_ERROR:
    "# Error\n\nAn unexpected error occurred. Please try again later.",
  NO_VALID_FILES: "No valid files found in the directory",
};

let PORT = 8080;
let HOST = "0.0.0.0";
let CONTENTS_DIR = path.join(__dirname, "contents");
let TITLE = null; // Will default to directory/file name if not set
let IMAGE = "";
const SOCIAL_LINKS = [];
const SOURCE_LINK = "https://github.com/tupakkatapa/molesk";
let SHOW_SOURCE = true;
let SHOW_RSS = true;
let SHOW_DOWNLOAD = true;
let SINGLE_FILE = null; // Path to single file when in viewer mode
let AUTO_OPEN = false;

// --- Helpers ---
// Simple string capitalize
const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

// Async handler wrapper for routes
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Command-line argument parsing
function parseArgs() {
  const args = process.argv.slice(2);
  const positionalArgs = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "-h":
      case "--help":
        displayHelp();
        process.exit(0);
      case "-a":
      case "--address":
        if (args[i + 1]) {
          HOST = args[++i];
        }
        break;
      case "-p":
      case "--port":
        if (args[i + 1]) {
          PORT = parseInt(args[++i], 10);
        }
        break;
      case "-t":
      case "--title":
        if (args[i + 1] && !args[i + 1].startsWith("-")) {
          TITLE = args[++i];
          while (i + 1 < args.length && !args[i + 1].startsWith("-")) {
            TITLE += ` ${args[++i]}`;
          }
        }
        break;
      case "-i":
      case "--image":
        if (args[i + 1]) {
          IMAGE = args[++i];
        }
        break;
      case "-l":
      case "--link":
        i++;
        while (i < args.length && !args[i].startsWith("-")) {
          const splitIndex = args[i].indexOf(":");
          if (splitIndex !== -1) {
            const fab = args[i].substring(0, splitIndex);
            let href = args[i].substring(splitIndex + 1);
            // If the URL does not start with http:// or https://, prepend https://
            if (!href.startsWith("http://") && !href.startsWith("https://")) {
              href = "https://" + href;
            }
            SOCIAL_LINKS.push({ fab, href });
          } else {
            console.error(`Invalid format for --link: ${args[i]}`);
          }
          i++;
        }
        i--; // Adjust index for outer loop
        break;
      case "--no-source":
        SHOW_SOURCE = false;
        break;
      case "--no-rss":
        SHOW_RSS = false;
        break;
      case "--no-download":
        SHOW_DOWNLOAD = false;
        break;
      case "-o":
      case "--open":
        AUTO_OPEN = true;
        break;
      default:
        // Collect positional arguments (files/directories without flags)
        if (!arg.startsWith("-")) {
          positionalArgs.push(arg);
        }
        break;
    }
  }

  // Handle positional argument as file or directory
  if (positionalArgs.length > 0) {
    const target = path.resolve(positionalArgs[0]);
    if (fsSync.existsSync(target)) {
      const stat = fsSync.statSync(target);
      if (
        stat.isFile() &&
        MD_EXTENSIONS.includes(path.extname(target).toLowerCase())
      ) {
        SINGLE_FILE = target;
        CONTENTS_DIR = path.dirname(target);
        AUTO_OPEN = true; // Auto-open for single file viewing
      } else if (stat.isDirectory()) {
        CONTENTS_DIR = target;
      }
    } else {
      console.error(`Error: Path does not exist: ${target}`);
      process.exit(1);
    }
  }
}

function displayHelp() {
  const cmd =
    path.basename(process.argv[1]) === "molesk" ? "molesk" : "node app.js";
  console.log(`Usage: ${cmd} [file.md|directory] [options]

Arguments:
  file.md             Open a single markdown file in viewer mode
  directory           Serve markdown files from directory

Options:
  -h, --help          Display this help information
  -o, --open          Auto-open browser after starting server
  -a, --address       Set the host address (default: '0.0.0.0')
  -p, --port          Set the port number (default: 8080)
  -t, --title         Set the title displayed on the site (default: data source name)
  -i, --image         Set the path to the profile picture
  -l, --link          Add link with icon and URL in the format 'icon:url'
                      (e.g., --link fa-github:https://github.com/username)
  --no-source         Hide source code link in footer
  --no-rss            Hide RSS feed link in footer
  --no-download       Hide download button on content

Examples:
  ${cmd} README.md${" ".repeat(14 - cmd.length)}View single file (opens browser)
  ${cmd} ./docs${" ".repeat(17 - cmd.length)}Serve docs directory
  ${cmd} -o ./blog${" ".repeat(14 - cmd.length)}Serve blog and open browser`);
}

// Open URL in default browser
function openBrowser(url) {
  const { exec } = require("child_process");
  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? "open"
      : platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${cmd} ${url}`);
}

parseArgs();

// Default TITLE to directory/file name if not explicitly set
if (TITLE === null) {
  if (SINGLE_FILE) {
    // Use filename without extension
    TITLE = capitalize(
      path
        .basename(SINGLE_FILE, path.extname(SINGLE_FILE))
        .replace(/[-_]/g, " "),
    );
  } else {
    // Use directory name
    TITLE = capitalize(path.basename(CONTENTS_DIR));
  }
}

// --- Caches ---
const folderStructureCache = new Map();
let rssFeedCache = null;
let profileImageCache = null;

// Watch CONTENTS_DIR for changes and invalidate caches
try {
  fsSync.watch(CONTENTS_DIR, { recursive: true }, () => {
    folderStructureCache.clear();
    rssFeedCache = null;
  });
} catch (err) {
  console.error("Failed to set up file watcher:", err.message);
}

// --- Express App Setup ---
const app = express();
app.disable("x-powered-by");

// Compression middleware (gzip)
app.use(compression());

// Rate limiting (skipped for localhost to allow testing)
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.ip === "127.0.0.1" || req.ip === "::1",
  }),
);

// Security: CSP and other security headers
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
      "script-src 'self' https://cdnjs.cloudflare.com; " +
      // unsafe-inline required for dynamic folder maxHeight animation
      "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; " +
      "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com; " +
      "img-src 'self' data:; " +
      "frame-ancestors 'none';",
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  next();
});

app.use(express.static(path.join(__dirname, "public"), { maxAge: "1h" }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// --- MarkdownIt Setup ---
const md = new MarkdownIt({
  html: false, // Security: Disable raw HTML to prevent XSS
  typographer: true,
  linkify: true,
}).use(markdownItAnchor, {
  permalink: markdownItAnchor.permalink.headerLink(),
  slugify: (s) =>
    encodeURIComponent(String(s).trim().toLowerCase().replace(/\s+/g, "-")),
  level: 1,
});

// Load plugins with proper initialization
const loadPlugin = (name, ...args) => {
  try {
    const plugin = require(name);
    // Handle different module export patterns
    if (name === "markdown-it-emoji") {
      // markdown-it-emoji v3.x exports an object with different presets
      const pluginFn = plugin.full || plugin.default || plugin;
      md.use(pluginFn, ...args);
    } else {
      const pluginFn = plugin.default || plugin;
      md.use(pluginFn, ...args);
    }
  } catch (err) {
    console.error(`Failed to load plugin ${name}:`, err.message);
  }
};

loadPlugin("markdown-it-highlightjs");
loadPlugin("markdown-it-emoji");
loadPlugin("markdown-it-sub");
loadPlugin("markdown-it-ins");
loadPlugin("markdown-it-mark");
loadPlugin("markdown-it-expandable");
loadPlugin("markdown-it-footnote");
loadPlugin("markdown-it-deflist");
loadPlugin("markdown-it-container", "warning");
loadPlugin("markdown-it-container", "info");
loadPlugin("markdown-it-abbr");
loadPlugin("markdown-it-collapsible");

// Middleware to detect AJAX requests
app.use((req, res, next) => {
  req.isAjaxRequest = req.xhr;
  next();
});

// Helper: serve static files (images, etc.)
async function serveStaticFile(filePath, res) {
  const data = await fs.readFile(filePath);
  const mime = await mimePromise;
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

// --- Routes ---

// Download route for markdown/text files
app.get(
  "/download/:path(*)",
  asyncHandler(async (req, res) => {
    // Security: Validate path traversal
    if (!isPathSafe(CONTENTS_DIR, req.params.path)) {
      return res.status(403).send("Access denied");
    }
    const filePath = path.join(CONTENTS_DIR, req.params.path);
    if (!MD_EXTENSIONS.includes(path.extname(filePath).toLowerCase())) {
      return res.status(400).send(ERROR_MESSAGES.UNSUPPORTED_FILE);
    }
    await fs.access(filePath);
    const prefix = TITLE.toLowerCase().replace(/\s+/g, "_");
    const filename = path.basename(filePath).toLowerCase().replace(/\s+/g, "_");
    const downloadName = `${prefix}_${filename}`;
    res.download(filePath, downloadName);
  }),
);

// Serve profile image (cached in memory)
app.get(
  "/profile-pic",
  asyncHandler(async (req, res) => {
    if (!IMAGE) return res.status(404).send("Image not found");
    if (!profileImageCache) {
      const data = await fs.readFile(IMAGE);
      const mime = await mimePromise;
      profileImageCache = {
        data,
        mimeType: mime.getType(IMAGE) || "image/png",
      };
    }
    res.setHeader("Content-Type", profileImageCache.mimeType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(profileImageCache.data);
  }),
);

// Serve circular favicon from profile image (cached in memory)
let faviconSvgCache = null;
app.get(
  "/favicon.svg",
  asyncHandler(async (req, res) => {
    if (!IMAGE) return res.status(404).send("Favicon not found");
    if (!faviconSvgCache) {
      const data = await fs.readFile(IMAGE);
      const mime = await mimePromise;
      const mimeType = mime.getType(IMAGE) || "image/png";
      const base64 = data.toString("base64");
      faviconSvgCache = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><clipPath id="c"><circle cx="50" cy="50" r="50"/></clipPath></defs>
<image href="data:${mimeType};base64,${base64}" width="100" height="100" clip-path="url(#c)" preserveAspectRatio="xMidYMid slice"/>
</svg>`;
    }
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(faviconSvgCache);
  }),
);

// Handle favicon.ico requests - redirect to SVG or return empty
app.get("/favicon.ico", (req, res) => {
  if (IMAGE) {
    return res.redirect(301, "/favicon.svg");
  }
  res.status(204).end();
});

// Utility: find the first markdown file in a directory
async function findIndexFile(directory) {
  const files = await fs.readdir(directory);
  const validFiles = files
    .filter(
      (file) =>
        !file.startsWith(".") &&
        MD_EXTENSIONS.includes(path.extname(file).toLowerCase()),
    )
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  if (!validFiles.length) throw new Error(ERROR_MESSAGES.NO_VALID_FILES);
  return path.join(directory, validFiles[0]);
}

// Root: redirect to first markdown content
app.get(
  "/",
  asyncHandler(async (req, res) => {
    const filePath = await findIndexFile(CONTENTS_DIR);
    const relativePath = path.relative(CONTENTS_DIR, filePath);
    res.redirect(`/content/${relativePath}`);
  }),
);

// Content route: serve markdown/text or image files
app.get(
  "/content/:path(*)",
  asyncHandler(async (req, res) => {
    // Security: Validate path traversal
    if (!isPathSafe(CONTENTS_DIR, req.params.path)) {
      return res.status(403).send("Access denied");
    }
    const filePath = path.join(CONTENTS_DIR, req.params.path);
    const ext = path.extname(filePath).toLowerCase();

    if (IMAGE_EXTENSIONS.includes(ext)) {
      return serveStaticFile(filePath, res);
    } else if (MD_EXTENSIONS.includes(ext)) {
      const rawData = await fs.readFile(filePath, "utf8");
      const { content, metadata } = await parseFileContent(rawData, filePath);
      const outputContent = metadataToHtml(metadata) + content;
      const relativePath = path.relative(CONTENTS_DIR, filePath);
      const title =
        capitalize(path.basename(filePath, ext).replace(/[-_]/g, " ")) +
        " - " +
        TITLE;

      if (req.isAjaxRequest) {
        res.setHeader("Content-Type", "text/html");
        return res.send(outputContent);
      }
      res.render("index", {
        folderStructure: SINGLE_FILE
          ? ""
          : await generateFolderStructure(CONTENTS_DIR),
        initialContent: outputContent,
        title: TITLE,
        image: IMAGE,
        socialLinks: SOCIAL_LINKS,
        sourceLink: SHOW_SOURCE ? SOURCE_LINK : null,
        showRss: SHOW_RSS,
        showDownload: SHOW_DOWNLOAD,
        relativePath,
        pageTitle: title,
        singleFile: !!SINGLE_FILE,
      });
    } else {
      throw Object.assign(
        new Error(`Unsupported file extension: ${filePath}`),
        { status: 400 },
      );
    }
  }),
);

// Utility: generate RSS feed from markdown files
async function generateRSSFeed() {
  try {
    const feed = new RSS({
      title: TITLE,
      description: `RSS feed for ${TITLE}'s content`,
      feed_url: `http://${HOST}:${PORT}/rss.xml`,
      site_url: `http://${HOST}:${PORT}`,
      image_url: IMAGE,
      pubDate: new Date().toString(),
    });

    async function findMarkdownFiles(directory) {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await findMarkdownFiles(fullPath);
        } else if (
          MD_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())
        ) {
          await processMarkdownFile(fullPath, entry.name);
        }
      }
    }

    async function processMarkdownFile(filePath, fileName) {
      try {
        const rawData = await fs.readFile(filePath, "utf8");
        const metadata = parseMetadataOnly(rawData);
        const title = fileName
          .replace(/\..+$/, "")
          .split("-")
          .map((word) => capitalize(word))
          .join(" ");
        const relativePath = path
          .relative(CONTENTS_DIR, filePath)
          .split(path.sep)
          .join("/");
        const encodedPath = relativePath
          .split("/")
          .map(encodeURIComponent)
          .join("/");
        const categoryArr = path
          .dirname(relativePath)
          .split("/")
          .filter(Boolean);
        const category = categoryArr.length ? categoryArr.join(" > ") : "";
        feed.item({
          title,
          description:
            metadata.description || "A new content piece is available.",
          url: `http://${HOST}:${PORT}/content/${encodedPath}`,
          date: metadata.date || new Date().toISOString(),
          guid: `http://${HOST}:${PORT}/content/${encodedPath}`,
          categories: category ? [category] : [],
        });
      } catch (error) {
        console.error(`Error processing ${filePath} for RSS:`, error.message);
      }
    }

    await findMarkdownFiles(CONTENTS_DIR);
    return feed.xml({ indent: true });
  } catch (error) {
    console.error("RSS Feed generation error:", error);
    // Only provide fallback for specific cases, otherwise let the error bubble up
    if (error.code === "ENOENT" && error.message.includes(CONTENTS_DIR)) {
      // Contents directory doesn't exist - return empty but valid RSS
      const fallbackFeed = new RSS({
        title: TITLE,
        description: `RSS feed for ${TITLE}'s content (no content available)`,
        feed_url: `http://${HOST}:${PORT}/rss.xml`,
        site_url: `http://${HOST}:${PORT}`,
      });
      return fallbackFeed.xml({ indent: true });
    }
    // For other errors, let them bubble up so tests catch real problems
    throw error;
  }
}

// RSS feed route (server-side cached, invalidated by fs.watch)
app.get(
  "/rss.xml",
  asyncHandler(async (req, res) => {
    try {
      if (!rssFeedCache) {
        rssFeedCache = await generateRSSFeed();
      }
      res.header("Content-Type", "application/rss+xml");
      res.header("Cache-Control", "public, max-age=300");
      res.send(rssFeedCache);
    } catch (error) {
      console.error("RSS route error:", error);
      rssFeedCache = null;
      res.status(500).send("RSS feed temporarily unavailable");
    }
  }),
);

// --- Error Handling ---

// 404 handler
app.use((req, res, next) => {
  const err = new Error("Not Found");
  err.status = 404;
  next(err);
});

// General error handler: render error using Markdown
app.use(async (err, req, res, next) => {
  await handleError(res, err);
});

async function handleError(res, err) {
  console.error(err);
  let statusCode = err.status || 500;
  let message;
  if (statusCode === 404 || err.code === "ENOENT") {
    statusCode = 404;
    message = ERROR_MESSAGES.NOT_FOUND;
  } else if (
    err.message &&
    err.message.includes("Unsupported file extension")
  ) {
    statusCode = 400;
    message = ERROR_MESSAGES.UNSUPPORTED_FILE;
  } else {
    message = ERROR_MESSAGES.GENERIC_ERROR;
  }
  const markdownError = md.render(message);
  let folderStructure = "<ul></ul>";
  try {
    folderStructure = await generateFolderStructure(CONTENTS_DIR);
  } catch (e) {
    console.error("Failed to generate folder structure for error page:", e);
  }
  res.status(statusCode).render("index", {
    folderStructure,
    initialContent: markdownError,
    title: TITLE,
    image: IMAGE,
    socialLinks: SOCIAL_LINKS,
    sourceLink: SHOW_SOURCE ? SOURCE_LINK : null,
    showRss: SHOW_RSS,
    showDownload: SHOW_DOWNLOAD,
    pageTitle: statusCode.toString() + " - " + TITLE,
  });
}

// --- Markdown Utilities ---
// Extract only YAML frontmatter metadata without rendering markdown
function parseMetadataOnly(data) {
  const fmMatch = data.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const frontMatter = yaml.load(fmMatch[1]) || {};
    return { date: frontMatter.date, description: frontMatter.description };
  }
  return {};
}

async function parseFileContent(data, filePath) {
  const fmMatch = data.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (fmMatch) {
    const frontMatter = yaml.load(fmMatch[1]) || {};
    return {
      content: md.render(fmMatch[2]),
      metadata: { date: frontMatter.date },
    };
  } else {
    return { content: md.render(data), metadata: {} };
  }
}

function metadataToHtml(meta) {
  // Security: Escape date to prevent XSS
  return meta.date
    ? `<div class="metadata"><span class="meta-date">${escapeHtml(meta.date)}</span></div>`
    : "";
}

async function generateFolderStructure(dir, isRoot = true) {
  if (isRoot && folderStructureCache.has(dir)) {
    return folderStructureCache.get(dir);
  }

  const items = await fs.readdir(dir, { withFileTypes: true });
  const structure = ["<ul>"];
  const detailedItems = [];

  async function isDirectoryValid(dirPath) {
    const dirItems = await fs.readdir(dirPath, { withFileTypes: true });
    for (const item of dirItems) {
      if (!item.name.startsWith(".")) {
        const fullPath = path.join(dirPath, item.name);
        if (
          item.isDirectory()
            ? await isDirectoryValid(fullPath)
            : MD_EXTENSIONS.includes(path.extname(item.name).toLowerCase())
        ) {
          return true;
        }
      }
    }
    return false;
  }

  for (const item of items) {
    if (item.name.startsWith(".")) continue;
    const baseName = path
      .basename(item.name, path.extname(item.name))
      .toLowerCase();
    if (IGNORED_FILES.includes(baseName)) continue;
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (!(await isDirectoryValid(fullPath))) continue;
      const content = await generateFolderStructure(fullPath, false);
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

  detailedItems.sort((a, b) => {
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

  for (const item of detailedItems) {
    if (item.isDirectory) {
      // Security: Escape folder name to prevent XSS
      const safeFolderName = escapeHtml(capitalize(item.name));
      structure.push(
        `<li class="folder open"><span><i class="fas fa-folder-open"></i> ${safeFolderName}</span>`,
      );
      structure.push(item.content);
    } else {
      // Security: Escape file name to prevent XSS
      const itemName = escapeHtml(
        capitalize(path.basename(item.name, path.extname(item.name))),
      );
      const icon =
        itemName.toLowerCase() === "home"
          ? '<i class="fas fa-home"></i>'
          : '<i class="fas fa-file-alt"></i>';
      const relPath = path
        .relative(CONTENTS_DIR, item.path)
        .split(path.sep)
        .map(encodeURIComponent)
        .join("/");
      // Security: Escape date to prevent XSS
      const dateDisplay = item.date
        ? `<div class="file-date">${escapeHtml(item.date)}</div>`
        : "";

      if (itemName.toLowerCase() === "home") {
        structure.push(
          `<li class="folder"><a href="/content/${relPath}">${icon} ${itemName}</a></li>`,
        );
      } else {
        structure.push(
          `<li><a href="/content/${relPath}">${icon} ${itemName}</a>${dateDisplay}</li>`,
        );
      }
    }
  }
  structure.push("</ul>");
  const result = structure.join("");
  if (isRoot) {
    folderStructureCache.set(dir, result);
  }
  return result;
}

// Global error logging
process.on("uncaughtException", (err) =>
  console.error("Uncaught exception:", err),
);
process.on("unhandledRejection", (reason, promise) =>
  console.error("Unhandled rejection:", promise, "reason:", reason),
);

app.listen(PORT, HOST, () => {
  const url = `http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`;
  console.log(`Running on ${url}`);
  if (AUTO_OPEN) {
    const openUrl = SINGLE_FILE
      ? `${url}/content/${encodeURIComponent(path.basename(SINGLE_FILE))}`
      : url;
    openBrowser(openUrl);
  }
});
