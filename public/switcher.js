import { createNote, NOTE_PATTERN, parseName, shownPath } from "./tree.js";
import { pageHref } from "./slug.mjs";

const SEARCH_DELAY = 200;
const MAX_TITLES = 8;

const dialog = document.querySelector("dialog.switcher");
const input = dialog.querySelector(".switcher-input");
const list = dialog.querySelector(".switcher-list");
const note = dialog.querySelector(".switcher-note");

const fold = (text) =>
  text.normalize("NFKD").replaceAll(/\p{M}/gu, "").toLowerCase();

// The sidebar's pages, so names match at once without asking the server.
const treePages = () =>
  [...document.querySelectorAll(".sidebar a.tree-row")].map((link) => ({
    title: link.querySelector(".tree-name").textContent,
    href: link.getAttribute("href"),
    path: link.dataset.path,
  }));

// The folder new pages go in: the open page's or folder's.
function currentDir() {
  const editor = document.querySelector("#editor");
  if (editor) return editor.dataset.dir;
  const rel = shownPath();
  if (!rel || NOTE_PATTERN.test(rel))
    return rel.slice(0, rel.lastIndexOf("/") + 1);
  return `${rel}/`;
}

let selected = 0;
let titles = [];
let texts = [];
let asked = 0;
let timer = null;

const rows = () => [...list.children];

function select(index) {
  const all = rows();
  if (all.length === 0) return;
  selected = (index + all.length) % all.length;
  all.forEach((row, i) =>
    row.setAttribute("aria-selected", String(i === selected)),
  );
  input.setAttribute("aria-activedescendant", all[selected].id);
  all[selected].scrollIntoView({ block: "nearest" });
}

function row(id, title, detail) {
  const item = document.createElement("li");
  item.id = `switcher-${id}`;
  item.setAttribute("role", "option");
  const name = document.createElement("span");
  name.className = "switcher-title";
  name.textContent = title;
  item.append(name);
  if (detail) item.append(detail);
  return item;
}

function detailOf(result) {
  const detail = document.createElement("span");
  detail.className = "switcher-detail";
  if (result.match === undefined) {
    const rel = result.path;
    detail.textContent = rel
      .slice(0, rel.lastIndexOf("/"))
      .replaceAll("/", " / ");
    return detail;
  }
  const mark = document.createElement("mark");
  mark.textContent = result.match;
  detail.append(result.before, ...(result.match ? [mark] : []), result.after);
  return detail;
}

function render() {
  const query = input.value.trim();
  const shown = new Set(titles.map((page) => page.href));
  const pages = [
    ...titles,
    ...texts.filter((result) => !shown.has(result.href)),
  ];
  list.replaceChildren(
    ...pages.map((page, i) => {
      const item = row(i, page.title, detailOf(page));
      item.dataset.href = page.href;
      return item;
    }),
  );
  if ("create" in dialog.dataset && query) {
    const create = row("create", `Create “${query}”`);
    create.classList.add("switcher-create");
    create.dataset.create = query;
    list.append(create);
  }
  note.textContent = list.children.length > 0 ? "" : "No pages match";
  select(Math.min(selected, list.children.length - 1));
}

async function searchText(query) {
  const ask = ++asked;
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`).catch(
    () => null,
  );
  const results = res?.ok ? await res.json() : [];
  if (ask !== asked) return;
  texts = results.map((result) => ({
    ...result,
    href: pageHref(result.path),
  }));
  render();
}

function update() {
  const query = fold(input.value.trim());
  titles = treePages()
    .filter((page) => fold(`${page.title} ${page.path}`).includes(query))
    .slice(0, MAX_TITLES);
  texts = [];
  asked++;
  selected = 0;
  render();
  clearTimeout(timer);
  if (query.length >= 2) {
    timer = setTimeout(() => searchText(input.value.trim()), SEARCH_DELAY);
  }
}

async function activate(item) {
  if (!item) return;
  if (item.dataset.href) {
    dialog.close();
    const link = document.createElement("a");
    link.href = item.dataset.href;
    document.body.append(link);
    link.click();
    link.remove();
    return;
  }
  const parsed = parseName(item.dataset.create);
  if (parsed.error || parsed.folder) {
    note.textContent = parsed.error || "Pages can't end with /";
    return;
  }
  try {
    await createNote(currentDir(), parsed.rel);
  } catch (err) {
    note.textContent = err.message;
  }
}

function openSwitcher(query = "") {
  if (dialog.open || document.querySelector("dialog[open]")) return;
  input.value = query;
  update();
  dialog.showModal();
  input.focus();
}

input.addEventListener("input", update);
input.addEventListener("keydown", (e) => {
  const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
  if (step) {
    e.preventDefault();
    select(selected + step);
  } else if (e.key === "Enter") {
    e.preventDefault();
    activate(rows()[selected]);
  }
});
list.addEventListener("click", (e) => activate(e.target.closest("li")));
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) dialog.close();
});
document
  .querySelector(".topbar-search")
  ?.addEventListener("click", () => openSwitcher());
document
  .querySelector(".sidebar-search")
  ?.addEventListener("click", () =>
    openSwitcher(document.querySelector(".tree-filter").value.trim()),
  );

// Ctrl+K inside the editor's text stays its link helper, which handles it
// first; Ctrl+P opens the switcher there instead.
document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented || e.altKey || e.shiftKey) return;
  if (!e.ctrlKey && !e.metaKey) return;
  const key = e.key.toLowerCase();
  if (key === "k" || (key === "p" && document.querySelector("#editor"))) {
    e.preventDefault();
    openSwitcher();
  }
});
