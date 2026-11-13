const yaml = require("js-yaml");
const { splitFrontMatter } = require("./frontmatter");
const { slugPath } = require("../public/slug.mjs");
const { httpError, statOf, writeAtomic } = require("./files");

const BLOCK = /^---(\r?\n)([\s\S]*?)\r?\n---/u;
const ALIAS_LIST = /^aliases:[ \t]*\r?\n((?:[ \t]+-[^\n]*\n?)+)/mu;

// The address an `aliases:` entry names, as a decoded slug path, or null:
// `posts/old`, `/content/posts/old` and `posts/Old Name.md` all work.
function aliasAddress(entry) {
  const rel = entry.replace(/^\/?(?:content\/)?/u, "");
  if (!rel || /^[a-z][a-z\d+.-]*:/iu.test(entry)) return null;
  const segments = rel.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return null;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(segments.join("/"));
  } catch {
    decoded = segments.join("/");
  }
  return decodeURIComponent(slugPath(decoded));
}

// `text` with `alias` added to its front matter, editing the text only where
// the alias goes; null when the front matter has a form this can't extend.
function withAlias(text, alias) {
  const { front } = splitFrontMatter(text);
  const entry = `  - ${JSON.stringify(alias)}`;
  if (!front) return `---\naliases:\n${entry}\n---\n\n${text}`;
  const block = BLOCK.exec(front);
  const [, nl, body] = block;
  let data;
  try {
    data = yaml.load(body);
  } catch {
    return null;
  }
  const aliases = data?.aliases;
  if (aliases === undefined || aliases === null) {
    const end = nl.length + 3 + body.length;
    const line = `${body ? nl : ""}aliases:${nl}${entry}`;
    return text.slice(0, end) + line + text.slice(end);
  }
  if (!Array.isArray(aliases)) return null;
  if (aliases.some((item) => aliasAddress(String(item)) === alias)) {
    return text;
  }
  const list = ALIAS_LIST.exec(body);
  if (!list) return null;
  const at = nl.length + 3 + list.index + list[0].length;
  const glue = list[0].endsWith("\n") ? "" : nl;
  return text.slice(0, at) + glue + entry + (glue ? "" : nl) + text.slice(at);
}

// Before a note moves from `from` to `to`, its old address joins its
// `aliases:` so links to it keep working; returns the note's bytes after.
async function recordAlias(file, target, { from, to, current }) {
  if (await statOf(target)) throw httpError(409, "Already exists");
  const old = decodeURIComponent(slugPath(from));
  if (old === decodeURIComponent(slugPath(to))) return current;
  const text = withAlias(current.toString("utf8"), old);
  if (text === null) {
    console.warn(
      `Not adding alias ${old} to ${to}: its front matter can't be extended`,
    );
    return current;
  }
  const bytes = Buffer.from(text);
  if (!bytes.equals(current)) await writeAtomic(file, bytes);
  return bytes;
}

module.exports = { aliasAddress, recordAlias };
