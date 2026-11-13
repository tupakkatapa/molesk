import { setFolderOpen, setSidebarOpen } from "./sidebar.js";
import { createNote, parseName } from "./api.js";
import { pageHref } from "./slug.mjs";

const SEARCH_DELAY = 200;
const MIN_TEXT_QUERY = 2;

const input = document.querySelector(".sidebar .tree-filter");
const nav = () => document.querySelector(".sidebar .navigation-buttons");

let selected = 0;
let asked = 0;
let pending = false;
let timer = null;

function filterTree(query) {
  const tree = nav();
  tree.classList.toggle("filtering", query !== "");
  for (const item of tree.querySelectorAll("li.note")) {
    const name = item.querySelector(".tree-name").textContent;
    item.hidden = query !== "" && !name.toLowerCase().includes(query);
  }
  for (const tag of tree.querySelectorAll("li.tree-tag")) {
    const name = tag.querySelector(".tree-name").textContent.toLowerCase();
    tag.hidden = query === "" || !name.includes(query);
  }
  for (const folder of [...tree.querySelectorAll("li.folder")].reverse()) {
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
}

// What Enter and the arrows work on: the pages and tags left in the tree,
// then the text matches and the offer to create a page.
const candidates = () =>
  input.value.trim() === ""
    ? []
    : [
        ...nav().querySelectorAll(
          "li.note:not([hidden]) > .tree-row, li.tree-tag:not([hidden]) > .tree-row, .search-hits .tree-row",
        ),
      ];

function select(index) {
  const rows = candidates();
  for (const row of nav().querySelectorAll(".tree-row.selected")) {
    row.classList.remove("selected");
  }
  nav().querySelector(".tree-empty").hidden =
    input.value.trim() === "" || rows.length > 0 || pending;
  const status = nav().querySelector(".search-status");
  status.textContent = "";
  if (rows.length === 0) return;
  selected = (index + rows.length) % rows.length;
  rows[selected].classList.add("selected");
  rows[selected].scrollIntoView({ block: "nearest" });
  const name = rows[selected].querySelector(".tree-name")?.textContent;
  const count = `${rows.length} result${rows.length === 1 ? "" : "s"}`;
  status.textContent = name ? `${count}. ${name}` : count;
}

function hitRow(result) {
  const link = document.createElement("a");
  link.className = "tree-row search-hit";
  link.href = pageHref(result.path);
  const name = document.createElement("span");
  name.className = "tree-name";
  name.textContent = result.title;
  const snippet = document.createElement("span");
  snippet.className = "search-snippet";
  const mark = document.createElement("mark");
  mark.textContent = result.match;
  snippet.append(result.before, ...(result.match ? [mark] : []), result.after);
  link.append(name, snippet);
  return link;
}

function createRow(query) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tree-row search-create";
  button.dataset.create = query;
  button.textContent = `Create “${query}”`;
  return button;
}

// Text matches for pages the tree isn't already showing, and in edit mode
// the offer to create the page that was typed.
function showHits(results) {
  const query = input.value.trim();
  const inTree = new Set(
    [...nav().querySelectorAll("li.note:not([hidden]) > a.tree-row")].map(
      (link) => link.getAttribute("href"),
    ),
  );
  const rows = results
    .filter((result) => !inTree.has(pageHref(result.path)))
    .map((result) => hitRow(result));
  if ("create" in input.dataset && query) rows.push(createRow(query));
  const list = nav().querySelector(".search-hits");
  list.replaceChildren(
    ...rows.map((row) => {
      const item = document.createElement("li");
      item.append(row);
      return item;
    }),
  );
  list.hidden = rows.length === 0;
  select(selected);
}

async function searchText(query) {
  const ask = ++asked;
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`).catch(
    () => null,
  );
  const results = res?.ok ? await res.json().catch(() => []) : [];
  if (ask !== asked) return;
  pending = false;
  showHits(results);
}

function update() {
  const query = input.value.trim();
  filterTree(query.toLowerCase());
  asked++;
  selected = 0;
  clearTimeout(timer);
  pending = query.length >= MIN_TEXT_QUERY;
  showHits([]);
  if (pending) timer = setTimeout(() => searchText(query), SEARCH_DELAY);
}

// The folder new pages go in: the open page's or folder's, as named by
// the New row of its list in the tree.
function currentDir() {
  const shown = nav().querySelector("li.active, li.current > ul > li");
  const list = shown?.parentElement ?? nav().querySelector(".tree");
  return list.querySelector(":scope > .tree-new > button").dataset.dir;
}

async function create(name) {
  const note = nav().querySelector(".tree-empty");
  const parsed = parseName(name);
  try {
    if (parsed.error || parsed.folder) {
      throw new Error(parsed.error || "Pages can't end with /");
    }
    await createNote(currentDir(), parsed.rel);
  } catch (err) {
    note.textContent = err.message;
    note.hidden = false;
  }
}

function activate(row) {
  if (!row) return;
  if (row.dataset.create) {
    create(row.dataset.create);
    return;
  }
  input.value = "";
  update();
  row.click();
}

function focusSearch() {
  if (document.querySelector("#sidebar.collapsed")) setSidebarOpen(true);
  input.focus();
  input.select();
}

function onKey(e) {
  const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
  if (step) {
    e.preventDefault();
    select(selected + step);
  } else if (e.key === "Enter") {
    e.preventDefault();
    activate(candidates()[selected]);
  } else if (e.key === "Escape" && input.value) {
    e.preventDefault();
    input.value = "";
    update();
  }
}

// "/" and Ctrl+K go to the search box. Ctrl+K inside the editor's text
// stays its link helper, which handles it first; Ctrl+P searches there.
function onShortcut(e) {
  if (e.defaultPrevented || document.querySelector("dialog[open]")) return;
  const key = e.key.toLowerCase();
  const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
  const slash = key === "/" && plain && !e.target.closest("input, textarea");
  const chord =
    (e.ctrlKey || e.metaKey) &&
    !e.altKey &&
    !e.shiftKey &&
    (key === "k" || (key === "p" && document.querySelector("#editor")));
  if (!slash && !chord) return;
  e.preventDefault();
  focusSearch();
}

if (input) {
  input.addEventListener("input", update);
  input.addEventListener("keydown", onKey);
  document.addEventListener("keydown", onShortcut);
  document.querySelector(".sidebar").addEventListener("click", (e) => {
    const row = e.target.closest(".search-create");
    if (row) create(row.dataset.create);
  });
  document
    .querySelector(".topbar-search")
    ?.addEventListener("click", focusSearch);
}
