import { test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { useServers } from "../server.js";
import { FILES, MANY } from "./fixtures.js";

const serve = useServers();
const OUT = process.env.SHOTS_DIR || "/tmp/molesk-shots";
const only = process.env.ONLY ? new RegExp(process.env.ONLY, "u") : null;
mkdirSync(OUT, { recursive: true });

const servers = {
  ro: [FILES],
  "ro-nohome": [{ ...FILES, "Home.md": undefined }],
  "ro-empty": [{}],
  rw: [FILES, "--edit"],
  "rw-empty": [{}, "--edit"],
  "rw-many": [MANY, "--edit"],
};
const LONG = "/content/posts/Building%20a%20Rust%20CLI.md";
const wait = (page, ms = 300) => page.waitForTimeout(ms);
const openNav = async (page) => {
  const menu = page.locator("#menuToggle");
  if (await menu.isVisible()) await menu.click();
  await wait(page, 500);
};
const rootNew = (page) =>
  page.locator(".sidebar .navigation-buttons > ul > li.tree-new > button");
const folder = (page, name) =>
  page.locator(".sidebar li.folder > :is(span, button)", { hasText: name });
const typeNew = async (page, name) => {
  await openNav(page);
  await rootNew(page).click();
  if (name) {
    await page.locator(".sidebar .tree-input").fill(name);
    await page.locator(".sidebar .tree-input").press("Enter");
  }
  await wait(page);
};

const scenes = [
  ["ro-home", "ro", "/"],
  ["ro-drawer", "ro", "/", openNav],
  ["ro-long", "ro", LONG],
  [
    "ro-long-bottom",
    "ro",
    LONG,
    (p) => p.evaluate(() => scrollTo({ top: 1e6, behavior: "instant" })),
  ],
  ["ro-index-root", "ro-nohome", "/"],
  ["ro-index-folder", "ro", "/content/posts/"],
  ["ro-short", "ro", "/content/ideas/Garden.md"],
  ["ro-empty", "ro-empty", "/"],
  ["ro-404", "ro", "/content/nope.md"],
  ["rw-home", "rw", "/content/Shopping.md", openNav],
  ["rw-long", "rw", LONG],
  [
    "rw-long-bottom",
    "rw",
    LONG,
    (p) => p.evaluate(() => scrollTo({ top: 1e6, behavior: "instant" })),
  ],
  ["rw-folder", "rw", "/content/ideas/"],
  ["rw-folder-empty", "rw", "/content/ideas/empty/"],
  [
    "rw-folder-menu",
    "rw",
    "/content/ideas/",
    (p) => p.getByRole("button", { name: "Folder actions" }).click(),
  ],
  [
    "rw-folder-rename",
    "rw",
    "/content/ideas/",
    async (p) => {
      await p.getByRole("button", { name: "Folder actions" }).click();
      await p.getByRole("menuitem", { name: /Rename/u }).click();
    },
  ],
  ["rw-empty", "rw-empty", "/"],
  ["rw-tree-new", "rw", "/content/ideas/Garden.md", (p) => typeNew(p)],
  [
    "rw-tree-error",
    "rw",
    "/content/ideas/Garden.md",
    (p) => typeNew(p, "Shopping"),
  ],
  [
    "rw-tree-open",
    "rw",
    "/content/ideas/Garden.md",
    async (p) => {
      await openNav(p);
      for (const name of ["Deep", "Nested", "Empty", "Posts"]) {
        const row = folder(p, name).first();
        if (await row.isVisible()) await row.click();
      }
      await wait(p, 400);
    },
  ],
  [
    "rw-tree-filter",
    "rw-many",
    "/content/Shopping.md",
    async (p) => {
      await openNav(p);
      await p.locator(".sidebar .tree-filter").fill("pla");
      await wait(p);
    },
  ],
  [
    "rw-tree-filter-none",
    "rw-many",
    "/content/Shopping.md",
    async (p) => {
      await openNav(p);
      await p.locator(".sidebar .tree-filter").fill("zzzz");
      await wait(p);
    },
  ],
  ["rw-tree-many", "rw-many", "/content/Shopping.md", openNav],
  [
    "rw-tasks",
    "rw",
    "/content/Shopping.md",
    async (p) => {
      await p.locator(".task-box").first().click();
      await wait(p, 500);
    },
  ],
  ["rw-editor", "rw", "/edit/ideas/Garden.md"],
  ["rw-editor-long", "rw", LONG.replace("content", "edit")],
  [
    "rw-editor-preview",
    "rw",
    LONG.replace("content", "edit"),
    async (p) => {
      await p.getByRole("button", { name: "Preview", exact: true }).click();
      await wait(p, 600);
    },
  ],
  [
    "rw-editor-split",
    "rw",
    LONG.replace("content", "edit"),
    async (p) => {
      const split = p.getByRole("button", { name: /Split|Side-by-side/u });
      if (await split.isVisible()) await split.click();
      await wait(p, 600);
    },
  ],
  [
    "rw-editor-menu",
    "rw",
    "/edit/ideas/Garden.md",
    async (p) => {
      await p.locator(".editor-more").click();
      await wait(p);
    },
  ],
  [
    "rw-editor-delete",
    "rw",
    "/edit/ideas/Garden.md",
    async (p) => {
      await p.locator(".editor-more").click();
      await p.getByRole("menuitem", { name: /Delete/u }).click();
      await wait(p);
    },
  ],
  [
    "rw-editor-conflict",
    "rw",
    "/edit/ideas/Garden.md",
    async (p) => {
      await p.request.put(p.url().replace("/edit/", "/api/files/"), {
        headers: { "Content-Type": "text/markdown", "If-Match": "*" },
        data: "# Garden\n\nchanged elsewhere\n",
      });
      await p.locator(".editor-text").fill("# Garden\n\nmine\n");
      await p.locator(".editor-text").press("Control+s");
      await wait(p, 500);
    },
  ],
  [
    "rw-editor-typing",
    "rw",
    "/edit/ideas/Garden.md",
    async (p) => {
      await p.locator(".editor-text").click();
      await p.locator(".editor-text").press("Control+End");
      await p.locator(".editor-text").pressSequentially("\n- [ ] new task");
      await wait(p, 200);
    },
  ],
  [
    "rw-editor-new",
    "rw",
    "/content/ideas/Garden.md",
    (p) => typeNew(p, "Fresh idea").then(() => wait(p, 600)),
  ],
];

// Tap targets under 44px and text under 13px on the phone.
const measure = (page) =>
  page.evaluate(() => {
    const visible = (e) => {
      const box = e.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && !e.closest("[inert],[hidden]");
    };
    const small = [];
    for (const e of document.querySelectorAll(
      "a[href], button, input, textarea, summary",
    )) {
      const box = e.getBoundingClientRect();
      if (visible(e) && (box.width < 44 || box.height < 44)) {
        const label = (e.getAttribute("aria-label") || e.textContent).trim();
        small.push(
          `${e.className} "${label.slice(0, 20)}" ${Math.round(box.width)}x${Math.round(box.height)}`,
        );
      }
    }
    return { small, scrollWidth: document.scrollingElement.scrollWidth };
  });

for (const [name, mode, url, action] of scenes) {
  if (only && !only.test(name)) continue;
  for (const theme of ["light", "dark"]) {
    test(`${name} ${theme}`, async ({ page }, info) => {
      const [files, ...args] = servers[mode];
      const clean = Object.fromEntries(
        Object.entries(files).filter(([, text]) => text !== undefined),
      );
      const server = await serve(clean, "--title", "Molesk", ...args);
      await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
      await page.goto(server.url + url);
      await wait(page);
      if (action) await action(page);
      await wait(page, 200);
      const file = `${OUT}/${name}-${theme}-${info.project.name}`;
      await page.screenshot({ path: `${file}.png` });
      if (info.project.name === "390" && theme === "light") {
        writeFileSync(
          `${file}.json`,
          JSON.stringify(await measure(page), null, 1),
        );
      }
    });
  }
}
