const { escapeHtml } = require("./helpers");

const LEVELS = ["h2", "h3"];
const MIN_HEADINGS = 3;
const TEXT = new Set(["text", "code_inline"]);

const textOf = (inline) =>
  inline.children
    .filter((child) => TEXT.has(child.type))
    .map((child) => child.content)
    .join("");

function headingsOf(tokens) {
  const headings = [];
  tokens.forEach((token, i) => {
    const id = token.type === "heading_open" && token.attrGet("id");
    if (!id || !LEVELS.includes(token.tag)) return;
    headings.push({ id, level: token.tag, text: textOf(tokens[i + 1]) });
  });
  return headings;
}

// Each item's class is its depth below the shallowest listed level, from 1.
function listOf(headings) {
  const top = Math.min(...headings.map(({ level }) => LEVELS.indexOf(level)));
  return headings
    .map(
      ({ id, level, text }) =>
        `<li class="toc-${LEVELS.indexOf(level) - top + 1}"><a href="#${escapeHtml(id)}">${escapeHtml(text)}</a></li>`,
    )
    .join("");
}

// With `env.toc`, a long page with enough headings lists them, closed, under
// its title, or at its top when it has none.
function toc(md) {
  md.core.ruler.push("toc", (state) => {
    if (!state.env.toc) return;
    const headings = headingsOf(state.tokens);
    if (headings.length < MIN_HEADINGS) return;
    const block = new state.Token("html_block", "", 0);
    block.content = `<nav class="toc" aria-label="On this page"><details><summary>On this page</summary><ul>${listOf(headings)}</ul></details></nav>\n`;
    const first = state.tokens[0];
    const titled = first?.type === "heading_open" && first.tag === "h1";
    const at = titled
      ? state.tokens.findIndex((token) => token.type === "heading_close") + 1
      : 0;
    state.tokens.splice(at, 0, block);
  });
}

module.exports = { toc };
