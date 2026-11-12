import { test, expect } from "@playwright/test";
import { useServers } from "./server.js";

const serve = useServers();

const notes = (count) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      i % 2 ? `Note ${i}.md` : `garden/Plant ${i}.md`,
      `# ${i}\n`,
    ]),
  );

test.describe("Sidebar Search", () => {
  test("is there by default and filters by name", async ({ page }) => {
    const { url } = await serve(
      { ...notes(4), "garden/Basil.md": "# B\n" },
      "--edit",
    );
    await page.goto(`${url}/content/Note%201.md`);
    const filter = page.locator(".sidebar .tree-filter");
    await expect(filter).toBeVisible();
    await expect(filter).toHaveAttribute("placeholder", "Search");
    await filter.fill("basil");
    const visible = page.locator(".sidebar li:not([hidden]) > a:visible");
    await expect(visible).toHaveText([/Basil/u]);
    await expect(
      page.locator(".sidebar li.folder > .tree-row", { hasText: "Garden" }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".sidebar li.tree-new:visible")).toHaveCount(0);
    await filter.fill("zzz");
    await expect(page.locator(".sidebar .tree-empty")).toHaveText(
      "No pages match",
    );
    await filter.press("Escape");
    await expect(filter).toHaveValue("");
    await expect(page.locator(".sidebar .tree-empty")).toBeHidden();
    await page.locator("#file-content").click();
    await page.keyboard.press("/");
    await expect(filter).toBeFocused();
    await expect(
      page.locator(".sidebar li.tree-new:visible").first(),
    ).toBeVisible();
  });

  test("read-only sites have it too", async ({ page }) => {
    const { url } = await serve(notes(3));
    await page.goto(`${url}/content/Note%201.md`);
    await expect(page.locator(".sidebar .tree-filter")).toBeVisible();
    await expect(page.locator(".sidebar li.tree-new")).toHaveCount(0);
  });

  test("--no-search turns it off in both modes", async ({ page }) => {
    for (const args of [["--no-search"], ["--edit", "--no-search"]]) {
      const { url } = await serve(notes(20), ...args);
      await page.goto(`${url}/content/Note%201.md`);
      await expect(page.locator(".sidebar .tree-filter")).toHaveCount(0);
    }
  });
});

const FOLDERS = {
  "Home.md": "# Home\n",
  "posts/Post.md": "# Post\n",
  "posts/deep/Deep.md": "# Deep\n",
  "assets/photo.jpg": "jpg",
  "assets/sub/more.png": "png",
  "drafts/": "",
  "drafts/later/": "",
  "dotted/.keep": "",
};

const folderNames = (page) =>
  page.locator(".sidebar li.folder > .tree-row .tree-name").allTextContents();

test.describe("Sidebar Folders", () => {
  test("read-only shows folders with pages only", async ({ page }) => {
    const { url } = await serve(FOLDERS);
    await page.goto(`${url}/`);
    expect(await folderNames(page)).toEqual(["Posts", "Deep"]);
  });

  test("edit mode adds empty folders, never ones with only other files", async ({
    page,
  }) => {
    const { url } = await serve(FOLDERS, "--edit");
    await page.goto(`${url}/`);
    expect(await folderNames(page)).toEqual([
      "Dotted",
      "Drafts",
      "Later",
      "Posts",
      "Deep",
    ]);
    await expect(page.locator(".folder-index")).not.toContainText("Assets");
  });
});

test.describe("Sidebar Header", () => {
  test("has no new-page button; the tree rows make pages", async ({ page }) => {
    const { url } = await serve(notes(2), "--edit");
    await page.goto(`${url}/content/Note%201.md`);
    await expect(
      page.locator(".sidebar-head").getByRole("button", { name: /new/iu }),
    ).toHaveCount(0);
    await expect(page.locator(".sidebar .tree > li.tree-new")).toHaveCount(1);
  });
});

const NAME = "Jesse Karjalainen of the Long Name";
const profileArgs = ["--title", NAME, "--image", "contents/../package.json"];

test.describe("Sidebar Profile", () => {
  for (const args of [[], ["--image-size", "large"]]) {
    test(`a large image by default ${args.join(" ")}`, async ({ page }) => {
      const { url } = await serve(notes(2), ...profileArgs, ...args);
      await page.goto(`${url}/content/Note%201.md`);
      const profile = page.locator(".sidebar .profile");
      await expect(profile.locator("img")).toHaveCount(1);
      await expect(profile).toContainText(`~ ${NAME}`);
      const name = profile.locator(".profile-name");
      expect(
        await name.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await expect(page.locator("#collapseSidebar")).toBeVisible();
      await expect(page.locator("#themeToggleIcon")).toBeVisible();
    });
  }

  test("small keeps the compact header", async ({ page }) => {
    const { url } = await serve(
      notes(2),
      ...profileArgs,
      "--image-size",
      "small",
    );
    await page.goto(`${url}/content/Note%201.md`);
    await expect(page.locator(".sidebar .profile")).toHaveCount(0);
    await expect(page.locator(".sidebar-head .site-name img")).toHaveCount(1);
    const top = (await page.locator(".sidebar").boundingBox()).y;
    for (const button of ["#themeToggleIcon", "#collapseSidebar"]) {
      const { y } = await page.locator(button).boundingBox();
      expect(Math.round(y - top)).toBe(8);
    }
  });
});
