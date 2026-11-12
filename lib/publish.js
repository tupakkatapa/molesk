const path = require("path");
const { asyncHandler, escapeHtml, siteOrigin } = require("./helpers");
const { folderHref } = require("../public/slug.mjs");
const { generateFolderStructure } = require("./content");

// The pages beside `rel` in its tree folder, in the folder's order.
function siblingsOf(nodes, rel) {
  if (nodes.some((node) => node.path === rel)) {
    return nodes.filter((node) => !node.folder);
  }
  for (const node of nodes) {
    const found = node.folder && siblingsOf(node.children, rel);
    if (found) return found;
  }
  return null;
}

// Links to the pages before and after `rel` in its folder, or null when
// it has no neighbours there.
function pagerOf(tree, rel) {
  const pages = siblingsOf(tree, rel) ?? [];
  const at = pages.findIndex((page) => page.path === rel);
  if (pages.length < 2) return null;
  const link = (page, label) =>
    page && { href: page.href, title: page.title, label };
  return {
    prev: link(pages[at - 1], "Previous"),
    next: link(pages[at + 1], "Next"),
  };
}

const FOLDER_INDEX = /^(?:index|readme)\.md$/iu;
const DAY = /^\d{4}-\d{2}-\d{2}$/u;

function flatten(nodes, out = []) {
  for (const node of nodes) {
    out.push(node);
    if (node.folder) flatten(node.children, out);
  }
  return out;
}

const urlXml = (loc, date) =>
  `<url><loc>${escapeHtml(loc)}</loc>${DAY.test(date ?? "") ? `<lastmod>${date}</lastmod>` : ""}</url>`;

// `/`, every published page, then the folder pages that list a folder
// without an index page of its own.
function sitemapRoute(config) {
  return asyncHandler(async (req, res) => {
    const origin = siteOrigin(config, req);
    const nodes = flatten(await generateFolderStructure(config));
    const folders = config.SHOW_INDEX
      ? nodes.filter(
          (node) =>
            node.folder &&
            !node.children.some(
              (child) =>
                !child.folder && FOLDER_INDEX.test(path.basename(child.path)),
            ),
        )
      : [];
    const urls = [
      urlXml(`${origin}/`),
      ...nodes
        .filter((node) => !node.folder)
        .map((node) => urlXml(origin + node.href, node.date)),
      ...folders.map((node) => urlXml(`${origin}${folderHref(node.path)}`)),
    ];
    res.type("application/xml");
    res.setHeader(
      "Cache-Control",
      `${config.AUTH ? "private" : "public"}, max-age=300`,
    );
    res.send(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls,
        "</urlset>",
        "",
      ].join("\n"),
    );
  });
}

module.exports = { pagerOf, sitemapRoute };
