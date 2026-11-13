// Page addresses: each segment lowercased, apostrophes dropped and any other
// run of characters that are not letters or digits turned into one "-";
// a page's own segment loses its .md/.txt extension.
export const NOTE_EXT = /\.(?:md|txt)$/iu;

export function slugSegment(name) {
  const slug = name
    .normalize("NFC")
    .toLowerCase()
    .replaceAll(/['’]/gu, "")
    .replaceAll(/[^\p{L}\p{N}]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");
  return slug || name.toLowerCase();
}

export const slugNote = (name) => slugSegment(name.replace(NOTE_EXT, ""));

export const encode = (rel) =>
  rel
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

// `rel` uses "/" separators.
export function slugPath(rel, { note = true } = {}) {
  const segments = rel.split("/").filter(Boolean);
  return encode(
    segments
      .map((segment, i) =>
        note && i === segments.length - 1
          ? slugNote(segment)
          : slugSegment(segment),
      )
      .join("/"),
  );
}

export const pageHref = (rel) => `/content/${slugPath(rel)}`;
export const editHref = (rel) => `/edit/${slugPath(rel)}`;
export const downloadHref = (rel) => `/download/${slugPath(rel)}`;
export const tagHref = (slug) => `/tags/${encodeURIComponent(slug)}/`;
export const folderHref = (rel) =>
  rel ? `/content/${slugPath(rel, { note: false })}/` : "/";
