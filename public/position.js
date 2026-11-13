import { store } from "./dom.js";

const KEY = "reading-positions";
const MAX_PAGES = 50;
const SAVE_DELAY = 300;
const END_MARGIN = 100;
const enabled = Boolean(document.querySelector("#file-content[data-position]"));

const load = () => {
  try {
    return new Map(JSON.parse(store.get(KEY)) ?? []);
  } catch {
    return new Map();
  }
};

// Where the reader is on this page; forgotten near its top and at its end,
// and for the pages read longest ago beyond MAX_PAGES.
function remember() {
  const pages = load();
  const { pathname } = window.location;
  const top = Math.round(window.scrollY);
  const end = document.documentElement.scrollHeight - window.innerHeight;
  pages.delete(pathname);
  if (top >= window.innerHeight && top < end - END_MARGIN) {
    pages.set(pathname, top);
  }
  const kept = [...pages].slice(-MAX_PAGES);
  store.set(KEY, JSON.stringify(kept));
}

// A page opens where it was left, unless the address names a heading.
export function restorePosition() {
  if (!enabled || window.location.hash) return;
  const top = load().get(window.location.pathname);
  if (top) window.scrollTo({ top, behavior: "instant" });
}

let timer = null;
if (enabled) {
  window.addEventListener(
    "scroll",
    () => {
      clearTimeout(timer);
      timer = setTimeout(remember, SAVE_DELAY);
    },
    { passive: true },
  );
  restorePosition();
  window.addEventListener("load", restorePosition, { once: true });
}
