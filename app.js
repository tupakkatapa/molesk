#!/usr/bin/env node
const express = require("express");
const compression = require("compression");
const path = require("path");
const { capitalize } = require("./lib/helpers");
const { defaultConfig, parseArgs, openBrowser } = require("./lib/cli");
const { editRouter } = require("./lib/edit");
const { basicAuth, knownHost } = require("./lib/auth");
const { invalidateCache } = require("./lib/content");
const { rssRoute } = require("./lib/rss");
const { setupErrorHandlers } = require("./lib/errors");
const { pageHref } = require("./public/slug.mjs");
const { pageRouter } = require("./lib/pages");
const { sitemapRoute } = require("./lib/publish");
const { searchRoute } = require("./lib/search");
const { invalidateSite } = require("./lib/site");
const { checkLinks } = require("./lib/check");
const { tagRouter } = require("./lib/tags");
const { createHistory } = require("./lib/history");
const { withWriteLock } = require("./lib/files");
const { securityHeaders } = require("./lib/headers");

const config = parseArgs(defaultConfig());

// Default TITLE to directory/file name if not explicitly set
if (config.TITLE === null) {
  config.TITLE = config.SINGLE_FILE
    ? capitalize(
        path
          .basename(config.SINGLE_FILE, path.extname(config.SINGLE_FILE))
          .replaceAll(/[-_]/gu, " "),
      )
    : capitalize(path.basename(config.CONTENTS_DIR));
}

const history = config.GIT ? createHistory(config.CONTENTS_DIR) : null;

const invalidateAll = () => {
  invalidateCache();
  invalidateSite();
  history?.touch();
};

// Express App Setup
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", "loopback, uniquelocal");
app.use(compression());

app.use(securityHeaders);

if (config.EDIT || config.AUTH) app.use(knownHost(config.ALLOWED_HOSTS));
if (config.AUTH) app.use(basicAuth(config.AUTH));

app.use(express.static(path.join(__dirname, "public"), { maxAge: "1h" }));
const VENDOR = {
  fontawesome: "@fortawesome/fontawesome-free",
  literata: "@fontsource-variable/literata/files",
  "highlight.js": "highlight.js/styles",
  mermaid: "mermaid/dist",
};
for (const [name, dir] of Object.entries(VENDOR)) {
  app.use(
    `/vendor/${name}`,
    express.static(path.join(__dirname, "node_modules", dir), {
      maxAge: "1h",
    }),
  );
}
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
Object.assign(app.locals, {
  editMode: config.EDIT,
  theme: config.THEME,
  title: config.TITLE,
  image: config.IMAGE,
  imageSize: config.IMAGE_SIZE,
  showSearch: config.SHOW_SEARCH,
  socialLinks: config.SOCIAL_LINKS,
  sourceLink: config.SHOW_SOURCE ? config.SOURCE_LINK : null,
  showRss: config.SHOW_RSS,
});
if (config.EDIT) app.use(editRouter(config, invalidateAll, history));

app.use(pageRouter(config));
app.use(tagRouter(config));

if (config.SHOW_RSS) app.get("/rss.xml", rssRoute(config));
if (!config.EDIT && !config.SINGLE_FILE) {
  app.get("/sitemap.xml", sitemapRoute(config));
}
if (config.SHOW_SEARCH) app.get("/api/search", searchRoute(config));

// Error handling
setupErrorHandlers(app, config);

// With history on, a stop waits for writes in flight and commits what is
// pending, for at most 10 s; a second signal exits at once.
function commitOnExit(server) {
  let stopping = false;
  const stop = () => {
    if (stopping) process.exit(1);
    stopping = true;
    server.close();
    const done = withWriteLock(() => {}).then(() => history.flush());
    const cap = new Promise((resolve) => {
      setTimeout(resolve, 10_000).unref();
    });
    Promise.race([done, cap]).finally(() => process.exit(0));
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

function listen() {
  const server = app.listen(config.PORT, config.HOST, () => {
    const url = `http://${config.HOST === "0.0.0.0" ? "localhost" : config.HOST}:${config.PORT}`;
    console.log(`Running on ${url}`);
    if (config.AUTO_OPEN) {
      const openUrl = config.SINGLE_FILE
        ? url + pageHref(path.basename(config.SINGLE_FILE))
        : url;
      openBrowser(openUrl);
    }
  });
  server.on("error", (err) => {
    console.error(
      `Error: can't listen on ${config.HOST}:${config.PORT}: ${err.message}`,
    );
    process.exit(1);
  });
  if (history) commitOnExit(server);
}

function startHistory() {
  history.start().then(listen, (err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

function check() {
  checkLinks(config).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err);
      process.exit(2);
    },
  );
}

if (config.CHECK) {
  check();
} else if (history) {
  startHistory();
} else {
  listen();
}
