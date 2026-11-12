import { setFolderOpen } from "./sidebar.js";

function applyFilter(nav, query) {
  nav.classList.toggle("filtering", query !== "");
  let shown = 0;
  for (const item of nav.querySelectorAll("li.note")) {
    item.hidden =
      query !== "" && !item.textContent.toLowerCase().includes(query);
    if (!item.hidden) shown += 1;
  }
  for (const folder of [...nav.querySelectorAll("li.folder")].reverse()) {
    const row = folder.querySelector(":scope > .tree-row");
    if (query === "") {
      folder.hidden = false;
      if (folder.dataset.wasOpen) {
        setFolderOpen(folder, folder.dataset.wasOpen === "true");
        delete folder.dataset.wasOpen;
      }
      continue;
    }
    folder.dataset.wasOpen ??= row.getAttribute("aria-expanded");
    const match = folder.querySelector(
      ":scope > ul > li.note:not([hidden]), :scope > ul > li.folder:not([hidden])",
    );
    folder.hidden = !match;
    setFolderOpen(folder, Boolean(match));
  }
  nav.querySelector(".tree-empty").hidden = query === "" || shown > 0;
}

const input = document.querySelector(".sidebar .tree-filter");

if (input) {
  const filter = () =>
    applyFilter(
      document.querySelector(".sidebar .navigation-buttons"),
      input.value.trim().toLowerCase(),
    );
  input.addEventListener("input", filter);
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !input.value) return;
    e.preventDefault();
    input.value = "";
    filter();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.target.closest("input, textarea")) return;
    if (
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      document.querySelector("dialog[open]")
    )
      return;
    e.preventDefault();
    input.focus();
  });
}
