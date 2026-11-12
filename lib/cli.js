const path = require("path");
const fsSync = require("fs");
const { execFile } = require("child_process");
const { MD_EXTENSIONS, ensureProtocol } = require("./helpers");
const { readAuthFile } = require("./auth");

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function handlePositionalArg(target, config) {
  if (!fsSync.existsSync(target)) fail(`Path does not exist: ${target}`);
  if (fsSync.statSync(target).isDirectory()) {
    config.CONTENTS_DIR = target;
    return;
  }
  if (!MD_EXTENSIONS.includes(path.extname(target).toLowerCase())) {
    fail(`Not a .md or .txt file: ${target}`);
  }
  config.SINGLE_FILE = target;
  config.CONTENTS_DIR = path.dirname(target);
  config.AUTO_OPEN = true;
}

// Publishing features and the home page default off in edit mode, a private
// notes app.
const FEATURES = {
  index: ["SHOW_INDEX", false],
  download: ["SHOW_DOWNLOAD", false],
  rss: ["SHOW_RSS", true],
  source: ["SHOW_SOURCE", true],
  search: ["SHOW_SEARCH", false],
};

const THEMES = ["dark", "light", "auto"];
const IMAGE_SIZES = ["small", "large"];

const defaultConfig = () => ({
  PORT: 8080,
  HOST: null,
  CONTENTS_DIR: path.join(__dirname, "..", "contents"),
  TITLE: null,
  IMAGE: "",
  IMAGE_SIZE: "large",
  SOCIAL_LINKS: [],
  SOURCE_LINK: "https://github.com/tupakkatapa/molesk",
  SHOW_INDEX: null,
  SHOW_SOURCE: null,
  SHOW_RSS: null,
  SHOW_DOWNLOAD: null,
  SHOW_SEARCH: null,
  HOME: null,
  THEME: "dark",
  SINGLE_FILE: null,
  AUTO_OPEN: false,
  EDIT: false,
  URL: null,
  AUTH_FILE: null,
  AUTH: null,
  CHECK: false,
  GIT: false,
  ALLOWED_HOSTS: [],
});

const TOGGLE_FLAGS = {
  ...Object.fromEntries(
    Object.entries(FEATURES).flatMap(([name, [key]]) => [
      [`--${name}`, [key, true]],
      [`--no-${name}`, [key, false]],
    ]),
  ),
  "--no-home": ["HOME", false],
  "-o": ["AUTO_OPEN", true],
  "--open": ["AUTO_OPEN", true],
  "--edit": ["EDIT", true],
  "--check": ["CHECK", true],
  "--git": ["GIT", true],
};

const toPort = (value) => {
  const port = /^\d+$/u.test(value) ? Number(value) : 0;
  if (port < 1 || port > 65535) fail("--port must be a number from 1 to 65535");
  return port;
};

const toUrl = (value) => {
  const url = URL.canParse(value) ? new URL(value) : null;
  if (!url || !["http:", "https:"].includes(url.protocol)) {
    fail("--url must be like https://example.com");
  }
  return url.href.replace(/\/+$/u, "");
};

const toLink = (value) => {
  const split = value.indexOf(":");
  if (split < 1) fail(`--link takes icon:url, got '${value}'`);
  return {
    fab: value.slice(0, split),
    href: ensureProtocol(value.slice(split + 1)),
  };
};

// Each takes the flag's values; multi-valued flags take every argument up to
// the next option.
const VALUE_FLAGS = {
  "--address": (config, [value]) => (config.HOST = value),
  "--image": (config, [value]) => (config.IMAGE = value),
  "--image-size": (config, [value]) => (config.IMAGE_SIZE = value),
  "--allowed-host": (config, [value]) => config.ALLOWED_HOSTS.push(value),
  "--home": (config, [value]) => (config.HOME = value),
  "--theme": (config, [value]) => (config.THEME = value),
  "--port": (config, [value]) => (config.PORT = toPort(value)),
  "--url": (config, [value]) => (config.URL = toUrl(value)),
  "--auth-file": (config, [value]) => (config.AUTH_FILE = value),
  "--title": (config, values) => (config.TITLE = values.join(" ")),
  "--link": (config, values) =>
    config.SOCIAL_LINKS.push(...values.map((value) => toLink(value))),
};
const MULTI = new Set(["--title", "--link"]);
const SHORT = {
  "-a": "--address",
  "-i": "--image",
  "-p": "--port",
  "-t": "--title",
  "-l": "--link",
};

// Returns the index of the last argument consumed.
function applyFlag(args, i, config) {
  const arg = args[i];
  if (TOGGLE_FLAGS[arg]) {
    const [key, value] = TOGGLE_FLAGS[arg];
    config[key] = value;
    return i;
  }
  const flag = SHORT[arg] ?? arg;
  if (!VALUE_FLAGS[flag]) fail(`Unknown option: ${arg}`);
  let end = i + 1;
  while (end < args.length && !args[end].startsWith("-")) {
    end++;
    if (!MULTI.has(flag)) break;
  }
  if (end === i + 1) fail(`${arg} needs a value`);
  VALUE_FLAGS[flag](config, args.slice(i + 1, end));
  return end - 1;
}

const LOOPBACK_HOSTS = ["127.0.0.1", "::1", "localhost"];

