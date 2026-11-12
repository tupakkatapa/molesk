const express = require("express");
const {
  asyncHandler,
  byDateThenName,
  byName,
  formatDay,
} = require("./helpers");
const { renderView, send } = require("./pages");
const { siteIndex } = require("./site");
const { pageHref } = require("../public/slug.mjs");

const notFound = () => Object.assign(new Error("Not Found"), { status: 404 });

const tagHref = (slug) => `/tags/${encodeURIComponent(slug)}/`;

async function serveTags(config, req, res) {
  const { tags } = await siteIndex(config).get();
  const list = [...tags]
    .map(([slug, tag]) => ({
      label: tag.label,
      href: tagHref(slug),
      count: tag.notes.length,
    }))
    .sort((a, b) => byName(a.label, b.label));
  return send(config, req, res, {
    html: await renderView(req.app, "tags", { tags: list }),
    title: `Tags - ${config.TITLE}`,
    heading: "Tags",
  });
}

async function serveTag(config, req, res) {
  const { tags } = await siteIndex(config).get();
  const tag = tags.get(req.params.slug);
  if (!tag) throw notFound();
  const index = {
    title: tag.label,
    path: "",
    dir: null,
    crumbs: [
      { name: config.TITLE, href: "/" },
      { name: "Tags", href: "/tags/" },
    ],
    folders: [],
    notes: tag.notes
      .map((note) => ({
        name: note.title,
        title: note.title,
        href: pageHref(note.rel),
        date: note.meta.date,
        day: formatDay(note.meta.date),
        draft: note.meta.draft,
        excerpt: note.excerpt,
      }))
      .sort(byDateThenName),
  };
  return send(config, req, res, {
    html: await renderView(req.app, "folder", { index }),
    title: `${tag.label} - ${config.TITLE}`,
    heading: tag.label,
  });
}

// Tag pages are listings, so they exist only where folder listings do.
function tagRouter(config) {
  const router = express.Router();
  if (!config.SHOW_INDEX || config.SINGLE_FILE) return router;
  const handle = (fn) => asyncHandler((req, res) => fn(config, req, res));
  router.get("/tags/", handle(serveTags));
  router.get("/tags/:slug/", handle(serveTag));
  return router;
}

module.exports = { tagRouter };
