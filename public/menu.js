function placeMenu(menu, button) {
  const box = button.getBoundingClientRect();
  menu.style.top = `${box.bottom + 6}px`;
  menu.style.right = `${Math.max(8, window.innerWidth - box.right)}px`;
}

// A popover menu under its ⋯ button: the first item takes focus and the
// arrow keys move between items.
export function setupMenu(menu, button) {
  const items = () => [...menu.querySelectorAll("[role=menuitem]")];
  menu.addEventListener("beforetoggle", (e) => {
    if (e.newState === "open") placeMenu(menu, button);
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
