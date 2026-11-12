const path = require("path");
const { byDateThenName, escapeHtml, siteOrigin } = require("./helpers");
const { pageHref } = require("../public/slug.mjs");
const { siteIndex } = require("./site");

function itemOf(note) {
  const date = note.meta.date ? new Date(note.meta.date) : null;
  return {
    title: note.title,
    href: pageHref(note.rel),
    description: note.meta.description || "A new content piece is available.",
    category: path.posix.dirname(note.rel).split("/").join(" > "),
    date: date && !Number.isNaN(date.getTime()) ? date.toUTCString() : null,
  };
}

const itemXml = (origin, item) =>
  [
    "<item>",
    `<title>${escapeHtml(item.title)}</title>`,
    `<link>${origin}${item.href}</link>`,
    `<guid isPermaLink="false">${origin}${item.href}</guid>`,
    `<description>${escapeHtml(item.description)}</description>`,
    item.category === "."
      ? ""
      : `<category>${escapeHtml(item.category)}</category>`,
    item.date ? `<pubDate>${item.date}</pubDate>` : "",
    "</item>",
  ]
    .filter(Boolean)
    .join("\n");

function feedXml(config, origin, items) {
  const title = escapeHtml(config.TITLE);
  const image = config.IMAGE
    ? `<image><url>${origin}/profile-pic</url><title>${title}</title><link>${origin}/</link></image>`
    : "";
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "<channel>",
    `<title>${title}</title>`,
    `<link>${origin}/</link>`,
    `<description>RSS feed for ${title}'s content</description>`,
    image,
    ...items.map((item) => itemXml(origin, item)),
    "</channel>",
    "</rss>",
  ]
    .filter(Boolean)
    .join("\n");
}

// The XML is built per request from that request's origin.
function rssRoute(config) {
  return async (req, res) => {
    try {
      const origin = escapeHtml(siteOrigin(config, req));
      const { notes } = await siteIndex(config).get();
      const newest = notes.toSorted((a, b) =>
        byDateThenName(
          { date: a.meta.date, name: a.title },
          { date: b.meta.date, name: b.title },
        ),
      );
      const xml = feedXml(
        config,
        origin,
        newest.map((note) => itemOf(note)),
      );
      res.type("application/rss+xml");
      res.setHeader(
        "Cache-Control",
        `${config.AUTH ? "private" : "public"}, max-age=300`,
      );
      res.send(`${xml}\n`);
    } catch (error) {
      console.error("RSS route error:", error);
      res.status(500).send("RSS feed temporarily unavailable");
    }
  };
}

module.exports = { rssRoute };
