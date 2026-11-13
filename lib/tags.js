const express = require("express");
const {
  asyncHandler,
  byDateThenName,
  formatDay,
  indexOff,
} = require("./helpers");
const { notFound } = require("./files");
const { renderView, send } = require("./shell");
const { siteIndex, tagList } = require("./site");
const { pageHref } = require("../public/slug.mjs");

async function serveTags(config, req, res) {
  const list = await tagList(config);
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
  if (indexOff(config)) return router;
  const handle = (fn) => asyncHandler((req, res) => fn(config, req, res));
  router.get("/tags/", handle(serveTags));
  router.get("/tags/:slug/", handle(serveTag));
  return router;
}

module.exports = { tagRouter };
