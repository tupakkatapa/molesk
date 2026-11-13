import { replaceRange } from "./editor-format.js";
import { report } from "./editor.js";
import { encode } from "./slug.mjs";

const historyUrl = (notePath) => `/api/history/${encode(notePath)}`;
const when = (date) =>
  new Date(date).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

function versionRow(version, restore) {
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "history-version";
  const date = document.createElement("time");
  date.dateTime = version.date;
  date.textContent = when(version.date);
  const subject = document.createElement("span");
  subject.textContent = version.subject;
  button.append(date, subject);
  button.addEventListener("click", () => restore(version));
  item.append(button);
  return item;
}

// Restoring replaces the text as one undoable edit and keeps the note's
// current front matter; autosave then saves it as a new version.
async function restore(ed, dialog, version) {
  const status = dialog.querySelector(".history-status");
  if (ed.blocked) {
    status.textContent = "Resolve the conflict first.";
    return;
  }
  const res = await fetch(
    `${historyUrl(version.path)}?at=${encodeURIComponent(version.commit)}`,
  ).catch(() => null);
  if (!res?.ok) {
    status.textContent = "That version couldn't be loaded.";
    return;
  }
  const { body } = await res.json();
  // The modal makes the page inert; the text can take focus, and the edit
  // join the undo stack, only once it is closed
  dialog.close();
  const { textarea } = ed.ui;
  replaceRange(textarea, 0, textarea.value.length, body);
  report(ed, `Restored ${when(version.date)}`);
}

async function showHistory(ed, dialog) {
  const status = dialog.querySelector(".history-status");
  const list = dialog.querySelector(".history-list");
  list.replaceChildren();
  status.textContent = "Loading…";
  dialog.showModal();
  const res = await fetch(historyUrl(ed.path)).catch(() => null);
  if (!res?.ok) {
    status.textContent = "History is unavailable right now.";
    return;
  }
  const { versions, error } = await res.json();
  status.textContent = error
    ? `History paused: ${error}`
    : versions.length === 0
      ? "No versions yet."
      : "";
  list.replaceChildren(
    ...versions.map((version) =>
      versionRow(version, (chosen) => restore(ed, dialog, chosen)),
    ),
  );
}

document.addEventListener("editor:ready", (e) => {
  const ed = e.detail;
  const item = ed.ui.menu.querySelector(".editor-history");
  const dialog = document.querySelector("#historyDialog");
  if (!item || !dialog) return;
  item.addEventListener("click", () => showHistory(ed, dialog));
});
