import { errorText } from "./api.js";
import { encode } from "./slug.mjs";
import { withTags } from "./front.mjs";

const SAVE_DELAY = 800;
const STATUS = {
  saved: "Saved",
  saving: "Saving…",
  offline: "Offline — not saved",
};

function createEditor(root) {
  const ui = {
    root,
    textarea: root.querySelector(".editor-text"),
    statuses: document.querySelectorAll(".editor-status"),
    conflict: root.querySelector(".editor-conflict"),
    title: root.querySelector(".editor-title"),
    tags: root.querySelector(".editor-tags"),
    titleError: root.querySelector(".editor-title-error"),
    done: root.querySelector(".editor-done"),
    menu: document.querySelector("#editorMenu"),
    dialog: document.querySelector("#deleteDialog"),
  };
  return {
    ui,
    path: root.dataset.path,
    etag: root.dataset.etag,
    front: root.dataset.front,
    acked: root.dataset.front + ui.textarea.defaultValue,
    inflight: null,
    pending: null,
    timer: null,
    again: false,
    draining: null,
    blocked: false,
    offline: false,
    failed: false,
  };
}

export const fileText = (ed) => ed.front + ed.ui.textarea.value;
export const isDirty = (ed) => fileText(ed) !== ed.acked;
export function report(ed, text) {
  for (const status of ed.ui.statuses) status.textContent = text;
}
export const noteUrl = (ed) => `/api/files/${encode(ed.path)}`;
const precondition = (ed) =>
  ed.etag ? { "If-Match": ed.etag } : { "If-None-Match": "*" };

const put = (ed, body, headers, extra = {}) =>
  fetch(noteUrl(ed), {
    method: "PUT",
    headers: { "Content-Type": "text/markdown; charset=utf-8", ...headers },
    body,
    ...extra,
  });

export function showConflict(ed) {
  ed.blocked = true;
  ed.ui.conflict.hidden = false;
  ed.ui.root.classList.add("conflicted");
  report(ed, "");
}

async function settle(ed, res, body) {
  ed.offline = false;
  if (res.status === 412) return showConflict(ed);
  if (!res.ok) {
    ed.failed = true;
    return report(ed, await errorText(res));
  }
  ed.etag = res.headers.get("ETag");
  ed.acked = body;
  report(ed, isDirty(ed) ? STATUS.saving : STATUS.saved);
}

