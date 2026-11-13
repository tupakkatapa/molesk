import { enhance } from "./content.js";
import { store } from "./dom.js";
import { setSidebarOpen } from "./sidebar.js";
import { pageHref } from "./slug.mjs";

const PREVIEW_DELAY = 250;
const SPLIT_KEY = "editor:split";

// A player already showing a clip takes the place of its new copy, so the
// clip goes on playing while the text around it changes. It moves within
// the page: a trip through the template's own document would pause it.
function keepPlayers(preview, shown) {
  for (const video of preview.querySelectorAll("video[src]")) {
    const player = shown.get(video.src);
    if (!player) continue;
    shown.delete(video.src);
    player.setAttribute(
      "aria-label",
      video.getAttribute("aria-label") || "Video",
    );
    video.replaceWith(player);
  }
}

const playersOf = (preview) =>
  new Map(
    [...preview.querySelectorAll(".player")]
      .reverse()
      .map((player) => [player.querySelector("video").src, player]),
  );

// Relative images and videos resolve against the page's own address, not
// the editor's.
async function renderPreview(preview, text, page) {
  try {
    const res = await fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
      body: text,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = document.createElement("template");
    html.innerHTML = await res.text();
    for (const media of html.content.querySelectorAll("img[src], video[src]")) {
      media.src = new URL(media.getAttribute("src"), page).href;
    }
    const shown = playersOf(preview);
    preview.replaceChildren(html.content);
    keepPlayers(preview, shown);
    enhance(preview);
  } catch {
    preview.innerHTML =
      '<p class="editor-preview-error">Preview unavailable right now.</p>';
  }
}

// Write | Split | Preview; Split, offered on wide screens only, is
// remembered and makes room by hiding the sidebar.
function setupPreview(root, textarea) {
  const preview = root.querySelector(".editor-preview");
  const page = new URL(pageHref(root.dataset.path), window.location.href);
  const modes = root.querySelectorAll(".editor-mode [data-mode]");
  const wide = matchMedia("(min-width: 1000px)");
  let mode = store.get(SPLIT_KEY) === "true" ? "split" : "write";
  let timer = null;

  const apply = () => {
    const shown = mode === "split" && !wide.matches ? "write" : mode;
    root.classList.toggle("split", shown === "split");
    preview.hidden = shown === "write";
    textarea.hidden = shown === "preview";
    for (const button of modes) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.mode === shown),
      );
    }
    if (shown !== "write") renderPreview(preview, textarea.value, page);
  };

  root.querySelector(".editor-mode").addEventListener("click", (e) => {
    const button = e.target.closest("[data-mode]");
    if (!button) return;
    ({ mode } = button.dataset);
    store.set(SPLIT_KEY, String(mode === "split"));
    if (mode === "split") setSidebarOpen(false);
    apply();
    if (mode !== "preview") textarea.focus();
  });
  textarea.addEventListener("input", () => {
    if (preview.hidden) return;
    clearTimeout(timer);
    timer = setTimeout(
      () => renderPreview(preview, textarea.value, page),
      PREVIEW_DELAY,
    );
  });
  wide.addEventListener("change", apply);
  if (mode === "split" && wide.matches) setSidebarOpen(false);
  apply();
}

document.addEventListener("editor:ready", (e) =>
  setupPreview(e.target, e.detail.ui.textarea),
);
