#!/usr/bin/env node
const express = require("express");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const {
  asyncHandler,
  capitalize,
  isPathSafe,
  IMAGE_EXTENSIONS,
  MD_EXTENSIONS,
  ERROR_MESSAGES,
} = require("./lib/helpers");
const { parseArgs, openBrowser } = require("./lib/cli");
const { parseFileContent, metadataToHtml } = require("./lib/markdown");
const {
  serveStaticFile,
  findIndexFile,
  generateFolderStructure,
  generateRSSFeed,
  invalidateCache,
} = require("./lib/content");
const { setupErrorHandlers } = require("./lib/errors");

// Configuration
const config = {
  PORT: 8080,
  HOST: "0.0.0.0",
  CONTENTS_DIR: path.join(__dirname, "contents"),
  TITLE: null,
  IMAGE: "",
  SOCIAL_LINKS: [],
  SOURCE_LINK: "https://github.com/tupakkatapa/molesk",
  SHOW_SOURCE: true,
  SHOW_RSS: true,
  SHOW_DOWNLOAD: true,
  SINGLE_FILE: null,
  AUTO_OPEN: false,
};

parseArgs(config);

// Default TITLE to directory/file name if not explicitly set
if (config.TITLE === null) {
  config.TITLE = config.SINGLE_FILE
    ? capitalize(
        path
          .basename(config.SINGLE_FILE, path.extname(config.SINGLE_FILE))
          .replaceAll(/[-_]/g, " "),
      )
    : capitalize(path.basename(config.CONTENTS_DIR));
}

// Caches
let rssFeedCache = null;
let profileImageCache = null;
let faviconSvgCache = null;

// Watch CONTENTS_DIR for changes and invalidate caches
try {
  fsSync.watch(config.CONTENTS_DIR, { recursive: true }, () => {
    invalidateCache();
    rssFeedCache = null;
  });
} catch (err) {
  console.error("Failed to set up file watcher:", err.message);
}

// Express App Setup
const app = express();
app.disable("x-powered-by");
app.use(compression());

// Rate limiting (skipped for localhost to allow testing)
app.use(
  rateLimit({
    // 15 minutes
    windowMs: 15 * 60 * 1000,
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

// AJAX detection middleware
app.use((req, res, next) => {
  req.isAjaxRequest = req.xhr;
  next();
});

// --- Routes ---

// Download markdown/text files
app.get(
  "/download/:path(*)",
  asyncHandler(async (req, res) => {
    if (!isPathSafe(config.CONTENTS_DIR, req.params.path)) {
      return res.status(403).send("Access denied");
    }
    const filePath = path.join(config.CONTENTS_DIR, req.params.path);
    if (!MD_EXTENSIONS.includes(path.extname(filePath).toLowerCase())) {
      return res.status(400).send(ERROR_MESSAGES.UNSUPPORTED_FILE);
    }
    await fs.access(filePath);
    const prefix = config.TITLE.toLowerCase().replaceAll(/\s+/g, "_");
    const filename = path
      .basename(filePath)
      .toLowerCase()
      .replaceAll(/\s+/g, "_");
    res.download(filePath, `${prefix}_${filename}`);
  }),
);

// Serve profile image (cached in memory)
app.get(
  "/profile-pic",
  asyncHandler(async (req, res) => {
    if (!config.IMAGE) return res.status(404).send("Image not found");
    if (!profileImageCache) {
      const data = await fs.readFile(config.IMAGE);
      const { default: mime } = await import("mime");
      profileImageCache = {
        data,
        mimeType: mime.getType(config.IMAGE) || "image/png",
      };
    }
    res.setHeader("Content-Type", profileImageCache.mimeType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(profileImageCache.data);
  }),
);

// Serve circular favicon from profile image (cached in memory)
app.get(
  "/favicon.svg",
  asyncHandler(async (req, res) => {
    if (!config.IMAGE) return res.status(404).send("Favicon not found");
    if (!faviconSvgCache) {
      const data = await fs.readFile(config.IMAGE);
      const { default: mime } = await import("mime");
      const mimeType = mime.getType(config.IMAGE) || "image/png";
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

// Handle favicon.ico requests
app.get("/favicon.ico", (req, res) => {
  if (config.IMAGE) {
    return res.redirect(301, "/favicon.svg");
  }
  res.status(204).end();
});

// Root: redirect to first markdown content
app.get(
  "/",
  asyncHandler(async (req, res) => {
    const filePath = await findIndexFile(config.CONTENTS_DIR);
    const relativePath = path.relative(config.CONTENTS_DIR, filePath);
    res.redirect(`/content/${relativePath}`);
  }),
);

// Content route: serve markdown/text or image files
app.get(
  "/content/:path(*)",
  asyncHandler(async (req, res) => {
    if (!isPathSafe(config.CONTENTS_DIR, req.params.path)) {
      return res.status(403).send("Access denied");
    }
    const filePath = path.join(config.CONTENTS_DIR, req.params.path);
    const ext = path.extname(filePath).toLowerCase();
    if (IMAGE_EXTENSIONS.includes(ext)) {
      return serveStaticFile(filePath, res);
    }
    if (!MD_EXTENSIONS.includes(ext)) {
      throw Object.assign(
        new Error(`Unsupported file extension: ${filePath}`),
        { status: 400 },
      );
    }
    const rawData = await fs.readFile(filePath, "utf8");
    const { content, metadata } = parseFileContent(rawData);
    const outputContent = metadataToHtml(metadata) + content;
    const relativePath = path.relative(config.CONTENTS_DIR, filePath);
    const title =
      capitalize(path.basename(filePath, ext).replaceAll(/[-_]/g, " ")) +
      " - " +
      config.TITLE;
    if (req.isAjaxRequest) {
      res.setHeader("Content-Type", "text/html");
      return res.send(outputContent);
    }
    res.render("index", {
      folderStructure: config.SINGLE_FILE
        ? ""
        : await generateFolderStructure(
            config.CONTENTS_DIR,
            config.CONTENTS_DIR,
          ),
      initialContent: outputContent,
      title: config.TITLE,
      image: config.IMAGE,
      socialLinks: config.SOCIAL_LINKS,
      sourceLink: config.SHOW_SOURCE ? config.SOURCE_LINK : null,
      showRss: config.SHOW_RSS,
      showDownload: config.SHOW_DOWNLOAD,
      relativePath,
      pageTitle: title,
      singleFile: !!config.SINGLE_FILE,
    });
  }),
);

// RSS feed route (server-side cached, invalidated by fs.watch)
app.get(
  "/rss.xml",
  asyncHandler(async (req, res) => {
    try {
      if (!rssFeedCache) {
        rssFeedCache = await generateRSSFeed(config);
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

// Error handling
setupErrorHandlers(app, config);

// Global error logging
process.on("uncaughtException", (err) =>
  console.error("Uncaught exception:", err),
);
process.on("unhandledRejection", (reason, promise) =>
  console.error("Unhandled rejection:", promise, "reason:", reason),
);

app.listen(config.PORT, config.HOST, () => {
  const url = `http://${config.HOST === "0.0.0.0" ? "localhost" : config.HOST}:${config.PORT}`;
  console.log(`Running on ${url}`);
  if (config.AUTO_OPEN) {
    const openUrl = config.SINGLE_FILE
      ? `${url}/content/${encodeURIComponent(path.basename(config.SINGLE_FILE))}`
      : url;
    openBrowser(openUrl);
  }
});
