const yaml = require("js-yaml");
const { noteTitle } = require("./helpers");

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)(?:\r?\n)*/u;

const dayOf = (date) =>
  date instanceof Date ? date.toISOString().slice(0, 10) : String(date);

// A string or a list as trimmed strings; numbers count, anything else is
// dropped.
const strings = (value) =>
  (Array.isArray(value) ? value : [value])
    .map((item) => (typeof item === "number" ? String(item) : item))
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim());

// Null when the block is YAML but not a mapping, i.e. a page that starts
// with a --- rule rather than front matter.
function loadMeta(yamlText) {
  let meta;
  try {
    meta = yaml.load(yamlText);
  } catch {
    return {};
  }
  if (meta === null || meta === undefined) return {};
  if (typeof meta !== "object" || Array.isArray(meta)) return null;
  return {
    date:
      meta.date === null || meta.date === undefined
        ? undefined
        : dayOf(meta.date),
    description: strings(meta.description)[0],
    title: strings(meta.title)[0],
    order: Number.isFinite(meta.order) ? meta.order : undefined,
    image: strings(meta.image)[0],
    toc: meta.toc !== false,
    draft: meta.draft === true,
    aliases: strings(meta.aliases),
    tags: strings(meta.tags),
  };
}

// The front matter block with the blank lines after it, kept verbatim so the
// editor can hide it and write it back unchanged; invalid YAML reads as no
// metadata.
function splitFrontMatter(data) {
  const match = FRONT_MATTER.exec(data);
  const meta = match ? loadMeta(match[1]) : {};
  if (!match || meta === null) return { front: "", body: data, meta: {} };
  return { front: match[0], body: data.slice(match[0].length), meta };
}

const parseMetadataOnly = (data) => splitFrontMatter(data).meta;

// Drafts exist only for their writer: the editor and a single-file preview.
const isPublished = (meta, config) =>
  config.EDIT || Boolean(config.SINGLE_FILE) || !meta.draft;

const EXCERPT_LENGTH = 160;

function excerptOf(body) {
  const line = body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !/^(?:#|```|~~~|---|\|)/u.test(l));
  if (!line) return "";
  const plain = line
    .replaceAll(/\[\[([^\]|]+)(?:\\?\|([^\]]+))?\]\]/gu, (_, t, l) => l ?? t)
    .replaceAll(/!?\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replaceAll(/^(?:[-*+>]|\d+\.)\s+(?:\[[ xX]\]\s+)?/gu, "")
    .replaceAll(/[*_`~=]/gu, "")
    .trim();
  if (plain.length <= EXCERPT_LENGTH) return plain;
  const cut = plain.slice(0, EXCERPT_LENGTH);
  return `${cut.slice(0, cut.lastIndexOf(" ")) || cut}…`;
}

// A note file `name` as listed: its title and its description or first line.
function describe(raw, name) {
  const { meta, body } = splitFrontMatter(raw);
  return {
    meta,
    body,
    title: meta.title || noteTitle(name),
    excerpt: meta.description || excerptOf(body),
  };
}

module.exports = {
  describe,
  isPublished,
  parseMetadataOnly,
  splitFrontMatter,
};
