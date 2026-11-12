const { escapeHtml } = require("./helpers");
const { pageHref } = require("../public/slug.mjs");

const OPEN = 0x5b;

// `[[target]]` and `[[target|label]]` on one line (`\|` in table cells);
// empty or space-padded targets stay text, so shell tests like
// `[[ -f x ]]` read as written.
function wikilinkRule(state, silent) {
  const { src, pos } = state;
  if (src.codePointAt(pos) !== OPEN || src.codePointAt(pos + 1) !== OPEN) {
    return false;
  }
  const end = src.indexOf("]]", pos + 2);
  if (end === -1) return false;
  const inner = src.slice(pos + 2, end);
  if (inner.includes("\n") || inner.includes("[") || inner.includes("]")) {
    return false;
  }
  const split = inner.replace("\\|", "|").indexOf("|");
  const unescaped = inner.replace("\\|", "|");
  const target = split === -1 ? unescaped : unescaped.slice(0, split);
  const label = split === -1 ? target : unescaped.slice(split + 1);
  if (!target.trim() || target !== target.trim() || !label.trim()) {
    return false;
  }
  if (!silent) {
    const token = state.push("wikilink", "", 0);
    token.meta = { target, label: label.trim() };
  }
  state.pos = end + 2;
  return true;
}

// Resolved through `env.site`; without one, or for a target no page has,
// the label shows as a marked missing link.
function renderWikilink(tokens, idx, options, env) {
  const { target, label } = tokens[idx].meta;
  const rel = env.site?.resolve(target);
  const text = escapeHtml(label);
  if (rel) return `<a class="wikilink" href="${pageHref(rel)}">${text}</a>`;
  return `<span class="wikilink missing" title="No page named ${escapeHtml(target)}">${text}<span class="visually-hidden"> (no page yet)</span></span>`;
}

function wikilinks(md) {
  md.inline.ruler.before("link", "wikilink", wikilinkRule);
  md.renderer.rules.wikilink = renderWikilink;
}

module.exports = { wikilinks };
