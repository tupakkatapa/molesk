const MarkdownIt = require("markdown-it");
const markdownItAnchor = require("markdown-it-anchor");
const yaml = require("js-yaml");
const { escapeHtml, formatDay } = require("./helpers");
const { wikilinks } = require("./wikilinks");
const { slugSegment } = require("../public/slug.mjs");

// Security: Disable raw HTML to prevent XSS
const md = new MarkdownIt({
  html: false,
  typographer: true,
  linkify: true,
}).use(markdownItAnchor, {
  permalink: markdownItAnchor.permalink.headerLink(),
  slugify: (s) =>
    encodeURIComponent(String(s).trim().toLowerCase().replaceAll(/\s+/gu, "-")),
  level: 1,
});

const loadPlugin = (name, ...args) => {
  try {
    const plugin = require(name);
    const pluginFn =
      (name === "markdown-it-emoji" && plugin.full) || plugin.default || plugin;
    md.use(pluginFn, ...args);
  } catch (err) {
    console.error(`Failed to load plugin ${name}:`, err.message);
  }
};

// Unlabelled fences stay plain: guessing colours prose as code
loadPlugin("markdown-it-highlightjs", { auto: false });
loadPlugin("markdown-it-emoji");
loadPlugin("markdown-it-sub");
loadPlugin("markdown-it-ins");
loadPlugin("markdown-it-mark");
loadPlugin("markdown-it-footnote");
loadPlugin("markdown-it-deflist");
loadPlugin("markdown-it-container", "warning");
loadPlugin("markdown-it-container", "info");
loadPlugin("markdown-it-abbr");
loadPlugin("markdown-it-collapsible");

// Mermaid fences become diagram sources the browser renders; without
// JavaScript they read as code
const highlightedFence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  return token.info.trim() === "mermaid"
    ? `<pre class="mermaid">${escapeHtml(token.content)}</pre>\n`
    : highlightedFence(tokens, idx, options, env, self);
};

const PLUS = 0x2b;
const startsWithPlus = (state, line) =>
  state.src.codePointAt(state.bMarks[line] + state.tShift[line]) === PLUS;
const isBlank = (state, line) =>
  state.bMarks[line] + state.tShift[line] >= state.eMarks[line];

// The first line at or after each line that has text not starting with "+".
const contentLines = new WeakMap();
function nextContent(state) {
  let next = contentLines.get(state);
  if (!next) {
    const lines = state.bMarks.length - 1;
    next = new Int32Array(lines + 1).fill(lines);
    for (let line = lines - 1; line >= 0; line--) {
      const content = !isBlank(state, line) && !startsWithPlus(state, line);
      next[line] = content ? line : next[line + 1];
    }
    contentLines.set(state, next);
  }
  return next;
}

// markdown-it-collapsible scans to the end of the document for every opener
// whose block turns out empty, which is quadratic in a run of "+++" lines;
// such openers are turned down here without the scan.
const collapsible = md.block.ruler.__rules__.find(
  (rule) => rule.name === "collapsible",
);
if (collapsible) {
  const parse = collapsible.fn;
  md.block.ruler.at(
    "collapsible",
    (state, startLine, endLine, silent) =>
      startsWithPlus(state, startLine) &&
      (silent || nextContent(state)[startLine + 1] < endLine) &&
      parse(state, startLine, endLine, silent),
    { alt: collapsible.alt },
  );
}

md.renderer.rules.table_open = (tokens, idx, options, env, self) =>
  `<div class="table-wrapper">${self.renderToken(tokens, idx, options)}`;
md.renderer.rules.table_close = (tokens, idx, options, env, self) =>
  `${self.renderToken(tokens, idx, options)}</div>\n`;

const TASK = /^\[([ xX])\][ \t]+/u;

