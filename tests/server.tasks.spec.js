import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { useServers } from "./server.js";

const serve = useServers();

const NOTE =
  '---\ndate: "2026-11-09"\n---\n# Shop\n\n- [ ] milk\n- [x] bread\n- plain\n- a [ ] inside\n';

test.describe("Task Lists - Rendering", () => {
  test("render as checkboxes with their source line", async ({ page }) => {
    const { url } = await serve({ "Shop.md": NOTE });
    await page.goto(`${url}/content/Shop.md`);
    const boxes = page.locator("#file-content input.task-box");
    await expect(boxes).toHaveCount(2);
    await expect(boxes.nth(0)).not.toBeChecked();
    await expect(boxes.nth(1)).toBeChecked();
    await expect(boxes.nth(0)).toHaveAttribute("data-line", "5");
    await expect(boxes.nth(0)).toBeDisabled();
    await expect(page.locator("#file-content li:has(> .task)")).toHaveText([
      "milk",
      "bread",
    ]);
    await expect(boxes.nth(0)).toHaveAccessibleName("milk");
    await expect(
      page.locator("#file-content li:has(> .task)").first(),
    ).toHaveCSS("list-style-type", "none");
    await expect(
      page.locator("#file-content li", { hasText: "inside" }),
    ).toHaveText("a [ ] inside");
  });
});

test.describe("Task Lists - Toggling", () => {
  test("a click saves the exact source line", async ({ page }) => {
    const { url, dir } = await serve({ "Shop.md": NOTE }, "--edit");
    await page.goto(`${url}/content/Shop.md`);
    const milk = page.locator("#file-content input.task-box").first();
    await expect(milk).toBeEnabled();
    await milk.click();
    await expect(milk).toBeChecked();
    await expect
      .poll(() => readFileSync(path.join(dir, "Shop.md"), "utf8"))
      .toBe(NOTE.replace("- [ ] milk", "- [x] milk"));
    await page.locator("#file-content input.task-box").nth(1).click();
    await expect
      .poll(() => readFileSync(path.join(dir, "Shop.md"), "utf8"))
      .toContain("- [ ] bread");
  });
});

test.describe("Task Lists - Changes Elsewhere", () => {
  test("a note changed elsewhere reloads instead", async ({
    page,
    request,
  }) => {
    const { url, dir } = await serve({ "Shop.md": NOTE }, "--edit");
    await page.goto(`${url}/content/Shop.md`);
    const moved = NOTE.replace("# Shop\n", "# Shop\n\n- [ ] eggs\n");
    await request.put(`${url}/api/files/Shop.md`, {
      headers: { "Content-Type": "text/markdown", "If-Match": "*" },
      data: moved,
    });
    await page.locator("#file-content input.task-box").first().click();
    await expect(page.locator("#file-content")).toContainText("eggs");
    expect(readFileSync(path.join(dir, "Shop.md"), "utf8")).toBe(moved);
  });

  test("toggles in a row chain their ETags", async ({ page }) => {
    const { url, dir } = await serve({ "Shop.md": NOTE }, "--edit");
    await page.goto(`${url}/content/Shop.md`);
    await page.evaluate(() => (window.stayed = true));
    const boxes = page.locator("#file-content input.task-box");
    await expect(boxes.first()).toBeEnabled();
    await boxes.nth(0).click();
    await boxes.nth(1).click();
    await expect
      .poll(() => readFileSync(path.join(dir, "Shop.md"), "utf8"))
      .toBe(
        NOTE.replace("- [ ] milk", "- [x] milk").replace(
          "- [x] bread",
          "- [ ] bread",
        ),
      );
    expect(await page.evaluate(() => window.stayed)).toBe(true);
  });
});

test.describe("Raw Note API", () => {
  test("returns the text with its ETag in edit mode only", async ({
    request,
  }) => {
    const edit = await serve({ "Shop.md": NOTE }, "--edit");
    const res = await request.get(`${edit.url}/api/files/Shop.md`);
    expect(res.status()).toBe(200);
    expect(await res.text()).toBe(NOTE);
    expect(res.headers().etag).toMatch(/^"sha256-/u);
    expect((await request.get(`${edit.url}/api/files/Nope.md`)).status()).toBe(
      404,
    );
    const site = await serve({ "Shop.md": NOTE });
    expect((await request.get(`${site.url}/api/files/Shop.md`)).status()).toBe(
      404,
    );
  });
});

test.describe("Folder Actions", () => {
  const FILES = { "posts/a.md": "# A\n", "posts/old/": "", "Top.md": "# T\n" };

  test("rename a folder from its index page", async ({ page }) => {
    const { url, dir } = await serve(FILES, "--edit");
    await page.goto(`${url}/content/posts/`);
    await page.getByRole("button", { name: "Folder actions" }).click();
    await page.getByRole("menuitem", { name: /Rename/u }).click();
    const input = page.locator(".folder-index .folder-title-input");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(input).toHaveCount(0);
    await page.getByRole("button", { name: "Folder actions" }).click();
    await page.getByRole("menuitem", { name: /Rename/u }).click();
    await input.fill("articles");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(`${url}/content/articles/`);
    expect(readFileSync(path.join(dir, "articles/a.md"), "utf8")).toBe("# A\n");
  });

  test("delete only an empty folder", async ({ page }) => {
    const { url } = await serve(FILES, "--edit");
    await page.goto(`${url}/content/posts/`);
    await page.getByRole("button", { name: "Folder actions" }).click();
    await expect(page.getByRole("menuitem", { name: /Delete/u })).toHaveCount(
      0,
    );
    await page.goto(`${url}/content/posts/old/`);
    await page.getByRole("button", { name: "Folder actions" }).click();
    await page.getByRole("menuitem", { name: /Delete/u }).click();
    await page
      .locator("dialog.confirm")
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(page).toHaveURL(`${url}/content/posts/`);
    await expect(page.locator(".index-folder")).toHaveCount(0);
  });

  test("stay off read-only sites and the root", async ({ page }) => {
    const site = await serve(FILES);
    await page.goto(`${site.url}/content/posts/`);
    await expect(
      page.getByRole("button", { name: "Folder actions" }),
    ).toHaveCount(0);
    const edit = await serve(FILES, "--edit");
    await page.goto(`${edit.url}/`);
    await expect(
      page.getByRole("button", { name: "Folder actions" }),
    ).toHaveCount(0);
  });
});
