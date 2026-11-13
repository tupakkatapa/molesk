import { setupMenu } from "./menu.js";
import { errorText, parseName } from "./api.js";
import { encode, folderHref } from "./slug.mjs";
import "./tree.js";

const TASK_LINE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[[ xX]\]/u;
const TOAST_TIME = 4000;

function toast(message) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(Number(el.dataset.timer));
  el.dataset.timer = String(
    setTimeout(() => el.classList.remove("show"), TOAST_TIME),
  );
}

class ChangedElsewhere extends Error {}

// The note's ETag rides on its edit link; a toggle only edits the text the
// page was rendered from, and each save moves the ETag on.
async function toggleTask(box) {
  const note = document.querySelector("#file-content .edit-icon");
  const url = `/api/files/${encode(document.querySelector("#file-content").dataset.path)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const etag = res.headers.get("ETag");
  if (etag !== note.dataset.etag) throw new ChangedElsewhere();
  const lines = (await res.text()).split("\n");
  const index = Number(box.dataset.line);
  if (!TASK_LINE.test(lines[index] ?? "")) throw new ChangedElsewhere();
  lines[index] = lines[index].replace(
    TASK_LINE,
    `$1[${box.checked ? "x" : " "}]`,
  );
  const saved = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "If-Match": etag,
    },
    body: lines.join("\n"),
  });
  if (saved.status === 412) throw new ChangedElsewhere();
  if (!saved.ok) throw new Error(`HTTP ${saved.status}`);
  note.dataset.etag = saved.headers.get("ETag");
}

// Toggles run one at a time so each reads the previous one's result.
let taskQueue = Promise.resolve();

function setupTasks() {
  for (const box of document.querySelectorAll("#file-content .task-box")) {
    box.disabled = false;
  }
}

document.addEventListener("change", (e) => {
  const box = e.target.closest("#file-content .task-box");
  if (!box) return;
  taskQueue = taskQueue
    .then(() => toggleTask(box))
    .catch((err) => {
      if (err instanceof ChangedElsewhere) {
        window.location.reload();
        return;
      }
      box.checked = !box.checked;
      toast("Couldn't save that, try again");
    });
});

function folderError(index, message) {
  const error = index.querySelector(".folder-error");
  error.textContent = message;
  error.hidden = !message;
}

async function renameFolder(actions, input) {
  const { path, name, parent } = actions.dataset;
  const value = input.value.trim();
  if (!value || value === name) return true;
  const parsed = parseName(value);
  if (parsed.error || parsed.folder || parsed.rel.includes("/")) {
    throw new Error(parsed.error || "Use a name without slashes");
  }
  const to =
    parent === "/" ? parsed.rel : `${path.slice(0, -name.length)}${parsed.rel}`;
  const res = await fetch("/api/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from: path, to }),
  });
  if (res.status === 409) throw new Error("Something with that name exists");
  if (!res.ok) throw new Error(await errorText(res));
  window.location.assign(folderHref(to));
  return false;
}

function startFolderRename(index) {
  const actions = index.querySelector(".folder-actions");
  const heading = index.querySelector(".folder-head h1");
  const form = document.createElement("form");
  form.className = "folder-rename";
  form.innerHTML =
    '<input class="folder-title-input" aria-label="Folder name" autocomplete="off" spellcheck="false" enterkeyhint="done"><button type="button" class="btn folder-cancel">Cancel</button><button class="btn btn-primary">Save</button>';
  const input = form.querySelector("input");
  input.value = actions.dataset.name;
  heading.hidden = true;
  actions.hidden = true;
  heading.after(form);
  input.focus();
  input.select();
  const close = () => {
    form.remove();
    heading.hidden = false;
    actions.hidden = false;
    folderError(index, "");
    actions.querySelector("button").focus();
  };
  form.querySelector(".folder-cancel").addEventListener("click", close);
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    close();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      if (await renameFolder(actions, input)) close();
    } catch (err) {
      folderError(index, err.message);
    }
  });
  input.addEventListener("input", () => folderError(index, ""));
}

async function deleteFolder(index) {
  const { path, parent } = index.querySelector(".folder-actions").dataset;
  const res = await fetch(`/api/dirs/${encode(path)}`, {
    method: "DELETE",
  });
  if (res.status === 409) return folderError(index, "This folder isn't empty");
  if (!res.ok) return folderError(index, await errorText(res));
  window.location.assign(parent);
}

document.addEventListener("click", (e) => {
  const index = e.target.closest(".folder-index");
  if (!index) return;
  const menu = index.querySelector("#folderMenu");
  if (e.target.closest(".folder-rename-item")) {
    menu.hidePopover();
    startFolderRename(index);
  }
  if (e.target.closest(".folder-delete")) {
    menu.hidePopover();
    const dialog = index.querySelector(".folder-confirm");
    dialog.returnValue = "";
    dialog.showModal();
    dialog.addEventListener(
      "close",
      () => {
        if (dialog.returnValue === "delete") deleteFolder(index);
      },
      { once: true },
    );
  }
});

function setupFolderMenu() {
  const menu = document.querySelector("#folderMenu");
  if (menu) setupMenu(menu, document.querySelector(".folder-more"));
}

for (const event of ["DOMContentLoaded", "content:loaded"]) {
  document.addEventListener(event, setupTasks);
  document.addEventListener(event, setupFolderMenu);
}