function resolveDefaults(config) {
  for (const [key, publishing] of Object.values(FEATURES)) {
    config[key] ??= !(publishing && config.EDIT);
  }
  if (config.EDIT) config.HOME ??= false;
  if (!THEMES.includes(config.THEME)) {
    fail(`--theme must be one of ${THEMES.join(", ")}`);
  }
  if (!IMAGE_SIZES.includes(config.IMAGE_SIZE)) {
    fail(`--image-size must be one of ${IMAGE_SIZES.join(", ")}`);
  }
}

function validateEdit(config, hasTarget) {
  if (config.SINGLE_FILE) {
    fail("--edit requires a directory, not a single file");
  }
  if (!hasTarget) fail("--edit needs a directory, e.g. molesk ./docs --edit");
  try {
    fsSync.accessSync(config.CONTENTS_DIR, fsSync.constants.W_OK);
  } catch {
    fail(`--edit needs a writable directory: ${config.CONTENTS_DIR}`);
  }
  config.HOST ??= "127.0.0.1";
  if (!LOOPBACK_HOSTS.includes(config.HOST)) {
    console.warn(
      config.AUTH
        ? `Warning: --edit on '${config.HOST}' sends the password over plain HTTP; put it behind an HTTPS proxy.`
        : `Warning: --edit on '${config.HOST}' lets anyone who reaches it edit; add --auth-file and put it behind an HTTPS proxy.`,
    );
  }
}

function validateConfig(config, hasTarget) {
  if (config.GIT && !config.EDIT) fail("--git needs --edit");
  if (config.CHECK && (config.EDIT || config.SINGLE_FILE)) {
    console.error("Error: --check needs a directory and no --edit");
    process.exit(2);
  }
  resolveDefaults(config);
  if (config.SINGLE_FILE) config.SHOW_RSS = false;
  if (config.AUTH_FILE) {
    try {
      config.AUTH = readAuthFile(config.AUTH_FILE);
    } catch (err) {
      fail(err.message);
    }
  }
  if (config.IMAGE) {
    try {
      fsSync.accessSync(config.IMAGE, fsSync.constants.R_OK);
    } catch {
      fail(`Cannot read --image: ${config.IMAGE}`);
    }
  }
  if (config.EDIT) validateEdit(config, hasTarget);
  else config.HOST ??= config.SINGLE_FILE ? "127.0.0.1" : "0.0.0.0";
}

function parseArgs(config, args = process.argv.slice(2)) {
  const positionalArgs = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") {
      displayHelp();
      process.exit(0);
    }
    if (arg.startsWith("-")) i = applyFlag(args, i, config);
    else positionalArgs.push(arg);
  }
  if (positionalArgs.length > 1) {
    fail(`Give one file or directory, got ${positionalArgs.join(", ")}`);
  }
  if (positionalArgs.length > 0) {
    handlePositionalArg(path.resolve(positionalArgs[0]), config);
  }
  validateConfig(config, positionalArgs.length > 0);
  return config;
}
function displayHelp() {
  console.log(`Usage: molesk [file.md|directory] [options]

Arguments:
  file.md                  View one markdown file (opens the browser)
  directory                Serve the markdown files in a directory

Options:
  -h, --help               Display this help information
  -o, --open               Open the browser after starting
  -a, --address <host>     Address to listen on (default: 0.0.0.0;
                           127.0.0.1 for a single file or with --edit)
  -p, --port <port>        Port to listen on, 1-65535 (default: 8080)
  --url <url>              Public address for feed, sitemap and link-preview
                           links (default: the address each request came in on)
  -t, --title <text>       Site title (default: data source name)
  -i, --image <path>       Profile picture
  --image-size <size>      Picture beside the title (small) or above it
                           (large, default)
  -l, --link <icon:url>    Sidebar link with a FontAwesome icon, repeatable
                           (e.g. --link fa-github:github.com/username)
  --home <file>            Page shown at / (default: first of index.md,
                           README.md, Home.md; none with --edit);
                           --no-home shows the index
  --theme <name>           Default theme: dark, light or auto (default: dark)
  --[no-]index             List folder contents at / and folder URLs (default: on)
  --[no-]download          Markdown downloads at /download (default: on)
  --[no-]search            Search box over the sidebar (default: on)
  --[no-]rss               RSS feed at /rss.xml (default: on, off with --edit)
  --[no-]source            Source code link in the sidebar (default: on, off with --edit)
  --check                  Print broken links between notes and exit: 0 when
                           none, 1 when some, 2 when a path can't be read
  --edit                   Create, edit and delete pages in the browser; needs
                           a writable directory (add --auth-file before
                           exposing it beyond this machine)
  --git                    With --edit, keep every change in a git repository in
                           the directory; the editor's History restores them
  --auth-file <path>       Require a login for every page: a file of
                           user:password lines, passwords 15+ characters
  --allowed-host <name>    With --edit or --auth-file, a host name the site is
                           reached by besides localhost, e.g. the HTTPS proxy's;
                           repeatable, others get 421

Examples:
  molesk README.md         View one file
  molesk ./docs            Serve a docs directory
  molesk ./docs --edit     Edit in the browser on 127.0.0.1`);
}

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  execFile(cmd, [url], (err) => {
    if (err) console.error(`Couldn't open a browser: ${err.message}`);
  });
}

module.exports = {
  FEATURES,
  defaultConfig,
  parseArgs,
  openBrowser,
};
