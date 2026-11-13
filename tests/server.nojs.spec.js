import { test, expect } from "@playwright/test";
import { useServers } from "./server.js";

const serve = useServers();
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);
const FILES = {
  "Home.md": "# Home\n\n![dot](assets/dot.png)\n",
  "assets/dot.png": PNG,
  "notes/Kitchen.md": "# Kitchen\n",
};
const DEAD = [
  ".tree-filter",
  ".theme-toggle",
  ".menu-btn",
  ".sidebar-close",
  ".topbar-search",
];

test.describe("Without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("images show and no dead controls are visible", async ({ page }) => {
    const { url } = await serve(FILES);
    for (const width of [1200, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${url}/content/Home.md`);
      await expect(page.locator(".markdown-body img")).toHaveCSS(
        "opacity",
        "1",
      );
      for (const selector of DEAD) {
        await expect(page.locator(selector).first(), selector).toBeHidden();
      }
    }
  });

  test("phones show the tree above the content, folders open", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    const { url } = await serve(FILES);
    await page.goto(`${url}/content/Home.md`);
    const kitchen = page.locator(".sidebar").getByText("Kitchen");
    await expect(kitchen).toBeVisible();
    const tree = await kitchen.boundingBox();
    const content = await page.locator("#file-content").boundingBox();
    expect(tree.x).toBeGreaterThanOrEqual(0);
    expect(tree.y + tree.height).toBeLessThanOrEqual(content.y);
  });

  test("the RSS icon links to the feed", async ({ page }) => {
    const { url } = await serve(FILES);
    await page.goto(`${url}/content/Home.md`);
    await page.locator(".rss-copy-link").click();
    await expect(page).toHaveURL(`${url}/rss.xml`);
  });
});
