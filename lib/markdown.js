const MarkdownIt = require("markdown-it");
const markdownItAnchor = require("markdown-it-anchor");
const { escapeHtml, formatDay } = require("./helpers");
const { splitFrontMatter } = require("./frontmatter");
const { toc } = require("./toc");
const { videos } = require("./videos");
const { wikilinks } = require("./wikilinks");
const { slugSegment, tagHref } = require("../public/slug.mjs");

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

// Unlabelled fences stay plain: guessing colours prose as code
md.use(require("markdown-it-highlightjs"), { auto: false })
  .use(require("markdown-it-emoji").full)
  .use(require("markdown-it-sub"))
  .use(require("markdown-it-ins"))
  .use(require("markdown-it-mark"))
  .use(require("markdown-it-footnote"))
  .use(require("markdown-it-deflist"))
  .use(require("markdown-it-container"), "warning")
  .use(require("markdown-it-container"), "info")
  .use(require("markdown-it-abbr"))
  .use(require("markdown-it-collapsible"));

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
const parseCollapsible = collapsible.fn;
md.block.ruler.at(
  "collapsible",
  (state, startLine, endLine, silent) =>
    startsWithPlus(state, startLine) &&
    (silent || nextContent(state)[startLine + 1] < endLine) &&
    parseCollapsible(state, startLine, endLine, silent),
  { alt: collapsible.alt },
);

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
md.use(videos);
md.use(wikilinks);
md.use(toc);

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

const MIN_TOC_MINUTES = 2;

function parseFileContent(data, { site, toc: contents = false } = {}) {
  const { front, body, meta } = splitFrontMatter(data);
  const lineOffset = front.split("\n").length - 1;
  const minutes = readingMinutes(body, Boolean(meta.date));
  return {
    content: md.render(body, {
      lineOffset,
      site,
      toc: contents && meta.toc !== false && minutes >= MIN_TOC_MINUTES,
    }),
    metadata: { date: meta.date, draft: meta.draft, minutes, tags: meta.tags },
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
      ? `<li><a class="tag" href="${tagHref(slugSegment(tag))}">${label}</a></li>`
      : `<li><span class="tag">${label}</span></li>`;
  });
  return `<ul class="tag-list" aria-label="Tags">${chips.join("")}</ul>`;
}

function metadataToHtml(meta) {
  const parts = [
    meta.date &&
      `<time class="meta-date" datetime="${escapeHtml(meta.date)}">${escapeHtml(formatDay(meta.date))}</time>`,
    meta.minutes && `<span class="meta-read">${meta.minutes} min read</span>`,
    meta.draft && `<span class="badge">Draft</span>`,
  ].filter(Boolean);
  return parts.length > 0
    ? `<div class="metadata">${parts.join("")}</div>`
    : "";
}

module.exports = {
  md,
  metadataToHtml,
  parseFileContent,
  plainText,
  tagsToHtml,
};
