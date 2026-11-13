const fs = require("fs").promises;
const path = require("path");
const { byName, indexOff, toSlash } = require("./helpers");
const { aliasAddress } = require("./aliases");
const { walkNotes } = require("./content");
const { expiring } = require("./cache");
const { resolveReadable } = require("./files");
const { describe, isPublished, splitFrontMatter } = require("./frontmatter");
const { md, plainText } = require("./markdown");
const {
  pageHref,
  slugPath,
  slugSegment,
  tagHref,
} = require("../public/slug.mjs");

const NOTE_LINK =
  /^(?![a-z][a-z\d+.-]*:|\/\/|#)[^?#]*\.(?:md|txt)(?:[?#].*)?$/iu;

// Links to other notes, with their 1-based line in the file: wiki targets,
// and /content/ or relative .md/.txt hrefs.
function linksOf(data) {
  const { front, body } = splitFrontMatter(data);
  const offset = front.split("\n").length;
  const links = [];
  let line = offset;
  for (const token of md.parse(body, {})) {
    if (token.map) line = token.map[0] + offset;
    if (token.type !== "inline") continue;
    for (const child of token.children) {
      if (child.type === "wikilink") {
        links.push({ kind: "wiki", target: child.meta.target, line });
      } else if (child.type === "link_open") {
        const href = child.attrGet("href");
        if (href.startsWith("/content/") || NOTE_LINK.test(href)) {
          links.push({ kind: "href", target: href, line });
        }
      }
    }
  }
  return links;
}

// Records are reused while a note's mtime and size are unchanged, so a
// rebuild stats every note but reads and parses only the changed ones.
const records = new Map();

async function recordOf(config, rel) {
  const file = await resolveReadable(config, rel);
  const { mtimeMs, size } = await fs.stat(file);
  const known = records.get(file);
  if (known?.mtimeMs === mtimeMs && known.size === size) return known.record;
  const raw = await fs.readFile(file, "utf8");
  const { meta, body, title, excerpt } = describe(raw, path.basename(rel));
  const posix = toSlash(rel);
  const record = {
    rel: posix,
    slug: decodeURIComponent(slugPath(posix)),
    title,
    meta,
    text: plainText(body),
    excerpt,
    links: linksOf(raw),
  };
  records.set(file, { mtimeMs, size, record });
  return record;
}

async function build(config) {
  const rels = await walkNotes(config);
  const notes = await Promise.all(
    rels.map((rel) =>
      recordOf(config, rel).catch((err) => {
        if (err.status !== 404 && err.code !== "ENOENT") {
          console.warn(`Skipping ${rel}: ${err.message}`);
        }
        return null;
      }),
    ),
  );
  const published = notes
    .filter((note) => note && isPublished(note.meta, config))
    .sort((a, b) => byName(a.rel, b.rel));
  const aliases = aliasMap(published);
  const names = nameMap(published, aliases);
  const resolve = (target) => names.get(slugOf(target))?.[0] ?? null;
  const site = {
    notes: published,
    aliases,
    names,
    resolve,
    tags: tagMap(published),
  };
  return { ...site, backlinks: backlinkMap(site) };
}

// Notes by tag slug; tags whose slugs match share one page under the first
// spelling.
const sharedTags = new Set();
function tagMap(notes) {
  const tags = new Map();
  for (const note of notes) {
    for (const tag of note.meta.tags ?? []) {
      const slug = slugSegment(tag);
      const entry = tags.get(slug) ?? { label: tag, notes: [] };
      const pair = `${tag}\0${entry.label}`;
      if (entry.label !== tag && !sharedTags.has(pair)) {
        sharedTags.add(pair);
        console.warn(
          `Tag "${tag}" in ${note.rel} shares a page with "${entry.label}"`,
        );
      }
      if (!entry.notes.includes(note)) entry.notes.push(note);
      tags.set(slug, entry);
    }
  }
  return tags;
}

const slugOf = (target) =>
  decodeURIComponent(slugPath(target.replaceAll(/^\/+|\/+$/gu, "")));

// Every trailing part of each note's address and aliases, so `[[Name]]`
// and `[[folder/Name]]` both find `folder/Name.md`; candidates by path.
function nameMap(notes, aliases) {
  const names = new Map();
  const add = (address, rel) => {
    const parts = address.split("/");
    for (let i = 0; i < parts.length; i++) {
      const key = parts.slice(i).join("/");
      const list = names.get(key) ?? [];
      if (!list.includes(rel)) list.push(rel);
      names.set(key, list);
    }
  };
  for (const note of notes) add(note.slug, note.rel);
  for (const [address, rel] of aliases) add(address, rel);
  return names;
}

// The note an href inside `source` links to, or null.
const decoded = (href) => {
  try {
    return decodeURI(href);
  } catch {
    return null;
  }
};

function hrefTarget(site, source, href) {
  const clean = decoded(href.replace(/[?#].*$/u, ""));
  if (clean === null) return null;
  if (clean.startsWith("/content/")) {
    const address = slugOf(clean.slice("/content/".length));
    const own = site.notes.find((note) => note.slug === address);
    return own?.rel ?? site.aliases.get(address) ?? null;
  }
  const rel = path.posix.normalize(
    path.posix.join(path.posix.dirname(source.rel), clean),
  );
  return site.notes.some((note) => note.rel === rel) ? rel : null;
}

const targetOf = (site, note, link) =>
  link.kind === "wiki"
    ? site.resolve(link.target)
    : hrefTarget(site, note, link.target);

// Notes linking to each note, the note itself left out.
function backlinkMap(site) {
  const backlinks = new Map();
  for (const note of site.notes) {
    for (const link of note.links) {
      const target = targetOf(site, note, link);
      if (!target || target === note.rel) continue;
      const list = backlinks.get(target) ?? [];
      if (!list.includes(note)) list.push(note);
      backlinks.set(target, list);
    }
  }
  return backlinks;
}

// Old addresses from `aliases:`, first note by path winning a shared one;
// a note's own address is never an alias.
function aliasMap(notes) {
  const map = new Map();
  const own = new Set(notes.map((note) => note.slug));
  for (const note of notes) {
    for (const entry of note.meta.aliases ?? []) {
      const address = aliasAddress(entry);
      if (!address) {
        console.warn(`Ignoring alias "${entry}" in ${note.rel}`);
      } else if (map.has(address) && map.get(address) !== note.rel) {
        console.warn(
          `Alias "${entry}" in ${note.rel} is already ${map.get(address)}'s`,
        );
      } else if (!own.has(address)) {
        map.set(address, note.rel);
      }
    }
  }
  return map;
}

// Every published note, rebuilt at most every few seconds and at once after
// an edit.
let index = null;
const siteIndex = (config) => {
  index ??= expiring(() => build(config));
  return index;
};
const invalidateSite = () => index?.invalidate();

// The notes linking to `rel`, by title, for the page's "Linked from".
const backlinksOf = (site, rel) =>
  (site.backlinks.get(rel) ?? [])
    .map((note) => ({ title: note.title, href: pageHref(note.rel) }))
    .sort((a, b) => byName(a.title, b.title));

// Every tag with its address and page count, by name; none when the tag
// pages are off.
async function tagList(config) {
  if (indexOff(config)) return [];
  const { tags } = await siteIndex(config).get();
  return [...tags]
    .map(([slug, tag]) => ({
      label: tag.label,
      href: tagHref(slug),
      count: tag.notes.length,
    }))
    .sort((a, b) => byName(a.label, b.label));
}

module.exports = {
  backlinksOf,
  invalidateSite,
  siteIndex,
  slugOf,
  tagList,
  targetOf,
};
