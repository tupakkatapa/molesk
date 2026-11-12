const { asyncHandler, byName } = require("./helpers");
const { siteIndex } = require("./site");

const MAX_QUERY = 100;
const MIN_QUERY = 2;
const MAX_RESULTS = 20;
const SNIPPET = 120;
const LEAD = 40;
const MARKS = /\p{M}/gu;

// Case and accents folded away, with where each folded character's source
// character starts and ends in `text`.
function fold(text) {
  let folded = "";
  const starts = [];
  const ends = [];
  let at = 0;
  for (const char of text) {
    const plain = char.normalize("NFKD").replaceAll(MARKS, "").toLowerCase();
    for (let i = 0; i < plain.length; i++) {
      starts.push(at);
      ends.push(at + char.length);
    }
    folded += plain;
    at += char.length;
  }
  return { folded, starts, ends };
}

// Folded text is kept per note record, which the site index reuses while
// the note is unchanged.
const entries = new WeakMap();
function entryOf(note) {
  let entry = entries.get(note);
  if (!entry) {
    entry = {
      path: note.rel,
      title: note.title,
      text: note.text,
      titleFolded: fold(note.title).folded,
      folded: fold(note.text).folded,
    };
    entries.set(note, entry);
  }
  return entry;
}

// ponytail: a linear scan over every page's text, fine for thousands of
// pages; an inverted index if it is ever measured slow.
async function corpusOf(config) {
  const { notes } = await siteIndex(config).get();
  return notes.map((note) => entryOf(note));
}

// About SNIPPET characters of text around the hit at folded index `at`,
// starting on a word.
function snippetOf(text, at, length) {
  if (at < 0) {
    const after = text.slice(0, SNIPPET);
    return {
      before: "",
      match: "",
      after: after + (after === text ? "" : "…"),
    };
  }
  const { starts, ends } = fold(text);
  const start = starts[at];
  const end = ends[at + length - 1];
  let from = Math.max(0, start - LEAD);
  if (from > 0) from = text.indexOf(" ", from) + 1 || from;
  if (from > start) from = start;
  const to = Math.min(text.length, Math.max(end, from + SNIPPET));
  return {
    before: (from > 0 ? "…" : "") + text.slice(from, start),
    match: text.slice(start, end),
    after: text.slice(end, to) + (to < text.length ? "…" : ""),
  };
}

function search(entries, query) {
  const hits = [];
  for (const entry of entries) {
    const title = entry.titleFolded.includes(query);
    const first = entry.folded.indexOf(query);
    let count = 0;
    for (let i = first; i !== -1; i = entry.folded.indexOf(query, i + 1)) {
      count++;
    }
    if (title || count) hits.push({ entry, title, count, first });
  }
  hits.sort(
    (a, b) =>
      b.title - a.title ||
      b.count - a.count ||
      byName(a.entry.path, b.entry.path),
  );
  return hits.slice(0, MAX_RESULTS).map(({ entry, first }) => ({
    path: entry.path,
    title: entry.title,
    ...snippetOf(entry.text, first, query.length),
  }));
}

// Pages whose name or text holds `q`, as JSON; in read-only mode
// published pages only.
function searchRoute(config) {
  return asyncHandler(async (req, res) => {
    const query = fold(String(req.query.q ?? "").slice(0, MAX_QUERY))
      .folded.replaceAll(/\s+/gu, " ")
      .trim();
    res.json(
      query.length < MIN_QUERY ? [] : search(await corpusOf(config), query),
    );
  });
}

module.exports = { searchRoute };
