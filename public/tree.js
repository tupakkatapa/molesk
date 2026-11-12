import { applyFolderState, rememberFolder } from "./sidebar.js";
import { editHref } from "./slug.mjs";

export const NOTE_PATTERN = /\.(?:md|txt)$/iu;

// The open page's or folder's path in the data dir; "" for the root.
export const shownPath = () =>
  document.querySelector("#file-content")?.dataset.path ?? "";

export const encodeNotePath = (notePath) =>
  notePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

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
  const file = NOTE_PATTERN.test(rel) ? rel : `${rel}.md`;
  const res = await fetch(`/api/files/${encodeNotePath(dir + file)}`, {
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

function rememberOpen(dir, rel) {
  let path = dir.slice(0, -1);
  for (const segment of rel.split("/")) {
    path = path ? `${path}/${segment}` : segment;
    rememberFolder(path, true);
  }
}

export async function refreshTree() {
  const res = await fetch(window.location.href);
  const doc = new DOMParser().parseFromString(await res.text(), "text/html");
  const fresh = doc.querySelector(".navigation-buttons");
  const nav = document.querySelector(".navigation-buttons");
  if (fresh && nav) nav.innerHTML = fresh.innerHTML;
  applyFolderState();
}

async function createFolder(row, dir, rel) {
  const res = await fetch(`/api/dirs/${encodeNotePath(dir + rel)}`, {
    method: "PUT",
  });
  if (!res.ok) {
    throw new Error(
      res.status === 409 ? "A page has that name" : await errorText(res),
    );
  }
  rememberOpen(dir, rel);
  await refreshTree();
}

let hintCount = 0;

function newRowForm(row) {
  const form = document.createElement("form");
  form.className = "tree-new-form";
  form.innerHTML =
    '<input type="text" class="tree-input" autocomplete="off" spellcheck="false" enterkeyhint="done" aria-label="New page name, end with / for a folder" placeholder="Name"><p class="tree-hint">End with / to make a folder</p><p class="tree-error" role="alert" hidden></p>';
  const hint = form.querySelector(".tree-hint");
  hintCount += 1;
  hint.id = `tree-hint-${hintCount}`;
  form.querySelector("input").setAttribute("aria-describedby", hint.id);
  row.append(form);
  return {
    form,
    input: form.querySelector("input"),
    error: form.querySelector(".tree-error"),
  };
}

function setRowError(form, message) {
  const input = form.querySelector(".tree-input");
  const error = form.querySelector(".tree-error");
  error.textContent = message;
  error.hidden = !message;
  form.querySelector(".tree-hint").hidden = Boolean(message);
  if (!message) {
    input.removeAttribute("aria-invalid");
    return;
  }
  input.setAttribute("aria-invalid", "true");
  input.focus();
  form.scrollIntoView({ block: "nearest" });
}

function openNewRow(row) {
  const button = row.querySelector(":scope > button");
  const { form, input } = newRowForm(row);
  let busy = false;
  const close = () => {
    form.remove();
    button.hidden = false;
  };
  const showError = (message) => setRowError(form, message);
  button.hidden = true;
  input.focus();
  form.scrollIntoView({ block: "nearest" });
  input.addEventListener("input", () => setRowError(form, ""));
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    close();
    button.focus();
  });
  input.addEventListener("blur", () => {
    if (!busy && !input.value.trim()) close();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy || !input.value.trim()) return;
    const parsed = parseName(input.value);
    if (parsed.error) return showError(parsed.error);
    busy = true;
    row.classList.add("busy");
    try {
      const { dir } = button.dataset;
      if (parsed.folder) await createFolder(row, dir, parsed.rel);
      else await createNote(dir, parsed.rel);
    } catch (err) {
      busy = false;
      row.classList.remove("busy");
      showError(err.message || "Couldn't create it, try again");
    }
  });
}

document.addEventListener("click", (e) => {
  const button = e.target.closest(".tree-new > button");
  if (button) openNewRow(button.parentElement);
});
