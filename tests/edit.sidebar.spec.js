import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { folderItem, folderRow, openFolder, openNav } from "./helpers.js";
import { downloadHref, editHref, pageHref } from "../public/slug.mjs";

const DATE = /^\d{1,2} [A-Z][a-z]{2} \d{4}$/u;
const FRESH = /^---\ndate: "\d{4}-\d{2}-\d{2}"\n---\n\n$/u;

const unique = () => `Side ${randomUUID().slice(0, 6)}`;

const expand = async (page, name) => {
  await openFolder(page, name);
  return folderItem(page, name);
};

const rootNew = (page) => page.locator(".sidebar .tree > li.tree-new");

const startNew = async (page, row) => {
  await row.locator("button").click();
  const input = row.locator("input");
  await expect(input).toBeFocused();
  return input;
};

test.describe("Sidebar New Row", () => {
  test("ends the root and every expanded folder", async ({ page }) => {
    await page.goto("/content/Home.md");
    await openNav(page);
    await expect(rootNew(page)).toBeVisible();
    await expect(rootNew(page)).toHaveText(/New/u);
    const posts = await expand(page, "Posts");
    await expect(posts.locator("> ul > li").last()).toHaveClass(/tree-new/u);
    await expect(posts.locator("> ul > li.tree-new")).toBeVisible();
  });

  test("creates a note and opens it in the editor", async ({
    page,
    request,
  }) => {
    const name = unique();
    await page.goto("/content/Home.md");
    await openNav(page);
    const input = await startNew(page, rootNew(page));
    await expect(rootNew(page).locator(".tree-hint")).toHaveText(
      /End with \//u,
    );
    await input.fill(name);
    await input.press("Enter");
    await expect(page).toHaveURL(editHref(`${name}.md`));
    const textarea = page.locator("#editor textarea");
    await expect(textarea).toHaveValue("");
    await expect(textarea).toBeFocused();
    await expect(page.locator("#editor .meta-date")).toHaveText(DATE);
    const res = await request.get(downloadHref(`${name}.md`));
    expect(await res.text()).toMatch(FRESH);
  });
});

test.describe("Sidebar New Row - Folders", () => {
  test("creates inside the folder it ends", async ({ page }) => {
    const name = unique();
    await page.goto("/content/Home.md");
    await openNav(page);
    const posts = await expand(page, "Posts");
    const input = await startNew(page, posts.locator("> ul > li.tree-new"));
    await input.fill(name);
    await input.press("Enter");
    await expect(page).toHaveURL(editHref(`posts/${name}.md`));
  });

  test("a trailing slash creates an expanded folder", async ({ page }) => {
    const name = unique();
    await page.goto("/content/Home.md");
    await openNav(page);
    const input = await startNew(page, rootNew(page));
    await input.fill(`${name}/`);
    await input.press("Enter");
    const folder = folderItem(page, name);
    await expect(folderRow(page, name)).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(folder.locator("> ul > li.tree-new")).toBeVisible();
    await expect(page).toHaveURL(pageHref("Home.md"));
  });
});

test.describe("Sidebar New Row - Errors", () => {
  test("an existing name shows an inline error", async ({ page }) => {
    await page.goto("/content/Home.md");
    await openNav(page);
    const posts = await expand(page, "Posts");
    const row = posts.locator("> ul > li.tree-new");
    const input = await startNew(page, row);
    await input.fill("My First Post");
    await input.press("Enter");
    await expect(row.locator(".tree-error")).toHaveText(/already exists/u);
    await expect(input).toBeFocused();
    await expect(page).toHaveURL(pageHref("Home.md"));
  });

  test("a hidden name is refused before saving", async ({ page }) => {
    await page.goto("/content/Home.md");
    await openNav(page);
    const input = await startNew(page, rootNew(page));
    await input.fill(".secret");
    await input.press("Enter");
    await expect(rootNew(page).locator(".tree-error")).toHaveText(/dot/u);
    await input.fill("ok");
    await expect(rootNew(page).locator(".tree-error")).toBeHidden();
  });

  test("Escape and an empty blur cancel", async ({ page }) => {
    await page.goto("/content/Home.md");
    await openNav(page);
    let input = await startNew(page, rootNew(page));
    await input.fill("draft");
    await input.press("Escape");
    await expect(rootNew(page).locator("input")).toHaveCount(0);
    await expect(rootNew(page).locator("button")).toBeFocused();
    await expect(page.locator(".sidebar")).not.toHaveClass(/collapsed/u);
    input = await startNew(page, rootNew(page));
    await expect(input).toHaveValue("");
    await input.blur();
    await expect(rootNew(page).locator("input")).toHaveCount(0);
  });

  test("the dialog and floating button are gone", async ({ page }) => {
    await page.goto("/content/Home.md");
    await expect(page.locator("#newNote")).toHaveCount(0);
    await expect(page.locator("dialog#newNoteDialog")).toHaveCount(0);
  });
});