// "- [ ] item" list items render as checkboxes carrying their source line,
// so edit mode can toggle that exact line.
function taskLists(state) {
  const { tokens } = state;
  for (let i = 2; i < tokens.length; i++) {
    const [item, paragraph, inline] = tokens.slice(i - 2, i + 1);
    if (
      inline.type !== "inline" ||
      paragraph.type !== "paragraph_open" ||
      item.type !== "list_item_open"
    ) {
      continue;
    }
    const first = inline.children[0];
    const match = first?.type === "text" && TASK.exec(first.content);
    if (!match) continue;
    first.content = first.content.slice(match[0].length);
    const line = item.map[0] + (state.env.lineOffset || 0);
    const box = new state.Token("html_inline", "", 0);
    box.content = `<label class="task"><input type="checkbox" class="task-box" data-line="${line}"${match[1] === " " ? "" : " checked"} disabled><span>`;
    const end = new state.Token("html_inline", "", 0);
    end.content = "</span></label>";
    inline.children.unshift(box);
    inline.children.push(end);
  }
}

md.core.ruler.push("task_lists", taskLists);
md.use(wikilinks);

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
    description: meta.description,
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

const INLINE_TEXT = new Set(["text", "code_inline"]);
const CODE_BLOCKS = new Set(["fence", "code_block"]);

// The body as one line of plain text, with or without its code blocks.
function plainText(body, { code = true } = {}) {
  const parts = [];
  for (const token of md.parse(body, {})) {
    if (token.type === "inline") {
      for (const child of token.children) {
        if (INLINE_TEXT.has(child.type)) parts.push(child.content);
        else if (child.type === "wikilink") parts.push(child.meta.label);
        else if (child.type.endsWith("break")) parts.push(" ");
      }
      parts.push(" ");
    } else if (code && CODE_BLOCKS.has(token.type)) {
      parts.push(token.content, " ");
    }
  }
  return parts.join("").replaceAll(/\s+/gu, " ").trim();
}

const WORDS_PER_MINUTE = 200;

// Minutes to read the prose, shown for dated pages and long undated ones.
function readingMinutes(body, dated) {
  const words =
    plainText(body, { code: false }).match(/\S*[\p{L}\p{N}]\S*/gu)?.length ?? 0;
  if (!dated && words < WORDS_PER_MINUTE) return null;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

function parseFileContent(data, { site } = {}) {
  const { front, body, meta } = splitFrontMatter(data);
  const lineOffset = front.split("\n").length - 1;
  return {
    content: md.render(body, { lineOffset, site }),
    metadata: {
      date: meta.date,
      draft: meta.draft,
      minutes: readingMinutes(body, Boolean(meta.date)),
      tags: meta.tags,
    },
    meta,
    body,
  };
}

// Tag chips link to their tag page, or are plain text without index pages.
function tagsToHtml(tags = [], links = true) {
  if (tags.length === 0) return "";
  const chips = tags.map((tag) => {
    const label = escapeHtml(tag);
    return links
      ? `<li><a class="tag" href="/tags/${encodeURIComponent(slugSegment(tag))}/">${label}</a></li>`
      : `<li><span class="tag">${label}</span></li>`;
  });
  return `<ul class="tag-list" aria-label="Tags">${chips.join("")}</ul>`;
}

function metadataToHtml(meta, { tagLinks = true } = {}) {
  const tags = tagsToHtml(meta.tags, tagLinks);
  const parts = [
    meta.date &&
      `<time class="meta-date" datetime="${escapeHtml(meta.date)}">${escapeHtml(formatDay(meta.date))}</time>`,
    meta.minutes && `<span class="meta-read">${meta.minutes} min read</span>`,
    meta.draft && `<span class="badge">Draft</span>`,
  ].filter(Boolean);
  const caption =
    parts.length > 0 ? `<div class="metadata">${parts.join("")}</div>` : "";
  return caption + tags;
}

module.exports = {
  md,
  excerptOf,
  isPublished,
  plainText,
  parseMetadataOnly,
  parseFileContent,
  splitFrontMatter,
  metadataToHtml,
};
