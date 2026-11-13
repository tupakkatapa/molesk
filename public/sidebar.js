import { CONFIG, el, store } from "./dom.js";
import { folderHref } from "./slug.mjs";

export const mobileQuery = window.matchMedia(
  `(max-width: ${CONFIG.MOBILE_BREAKPOINT}px)`,
);

function isSidebarOpen() {
  return !el.sidebar.classList.contains("collapsed");
}

export function setSidebarOpen(open) {
  const mobile = mobileQuery.matches;
  const overlay = open && mobile;
  const hadFocus = el.sidebar.contains(document.activeElement);
  el.sidebar.classList.toggle("collapsed", !open);
  el.container.classList.toggle("sidebar-collapsed", !open);
  el.backdrop.classList.toggle("active", overlay);
  document.body.classList.toggle("no-scroll", overlay);
  el.collapseBtn.setAttribute("aria-expanded", String(open));
  el.menuToggle.setAttribute("aria-expanded", String(open));
  el.sidebar.inert = !open;
  el.main.inert = overlay;
  if (overlay) {
    const row = el.sidebar.querySelector("li.active > .tree-row, .tree-row");
    row?.focus({ preventScroll: true });
  } else if (!open && hadFocus) {
    el.menuToggle.focus();
  }
}

function setupSidebarToggle() {
  el.collapseBtn.addEventListener("click", () =>
    setSidebarOpen(!isSidebarOpen()),
  );
  el.menuToggle.addEventListener("click", () => setSidebarOpen(true));
  el.backdrop.addEventListener("click", () => setSidebarOpen(false));
}

function setupSwipeGestures() {
  let start = null;

  document.addEventListener(
    "touchstart",
    (e) => {
      const touch = e.changedTouches[0];
      start =
        mobileQuery.matches && isSidebarOpen()
          ? { x: touch.clientX, y: touch.clientY }
          : null;
    },
    { passive: true },
  );

  document.addEventListener(
    "touchend",
    (e) => {
      if (!start) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      start = null;
      if (dx <= -CONFIG.SWIPE_THRESHOLD && -dx > 2 * Math.abs(dy)) {
        setSidebarOpen(false);
      }
    },
    { passive: true },
  );
}

function resetSidebarState() {
  el.sidebar.classList.add("no-transition");
  el.container.classList.add("no-transition");

  setSidebarOpen(!mobileQuery.matches);

  setTimeout(() => {
    el.sidebar.classList.remove("no-transition");
    el.container.classList.remove("no-transition");
  }, CONFIG.TRANSITION_DELAY);
}

const FOLDER_KEY = "folder:";

export function setFolderOpen(folder, open) {
  const row = folder.querySelector(":scope > .tree-row");
  row.setAttribute("aria-expanded", String(open));
  row.querySelector("i").classList.toggle("fa-folder-open", open);
  row.querySelector("i").classList.toggle("fa-folder", !open);
  folder.querySelector(":scope > ul").hidden = !open;
}

export const rememberFolder = (path, open) =>
  store.set(FOLDER_KEY + path, open ? "open" : "closed");

function openAncestors(item) {
  for (
    let folder = item.parentElement.closest("li.folder");
    folder;
    folder = folder.parentElement.closest("li.folder")
  ) {
    setFolderOpen(folder, true);
  }
}

// Folders remember being opened; the ones above the current note always
// start open.
export function applyFolderState() {
  for (const folder of document.querySelectorAll(".sidebar li.folder")) {
    if (store.get(FOLDER_KEY + folder.dataset.path) === "open") {
      setFolderOpen(folder, true);
    }
  }
  const current = document.querySelector(
    ".sidebar li.active, .sidebar li.folder.current",
  );
  if (current) openAncestors(current);
}

function setupFolderToggles() {
  el.sidebar.addEventListener("click", (e) => {
    const row = e.target.closest("li.folder > .tree-row");
    if (!row) return;
    const open = row.getAttribute("aria-expanded") !== "true";
    setFolderOpen(row.parentElement, open);
    rememberFolder(row.parentElement.dataset.path, open);
  });
}

// Marks the tree row for `href`: a note, or a folder on its index page.
export function markActiveLink(href) {
  for (const item of document.querySelectorAll(
    ".sidebar li.active, .sidebar li.current",
  )) {
    item.classList.remove("active", "current");
    item.querySelector(":scope > a")?.removeAttribute("aria-current");
  }
  const link = [...document.querySelectorAll(".sidebar a.tree-row")].find(
    (a) => a.getAttribute("href") === href,
  );
  const item = link
    ? link.parentElement
    : [...document.querySelectorAll(".sidebar li.folder")].find(
        (folder) => folderHref(folder.dataset.path) === href,
      );
  if (!item) return;
  item.classList.add(link ? "active" : "current");
  link?.setAttribute("aria-current", "page");
  openAncestors(item);
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.body.classList.contains("single-file-mode")) return;
  setupSidebarToggle();
  setupSwipeGestures();
  resetSidebarState();
  mobileQuery.addEventListener("change", resetSidebarState);
  setupFolderToggles();
  applyFolderState();
});
