const path = require("path");
const { downloadHref, editHref } = require("../public/slug.mjs");

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"];
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
// spaces, and a capital first letter unless the name already has capitals.
const noteTitle = (name) => {
  const words = name.replace(/\.(?:md|txt)$/iu, "").replaceAll(/[-_]/gu, " ");
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

// Dated pages first, newest first, then the undated ones by name.
const byDateThenName = (a, b) =>
  Boolean(b.date) - Boolean(a.date) ||
  (a.date && b.date ? b.date.localeCompare(a.date) : 0) ||
  byName(a.name, b.name);

// The address the request came in on, for absolute links; unescaped.
const originOf = (req) => `${req.protocol}://${req.get("host")}`;

// The site's public address: --url, else the request's own.
const siteOrigin = (config, req) => config.URL ?? originOf(req);

const ensureProtocol = (url) =>
  url.startsWith("http://") || url.startsWith("https://")
    ? url
    : "https://" + url;

const encodePath = (relPath) =>
  relPath
    .split(path.sep)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

// The note's actions, stuck to the top right of the card.
const contentActions = (relPath, config, etag) => {
  const rel = relPath.split(path.sep).join("/");
  const edit = config.EDIT
    ? `<a href="${editHref(rel)}" class="icon-btn edit-icon" title="Edit (e)" aria-label="Edit" data-etag="${escapeHtml(etag)}"><i class="fa-solid fa-pen" aria-hidden="true"></i></a>`
    : "";
  const download = config.SHOW_DOWNLOAD
    ? `<a href="${downloadHref(rel)}" class="icon-btn download-icon" title="Download" aria-label="Download"><i class="fa-solid fa-download" aria-hidden="true"></i></a>`
    : "";
  return edit || download
    ? `<div class="note-actions">${edit}${download}</div>`
    : "";
};

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  IMAGE_EXTENSIONS,
  MD_EXTENSIONS,
  TRASH,
  ERROR_MESSAGES,
  escapeHtml,
  isPathSafe,
  byName,
  byDateThenName,
  originOf,
  siteOrigin,
  capitalize,
  formatDay,
  noteTitle,
  ensureProtocol,
  asyncHandler,
  contentActions,
  encodePath,
};
