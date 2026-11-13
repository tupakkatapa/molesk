import { CONFIG, el, store } from "./dom.js";
import { redrawDiagrams } from "./mermaid.js";
import { mobileQuery, setSidebarOpen } from "./sidebar.js";
import "./search.js";

document.addEventListener("DOMContentLoaded", () => {
  const singleFileMode = document.body.classList.contains("single-file-mode");

  setupThemeToggle();
  setupKeyboardNavigation();
  if (!singleFileMode) {
    setupRssCopyLink();
  }
});

function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  store.set("theme", dark ? "dark" : "light");
  el.hljsLight.disabled = dark;
  el.hljsDark.disabled = !dark;
  syncThemeColor();
  redrawDiagrams();
}

// The new theme spreads from the toggle as a circle.
function toggleTheme() {
  const dark = document.documentElement.dataset.theme !== "dark";
  if (
    !document.startViewTransition ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    applyTheme(dark);
    return;
  }
  const rect = el.themeToggle.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );
  const { style } = document.documentElement;
  style.setProperty("--ripple-x", `${x}px`);
  style.setProperty("--ripple-y", `${y}px`);
  style.setProperty("--max-radius", `${radius}px`);
  document.startViewTransition(() => applyTheme(dark));
}

function syncThemeColor() {
  el.themeColor.content = getComputedStyle(document.body).backgroundColor;
}

function setupThemeToggle() {
  el.themeToggle.addEventListener("click", (e) => {
    e.preventDefault();
    toggleTheme();
  });
  syncThemeColor();
}

function setupKeyboardNavigation() {
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    const modal = document.querySelector(
      "dialog[open], .lightbox-overlay.active",
    );
    if (e.defaultPrevented || modal) return;

    switch (e.key) {
      case "t":
      case "T":
        e.preventDefault();
        el.themeToggle.click();
        break;
      case "e":
        if (document.querySelector(".edit-icon")) {
          e.preventDefault();
          document.querySelector(".edit-icon").click();
        }
        break;
      case "Escape":
        if (el.sidebar && mobileQuery.matches) setSidebarOpen(false);
        break;
    }
  });
}

function setupRssCopyLink() {
  const rssLink = document.querySelector(".rss-copy-link");
  if (!rssLink) return;

  rssLink.addEventListener("click", (e) => {
    if (!navigator.clipboard) return;
    e.preventDefault();
    navigator.clipboard.writeText(rssLink.href).then(() => {
      const icon = rssLink.querySelector("i");
      icon.classList.remove("fa-rss");
      icon.classList.add("fa-check");
      setTimeout(() => {
        icon.classList.remove("fa-check");
        icon.classList.add("fa-rss");
      }, CONFIG.COPY_BUTTON_RESET_DELAY);
    });
  });
}
