import {
  fileText,
  flush,
  isDirty,
  noteUrl,
  report,
  showConflict,
} from "./editor.js";
import { slugPath } from "./slug.mjs";
import { errorText, NOTE_PATTERN, parseName, refreshTree } from "./tree.js";
import { setupMenu } from "./menu.js";

const TITLE_ERRORS = {
  409: "A page with that name already exists",
  404: "This page no longer exists",
};

function showTitleError(ed, message) {
  ed.ui.titleError.textContent = message;
  ed.ui.titleError.hidden = !message;
  if (message) ed.ui.title.setAttribute("aria-invalid", "true");
  else ed.ui.title.removeAttribute("aria-invalid");
}

const noteName = (notePath) =>
  notePath.split("/").pop().replace(NOTE_PATTERN, "");

function targetPath(ed, value) {
  const parsed = parseName(value);
  if (parsed.error) return parsed;
  if (parsed.folder) return { error: "A page name can't end with /" };
  const { dir, ext } = ed.ui.root.dataset;
  const file = NOTE_PATTERN.test(parsed.rel) ? parsed.rel : parsed.rel + ext;
  return { path: dir + file };
}

function moved(ed, to) {
  const href = slugPath(to);
  const sameFolder =
    to.slice(0, to.lastIndexOf("/") + 1) === ed.ui.root.dataset.dir;
  ed.path = to;
  if (!sameFolder) {
    window.location.replace(`/edit/${href}`);
    return;
  }
  window.history.replaceState(null, "", `/edit/${href}`);
  for (const done of document.querySelectorAll(".editor-done")) {
    done.href = `/content/${href}`;
  }
  document.querySelector(".topbar-title").textContent = noteName(to);
  ed.ui.title.value = noteName(to);
  document.title = document.title.replace(/^.*? - /u, `${noteName(to)} - `);
  const download = ed.ui.menu.querySelector("a[download]");
  if (download) download.href = `/download/${href}`;
  ed.ui.dialog.querySelector(".confirm-name").textContent = noteName(to);
  refreshTree();
}

async function rename(ed) {
  const { title } = ed.ui;
  if (title.value.trim() === noteName(ed.path)) return showTitleError(ed, "");
  const target = targetPath(ed, title.value);
  if (target.error) return showTitleError(ed, target.error);
  await flush(ed);
  if (ed.blocked || isDirty(ed)) return;
  if (!ed.etag) return moved(ed, target.path);
  const res = await fetch("/api/move", {
    method: "POST",
    headers: { "Content-Type": "application/json", "If-Match": ed.etag },
    body: JSON.stringify({ from: ed.path, to: target.path }),
  }).catch(() => null);
  if (!res) return showTitleError(ed, "Offline — not renamed");
  if (res.status === 412) return showConflict(ed);
  if (!res.ok) {
    return showTitleError(
      ed,
      TITLE_ERRORS[res.status] || (await errorText(res)),
    );
  }
  showTitleError(ed, "");
  // The move adds the old address to the note's aliases, so the editor
  // takes the front matter and ETag the server now has.
  const { front } = await res.json();
  if (typeof front === "string") {
    ed.front = front;
    ed.acked = front + ed.ui.textarea.value;
  }
  ed.etag = res.headers.get("ETag") ?? ed.etag;
  moved(ed, target.path);
}

function setupRename(ed) {
  const { title } = ed.ui;
  let pending = null;
  const commit = () => {
    pending ??= rename(ed).finally(() => (pending = null));
    return pending;
  };
  title.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      title.value = noteName(ed.path);
      showTitleError(ed, "");
    }
  });
  title.addEventListener("input", () => showTitleError(ed, ""));
  title.addEventListener("blur", commit);
}

async function trashNote(ed) {
  clearTimeout(ed.timer);
  await ed.draining;
  const after = ed.ui.root.dataset.afterDelete;
  if (ed.etag) {
    const res = await fetch(noteUrl(ed), {
      method: "DELETE",
      headers: { "If-Match": ed.etag },
    }).catch(() => null);
    if (!res) return report(ed, "Offline — not deleted");
    if (res.status === 412) return showConflict(ed);
    if (!res.ok) return report(ed, await errorText(res));
  }
  ed.acked = fileText(ed);
  window.location.assign(after);
}

function setupDeleteMenu(ed) {
  const { menu, dialog } = ed.ui;
  setupMenu(menu, ed.ui.root.querySelector(".editor-more"));
  menu.querySelector(".editor-delete").addEventListener("click", () => {
    menu.hidePopover();
    dialog.returnValue = "";
    dialog.showModal();
  });
  dialog.addEventListener("close", () => {
    if (dialog.returnValue === "delete") trashNote(ed);
    else ed.ui.textarea.focus();
  });
}

document.addEventListener("editor:ready", (e) => {
  setupRename(e.detail);
  setupDeleteMenu(e.detail);
});
