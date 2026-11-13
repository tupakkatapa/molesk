import { editHref, encode, NOTE_EXT } from "./slug.mjs";

export async function errorText(res) {
  try {
    return (await res.json()).error || `Error ${res.status}`;
  } catch {
    return `Error ${res.status}`;
  }
}

export function parseName(value) {
  const name = value.trim();
  const folder = name.endsWith("/");
  const segments = name
    .replace(/\/+$/u, "")
    .split("/")
    .map((segment) => segment.trim());
  if (segments.some((segment) => !segment)) {
    return { error: "Add a name between the slashes" };
  }
  if (segments.some((segment) => segment.startsWith("."))) {
    return { error: "Names can't start with a dot" };
  }
  return { folder, rel: segments.join("/") };
}

const CREATE_ERRORS = {
  409: "Something with that name is in the way",
  412: "A page with that name already exists",
};

// Local calendar date, as YYYY-MM-DD.
const today = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);

export async function createNote(dir, rel) {
  const file = NOTE_EXT.test(rel) ? rel : `${rel}.md`;
  const res = await fetch(`/api/files/${encode(dir + file)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "If-None-Match": "*",
    },
    body: `---\ndate: "${today()}"\n---\n\n`,
  });
  if (!res.ok)
    throw new Error(CREATE_ERRORS[res.status] || (await errorText(res)));
  window.location.assign(editHref(dir + file));
}
