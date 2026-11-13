const path = require("path");
const { NOTE_EXT } = require("../public/slug.mjs");

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"];
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov"];
const MEDIA_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS];
const MD_EXTENSIONS = [".md", ".txt"];
const TRASH = ".trash";

const ERROR_MESSAGES = {
  UNSUPPORTED_FILE: "File type not supported",
  NOT_FOUND:
    "# Not found\n\nThere is no page at this address. It may have been renamed, moved or deleted.\n\n[Back to the start](/)",
  GENERIC_ERROR:
    "# Error\n\nAn unexpected error occurred. Please try again later.",
};

const escapeHtml = (str) =>
  String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const isPathSafe = (basePath, requestedPath) => {
  const resolvedBase = path.resolve(basePath);
  const resolvedPath = path.resolve(path.join(basePath, requestedPath));
  return (
    resolvedPath.startsWith(resolvedBase + path.sep) ||
    resolvedPath === resolvedBase
  );
};

const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

// A note or folder name as shown: no extension, dashes and underscores as
// spaces unless the name has spaces, and a capital first letter unless the
// name already has capitals.
const noteTitle = (name) => {
  const bare = name.replace(NOTE_EXT, "");
  const words = bare.includes(" ") ? bare : bare.replaceAll(/[-_]/gu, " ");
  return words === words.toLowerCase() ? capitalize(words) : words;
};

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

// A YYYY-MM-DD date as "9 Nov 2026"; other text is shown as written.
const formatDay = (date) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date ?? "");
  if (!match || !MONTHS[match[2] - 1]) return date;
  return `${Number(match[3])} ${MONTHS[match[2] - 1]} ${match[1]}`;
};

// Numbers in names sort by value, case and accents aside; the raw name
// breaks ties so the order is stable.
const byName = (a, b) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }) ||
  (a < b ? -1 : Number(a > b));

// Pages with an `order` first, lowest first; then dated pages, newest
// first; then the rest by name.
const byDateThenName = (a, b) =>
  (a.order ?? Infinity) - (b.order ?? Infinity) ||
  Boolean(b.date) - Boolean(a.date) ||
  (a.date && b.date ? b.date.localeCompare(a.date) : 0) ||
  byName(a.name, b.name);

// The site's public address: --url, else the one the request came in on.
const siteOrigin = (config, req) =>
  config.URL ?? `${req.protocol}://${req.get("host")}`;

const ensureProtocol = (url) =>
  url.startsWith("http://") || url.startsWith("https://")
    ? url
    : "https://" + url;

const toSlash = (rel) => rel.split(path.sep).join("/");

// No folder listings or tag pages: --no-index, or a single file.
const indexOff = (config) => !config.SHOW_INDEX || config.SINGLE_FILE;

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  IMAGE_EXTENSIONS,
  MEDIA_EXTENSIONS,
  VIDEO_EXTENSIONS,
  MD_EXTENSIONS,
  TRASH,
  ERROR_MESSAGES,
  escapeHtml,
  isPathSafe,
  byName,
  byDateThenName,
  siteOrigin,
  capitalize,
  formatDay,
  noteTitle,
  ensureProtocol,
  asyncHandler,
  indexOff,
  toSlash,
};
