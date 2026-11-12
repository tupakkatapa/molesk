import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import { useServers } from "./server.js";
import { editHref, pageHref } from "../public/slug.mjs";

const serve = useServers();
const FILES = {
  "Home.md": "# Home\n",
  "Garden.md": "# Garden\n\nTomatoes.\n",
  "notes/Plants.md": "# Plants\n\nThe compost heap needs turning.\n",
  "notes/Kitchen.md": "# Kitchen\n\nBasil.\n",
};
const dialog = (page) => page.locator("dialog.switcher");
const rows = (page) => dialog(page).locator("[role=option]");

test.describe("Quick switcher - Keys", () => {
  test("finds pages by title and text from the keyboard", async ({ page }) => {
    const { url } = await serve(FILES);
    await page.goto(`${url}/content/Garden.md`);
    await page.keyboard.press("Control+k");
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.type("kit");
    await expect(rows(page).first()).toContainText("Kitchen");
    await expect(rows(page).first()).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`${url}${pageHref("notes/Kitchen.md")}`);
    await expect(dialog(page)).toBeHidden();

    await page.keyboard.press("Control+k");
    await page.keyboard.type("compost");
    const hit = rows(page).filter({ hasText: "Plants" });
    await expect(hit.locator("mark")).toHaveText("compost");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowUp");
    await expect(hit).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
  });

  test("opens from the phone top bar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    const { url } = await serve(FILES);
    await page.goto(`${url}/content/Garden.md`);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).locator("input")).toBeFocused();
  });
});

test.describe("Quick switcher - Edit mode", () => {
  test("creates a page in the current folder in edit mode", async ({
    page,
  }) => {
    const { url, dir } = await serve(FILES, "--edit");
    await page.goto(`${url}/content/notes/Plants.md`);
    await page.keyboard.press("Control+k");
    await page.keyboard.type("Brand new");
    const create = rows(page).last();
    await expect(create).toHaveText("Create “Brand new”");
    await page.keyboard.press("ArrowUp");
    await expect(create).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`${url}${editHref("notes/Brand new.md")}`);
    expect(existsSync(path.join(dir, "notes/Brand new.md"))).toBe(true);
  });

  test("Ctrl+K in the editor stays the link helper; Ctrl+P opens it", async ({
    page,
  }) => {
    const { url } = await serve(FILES, "--edit");
    await page.goto(`${url}/edit/Garden.md`);
    const textarea = page.locator(".editor-text");
    await textarea.fill("");
    await textarea.press("Control+k");
    await expect(textarea).toHaveValue("[](url)");
    await expect(dialog(page)).toBeHidden();
    await textarea.press("Control+p");
    await expect(dialog(page)).toBeVisible();
  });
});

test.describe("Quick switcher - Sidebar", () => {
  test("the search field searches the text with what was typed", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const { url } = await serve(FILES);
    await page.goto(`${url}/content/Garden.md`);
    await page.locator(".sidebar .tree-filter").fill("compost");
    await page.getByRole("button", { name: "Search page text" }).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).locator("input")).toBeFocused();
    await expect(dialog(page).locator("input")).toHaveValue("compost");
    await expect(rows(page).first()).toContainText("Plants");
  });

  test("is gone with --no-search", async ({ page }) => {
    const { url } = await serve(FILES, "--no-search");
    await page.goto(`${url}/content/Garden.md`);
    await expect(page.locator(".sidebar-search")).toHaveCount(0);
  });
});
