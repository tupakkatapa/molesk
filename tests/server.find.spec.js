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
  "notes/Kites.md": "# Kites\n",
};
const box = (page) => page.locator(".sidebar .tree-filter");
const selected = (page) => page.locator(".sidebar .tree-row.selected");

test.describe("Sidebar search - Keys", () => {
  test("Enter opens the first match; arrows move the highlight", async ({
    page,
  }) => {
    const { url } = await serve(FILES);
    await page.goto(`${url}/content/Garden.md`);
    await page.keyboard.press("Control+k");
    await expect(box(page)).toBeFocused();
    await page.keyboard.type("ki");
    await expect(selected(page)).toHaveText(/Kitchen/u);
    await page.keyboard.press("ArrowDown");
    await expect(selected(page)).toHaveText(/Kites/u);
    await page.keyboard.press("ArrowDown");
    await expect(selected(page)).toHaveText(/Kitchen/u);
    await page.keyboard.press("ArrowUp");
    await expect(selected(page)).toHaveText(/Kites/u);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`${url}${pageHref("notes/Kites.md")}`);
    await expect(box(page)).toHaveValue("");
    await expect(selected(page)).toHaveCount(0);
  });

  test("finds pages by their text", async ({ page }) => {
    const { url } = await serve(FILES);
    await page.goto(`${url}/content/Garden.md`);
    await box(page).fill("compost");
    const hit = page.locator(".sidebar .search-hits a");
    await expect(hit).toContainText("Plants");
    await expect(hit.locator("mark")).toHaveText("compost");
    await expect(hit).toHaveClass(/selected/u);
    await expect(page.locator(".sidebar .tree-empty")).toBeHidden();
    await box(page).press("Enter");
    await expect(page).toHaveURL(`${url}${pageHref("notes/Plants.md")}`);
  });
});

test.describe("Sidebar search - Box", () => {
  test("says so when nothing matches", async ({ page }) => {
    const { url } = await serve(FILES);
    await page.goto(`${url}/content/Garden.md`);
    const before = page.url();
    await box(page).fill("zzzz");
    await expect(page.locator(".sidebar .tree-empty")).toBeVisible();
    await box(page).press("Enter");
    await expect(page).toHaveURL(before);
    await expect(box(page)).toHaveValue("zzzz");
  });

  test("the phone top bar opens the sidebar on the search box", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    const { url } = await serve(FILES);
    await page.goto(`${url}/content/Garden.md`);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(box(page)).toBeFocused();
  });

  test("there is no pop-up; --no-search removes the box", async ({ page }) => {
    const { url } = await serve(FILES);
    await page.goto(`${url}/content/Garden.md`);
    await expect(page.locator("dialog.switcher, .sidebar-search")).toHaveCount(
      0,
    );
    const off = await serve(FILES, "--no-search");
    await page.goto(`${off.url}/content/Garden.md`);
    await expect(box(page)).toHaveCount(0);
    await expect(page.locator(".topbar-search")).toHaveCount(0);
  });
});

test.describe("Sidebar search - Edit mode", () => {
  test("creates the typed page in the current folder", async ({ page }) => {
    const { url, dir } = await serve(FILES, "--edit");
    await page.goto(`${url}/content/notes/Plants.md`);
    await page.keyboard.press("Control+k");
    await page.keyboard.type("Brand new");
    const create = page.locator(".sidebar .search-create");
    await expect(create).toHaveText("Create “Brand new”");
    await expect(create).toHaveClass(/selected/u);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`${url}${editHref("notes/Brand new.md")}`);
    expect(existsSync(path.join(dir, "notes/Brand new.md"))).toBe(true);
  });

  test("Ctrl+K in the editor stays the link helper; Ctrl+P searches", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const { url } = await serve(FILES, "--edit");
    await page.goto(`${url}/edit/Garden.md`);
    const textarea = page.locator(".editor-text");
    await textarea.fill("");
    await textarea.press("Control+k");
    await expect(textarea).toHaveValue("[](url)");
    await textarea.press("Control+p");
    await expect(box(page)).toBeFocused();
  });
});

test.describe("Sidebar - Tags", () => {
  test("links to the tags when a page has one", async ({ page }) => {
    const { url } = await serve({
      ...FILES,
      "Tagged.md": "---\ntags: [cards]\n---\n\n# Tagged\n",
    });
    await page.goto(`${url}/content/Garden.md`);
    await page.locator(".sidebar").getByRole("link", { name: "Tags" }).click();
    await expect(page).toHaveURL(`${url}/tags/`);
    await expect(page.locator("#file-content")).toContainText("cards");
    await box(page).fill("gard");
    await expect(
      page.locator(".sidebar").getByRole("link", { name: "Tags" }),
    ).toBeHidden();
  });

  test("a tag is a search result that opens its page", async ({ page }) => {
    const { url } = await serve({
      ...FILES,
      "Tagged.md": "---\ntags: [Cardistry, cuts]\n---\n\n# Tagged\n",
      "Other.md": "---\ntags: cardistry\n---\n\n# Other\n",
    });
    await page.goto(`${url}/content/Garden.md`);
    const tag = page.locator(".sidebar li.tree-tag");
    await expect(tag).toHaveCount(2);
    await expect(tag.first()).toBeHidden();
    await box(page).fill("cardis");
    await expect(selected(page)).toHaveText(/cardistry\s*2/iu);
    await expect(tag.filter({ hasText: "cuts" })).toBeHidden();
    await box(page).press("Enter");
    await expect(page).toHaveURL(`${url}/tags/cardistry/`);
    await expect(page.locator("#file-content")).toContainText("Tagged");
  });

  test("is absent without tags or with --no-index", async ({ page }) => {
    const { url } = await serve(FILES);
    await page.goto(`${url}/content/Garden.md`);
    const link = page.locator(".sidebar .tree-tags");
    await expect(link).toHaveCount(0);
    const off = await serve(
      { ...FILES, "Tagged.md": "---\ntags: [cards]\n---\n" },
      "--no-index",
    );
    await page.goto(`${off.url}/content/Garden.md`);
    await expect(link).toHaveCount(0);
  });
});

test.describe("Static files", () => {
  test("own scripts and styles are checked again on every load", async ({
    request,
  }) => {
    const { url } = await serve(FILES);
    for (const file of ["search.js", "base.css"]) {
      const res = await request.get(`${url}/${file}`);
      expect(res.headers()["cache-control"], file).toBe("public, max-age=0");
      const again = await request.get(`${url}/${file}`, {
        headers: { "If-None-Match": res.headers().etag },
      });
      expect(again.status(), file).toBe(304);
    }
    const vendor = await request.get(
      `${url}/vendor/fontawesome/css/solid.min.css`,
    );
    expect(vendor.headers()["cache-control"]).toBe("public, max-age=3600");
  });
});
