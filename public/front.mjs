const TAGS = /^tags:.*(?:\r?\n(?:[ \t]+|-[ \t]).*)*\r?\n?/mu;
const EMPTY = /^---\r?\n---/u;

// The front matter block `front` with its tags set to `tags`; the rest of
// the block stays as written. No tags and nothing else leaves no block.
export function withTags(front, tags) {
  const names = tags.map((tag) => tag.trim()).filter(Boolean);
  const line =
    names.length > 0
      ? `tags: [${names.map((name) => JSON.stringify(name)).join(", ")}]\n`
      : "";
  if (!front) return line && `---\n${line}---\n\n`;
  const next = TAGS.test(front)
    ? front.replace(TAGS, () => line)
    : front.replace(/^---\r?\n/u, (open) => open + line);
  return EMPTY.test(next) ? "" : next;
}