const hex = (buffer) =>
  [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

// The ETag the server will give `text`, or null without WebCrypto (plain
// HTTP off loopback).
async function etagOf(text) {
  if (!crypto.subtle) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return `"sha256-${hex(digest)}"`;
}

// `ed.pending` is the save in flight, so leaving can chain onto it.
async function send(ed, body, headers = precondition(ed)) {
  ed.pending = { body, etag: null };
  ed.pending.etag = await etagOf(body);
  try {
    await settle(ed, await put(ed, body, headers), body);
  } catch {
    ed.offline = true;
    report(ed, STATUS.offline);
  }
}

// One save in flight at a time; text typed meanwhile goes in the next one,
// sent with the ETag the previous one returned.
async function drain(ed) {
  do {
    ed.again = false;
    if (ed.blocked) return;
    if (!isDirty(ed) && ed.etag) {
      report(ed, STATUS.saved);
      return;
    }
    report(ed, STATUS.saving);
    ed.inflight = send(ed, fileText(ed));
    await ed.inflight;
    ed.inflight = null;
  } while (
    (ed.again || isDirty(ed)) &&
    !ed.blocked &&
    !ed.offline &&
    !ed.failed &&
    !ed.timer
  );
}

// Resolves once the text is saved, or saving stopped on a conflict or error.
export function flush(ed) {
  clearTimeout(ed.timer);
  ed.timer = null;
  ed.failed = false;
  if (ed.draining) {
    ed.again = true;
    return ed.draining;
  }
  ed.draining = drain(ed).finally(() => {
    ed.draining = null;
  });
  return ed.draining;
}

function schedule(ed) {
  clearTimeout(ed.timer);
  report(ed, STATUS.saving);
  ed.timer = setTimeout(() => flush(ed), SAVE_DELAY);
}

async function keepMine(ed) {
  ed.blocked = false;
  ed.ui.conflict.hidden = true;
  ed.ui.root.classList.remove("conflicted");
  report(ed, STATUS.saving);
  const body = fileText(ed);
  ed.inflight = (async () => {
    let res = await put(ed, body, { "If-Match": "*" });
    if (res.status === 412) res = await put(ed, body, { "If-None-Match": "*" });
    await settle(ed, res, body);
  })().catch(() => report(ed, STATUS.offline));
  await ed.inflight;
  ed.inflight = null;
}

const MAX_COPIES = 100;

// Mine goes to a sibling "<name> (conflict).md", or "(conflict 2)" and so
// on when that is taken, before theirs is loaded.
async function loadTheirs(ed) {
  const { dir, ext } = ed.ui.root.dataset;
  const name = ed.path.slice(dir.length, -ext.length);
  for (let n = 1; n <= MAX_COPIES; n++) {
    const copy = `${dir}${name} (conflict${n > 1 ? ` ${n}` : ""})${ext}`;
    const res = await fetch(`/api/files/${encode(copy)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "If-None-Match": "*",
      },
      body: fileText(ed),
    }).catch(() => null);
    if (!res) return report(ed, STATUS.offline);
    if (res.ok) {
      ed.acked = fileText(ed);
      window.location.reload();
      return;
    }
    if (res.status !== 412) return report(ed, await errorText(res));
  }
  report(ed, "Couldn't save a copy of yours");
}

const leaving = (e, link) =>
  e.defaultPrevented ||
  e.button !== 0 ||
  e.metaKey ||
  e.ctrlKey ||
  e.shiftKey ||
  e.altKey ||
  link.target ||
  link.hasAttribute("download");

// Links wait for the pending save instead of asking to discard it.
function guardLeaving(ed) {
  window.addEventListener("beforeunload", (e) => {
    if (isDirty(ed) || ed.inflight) e.preventDefault();
  });
  document.addEventListener("click", async (e) => {
    const link = e.target.closest("a[href]");
    if (!link || leaving(e, link) || (!isDirty(ed) && !ed.inflight)) return;
    e.preventDefault();
    await flush(ed);
    window.location.assign(link.href);
  });
  window.addEventListener("pagehide", () => {
    const pending = ed.inflight ? ed.pending : null;
    if (ed.blocked || fileText(ed) === (pending?.body ?? ed.acked)) return;
    clearTimeout(ed.timer);
    const etag = pending?.etag ?? ed.etag;
    const headers = etag ? { "If-Match": etag } : { "If-None-Match": "*" };
    put(ed, fileText(ed), headers, { keepalive: true });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(ed);
  });
}

function setupKeys(ed) {
  window.addEventListener(
    "keydown",
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        flush(ed);
        return;
      }
      const overlay = document.querySelector("dialog[open], :popover-open");
      if (e.key !== "Escape" || overlay || e.target === ed.ui.title) return;
      e.preventDefault();
      ed.ui.done.click();
    },
    true,
  );
}

function setupSaving(ed) {
  const { textarea } = ed.ui;
  textarea.addEventListener("input", () => schedule(ed));
  ed.ui.tags.addEventListener("input", () => {
    ed.front = withTags(ed.front, ed.ui.tags.value.split(","));
    schedule(ed);
  });
  textarea.addEventListener("blur", () => {
    if (isDirty(ed)) flush(ed);
  });
  window.addEventListener("online", () => {
    if (ed.offline) flush(ed);
  });
  ed.ui.conflict
    .querySelector(".editor-keep")
    .addEventListener("click", () => keepMine(ed));
  ed.ui.conflict
    .querySelector(".editor-load")
    .addEventListener("click", () => loadTheirs(ed));
}

function setupGrow(textarea) {
  if (CSS.supports("field-sizing", "content")) return;
  const grow = () => {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  textarea.addEventListener("input", grow);
  new ResizeObserver(grow).observe(textarea);
}

function focusFreshNote(textarea) {
  if (!textarea.value) textarea.focus();
}

function setupEditor() {
  const root = document.querySelector("#editor");
  if (!root) return;
  const ed = createEditor(root);
  setupGrow(ed.ui.textarea);
  setupSaving(ed);
  // Text typed while the scripts were still loading differs from what the
  // server sent, and is saved like any other edit.
  if (isDirty(ed)) schedule(ed);
  guardLeaving(ed);
  setupKeys(ed);
  root.dispatchEvent(
    new CustomEvent("editor:ready", { bubbles: true, detail: ed }),
  );
  focusFreshNote(ed.ui.textarea);
}

document.addEventListener("DOMContentLoaded", setupEditor);
