const path = require("path");
const {
  IMAGE_EXTENSIONS,
  escapeHtml,
  noteTitle,
  siteOrigin,
  toSlash,
} = require("./helpers");
const { generateFolderStructure } = require("./content");
const { tagList } = require("./site");
const {
  downloadHref,
  editHref,
  encode,
  folderHref: slugFolderHref,
} = require("../public/slug.mjs");

const folderHref = (rel) => slugFolderHref(toSlash(rel));

// Breadcrumbs from the root down to, not including, `rel`.
function crumbsOf(rel, title) {
  const crumbs = [{ name: title, href: "/" }];
  const segments = rel ? rel.split(path.sep) : [];
  segments.slice(0, -1).forEach((segment, i) => {
    crumbs.push({
      name: noteTitle(segment),
      href: folderHref(segments.slice(0, i + 1).join(path.sep)),
    });
  });
  return crumbs;
}

// The note's actions, stuck to the top right of the card.
const contentActions = (relPath, config, etag) => {
  const rel = toSlash(relPath);
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

// A page's own preview picture: a full URL as written, or an image beside
// the page; anything else gives none.
function coverOf(origin, rel, image) {
  if (!image) return "";
  if (/^https?:\/\//iu.test(image)) return image;
  const target = path.posix.join(path.posix.dirname(rel), image);
  const isImage = IMAGE_EXTENSIONS.includes(path.extname(target).toLowerCase());
  if (target.startsWith("..") || path.isAbsolute(target) || !isImage) return "";
  return `${origin}/content/${encode(target)}`;
}

// Link preview tags; the request's own address makes the URLs absolute.
function linkPreview(
  config,
  req,
  { heading, description = "", article, current, image },
) {
  const origin = siteOrigin(config, req);
  const cover = coverOf(origin, current ?? "", image);
  return {
    title: heading,
    description,
    type: article ? "article" : "website",
    url: origin + req.originalUrl,
    image: cover || (config.IMAGE ? `${origin}/profile-pic` : ""),
    card: cover ? "summary_large_image" : "summary",
  };
}

const renderView = (app, view, locals) =>
  new Promise((resolve, reject) => {
    app.render(view, locals, (err, out) => (err ? reject(err) : resolve(out)));
  });

const sidebarOf = async (config) => ({
  tree: await generateFolderStructure(config),
  sidebarTags: await tagList(config),
});

// The full page around `initialContent`, or around the editor.
async function renderPage(config, res, locals, sidebar) {
  res.render("index", {
    current: "",
    initialContent: "",
    actions: "",
    pageTitle: config.TITLE,
    heading: config.TITLE,
    singleFile: Boolean(config.SINGLE_FILE),
    preview: null,
    editor: null,
    ...(sidebar ?? (await sidebarOf(config))),
    ...locals,
  });
}

// A page as a fragment for in-site navigation, else as a full page.
function send(
  config,
  req,
  res,
  { html, actions = "", title, heading, current = "", description, ...page },
) {
  res.vary("X-Requested-With");
  if (req.xhr) {
    res.setHeader("Content-Type", "text/html");
    res.setHeader("X-Page-Title", encodeURIComponent(title));
    res.setHeader("X-Page-Heading", encodeURIComponent(heading));
    res.setHeader("X-Page-Path", encodeURIComponent(current));
    return res.send(actions + html);
  }
  return renderPage(config, res, {
    current,
    initialContent: html,
    actions,
    pageTitle: title,
    heading,
    preview: linkPreview(config, req, {
      heading,
      description,
      current,
      ...page,
    }),
  });
}

module.exports = {
  contentActions,
  crumbsOf,
  folderHref,
  renderPage,
  renderView,
  send,
  sidebarOf,
};
