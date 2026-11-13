function placeMenu(menu, button, above) {
  const box = button.getBoundingClientRect();
  menu.style.top = above ? "auto" : `${box.bottom + 6}px`;
  if (above) menu.style.bottom = `${window.innerHeight - box.top + 6}px`;
  menu.style.right = `${Math.max(8, window.innerWidth - box.right)}px`;
}

// A popover menu under its button, or above it: the first item takes focus
// and the arrow keys move between items.
export function setupMenu(menu, button, { above = false } = {}) {
  const items = () => [...menu.querySelectorAll("[role=menuitem]")];
  menu.addEventListener("beforetoggle", (e) => {
    if (e.newState === "open") placeMenu(menu, button, above);
  });
  menu.addEventListener("toggle", (e) => {
    button.setAttribute("aria-expanded", String(e.newState === "open"));
    if (e.newState === "open") items()[0].focus();
  });
  menu.addEventListener("keydown", (e) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const list = items();
    const next = list.indexOf(document.activeElement) + step;
    list.at(next % list.length).focus();
  });
}
