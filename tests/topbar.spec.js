import { test, expect } from "@playwright/test";
import { openFolder, openNav } from "./helpers";

test.describe("Mobile Top Bar", () => {
  test("holds the menu and the page title; the card runs edge to edge", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto("/content/posts/My%20First%20Post.md");
    const bar = page.locator(".topbar");
    await expect(bar).toBeVisible();
    await expect(bar.locator("#menuToggle")).toBeVisible();
    await expect(bar.locator(".topbar-title")).toHaveText("My First Post");
    const barBox = await bar.boundingBox();
    expect(barBox.y).toBe(0);
    expect(barBox.width).toBe(390);
    const card = await page.locator("#file-content").boundingBox();
    expect(card.x).toBe(0);
    expect(card.width).toBe(390);
    await page.evaluate(() => window.scrollTo(0, 400));
    expect((await bar.boundingBox()).y).toBe(0);
  });

  test("follows in-place navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto("/content/posts/My%20First%20Post.md");
    await openNav(page);
    await openFolder(page, "Tests");
    await page.locator(".sidebar a", { hasText: "Markdown it" }).click();
    await expect(page.locator(".topbar-title")).toHaveText("Markdown it");
  });

  test("stays out of the desktop layout", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto("/content/Home.md");
    await expect(page.locator(".topbar")).toBeHidden();
  });
});
