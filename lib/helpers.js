const path = require("path");

const IGNORED_FILES = [];
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"];
const MD_EXTENSIONS = [".md", ".txt"];

const ERROR_MESSAGES = {
  UNSUPPORTED_FILE: "File type not supported",
  NOT_FOUND: "# 404 Not Found\n\nThe requested resource could not be found.",
  GENERIC_ERROR:
    "# Error\n\nAn unexpected error occurred. Please try again later.",
  NO_VALID_FILES: "No valid files found in the directory",
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

const ensureProtocol = (url) =>
  url.startsWith("http://") || url.startsWith("https://")
    ? url
    : "https://" + url;

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  IGNORED_FILES,
  IMAGE_EXTENSIONS,
  MD_EXTENSIONS,
  ERROR_MESSAGES,
  escapeHtml,
  isPathSafe,
  capitalize,
  ensureProtocol,
  asyncHandler,
};
