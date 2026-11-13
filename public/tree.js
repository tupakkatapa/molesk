import { applyFolderState, rememberFolder } from "./sidebar.js";
import { createNote, errorText, parseName } from "./api.js";
import { encode } from "./slug.mjs";

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
  const res = await fetch(`/api/dirs/${encode(dir + rel)}`, {
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
