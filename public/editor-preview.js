import { enhanceCode } from "./content.js";
import { setSidebarOpen } from "./sidebar.js";
import { pageHref } from "./slug.mjs";

const PREVIEW_DELAY = 250;
const SPLIT_KEY = "editor:split";

// Relative images resolve against the page's own address, not the editor's.
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
    for (const img of html.content.querySelectorAll("img[src]")) {
      img.src = new URL(img.getAttribute("src"), page).href;
    }
    preview.replaceChildren(html.content);
    enhanceCode(preview);
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
  let mode = localStorage.getItem(SPLIT_KEY) === "true" ? "split" : "write";
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
    localStorage.setItem(SPLIT_KEY, String(mode === "split"));
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
