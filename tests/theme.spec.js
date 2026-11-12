import { test, expect } from "@playwright/test";
import { openNav } from "./helpers.js";

const html = (page) => page.locator("html");
const toggle = async (page) => {
  await openNav(page);
  await page.locator("#themeToggleIcon").click();
};

test.describe("Theme System - Default State", () => {
  test("starts dark with the dark code theme", async ({ page }) => {
    await page.goto("/");
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("#highlightjs-dark")).not.toHaveAttribute(
      "disabled",
    );
    await expect(page.locator("#highlightjs-light")).toHaveAttribute(
      "disabled",
    );
  });

  test("is set before the first paint", async ({ page }) => {
    await page.goto("/");
    const blocking = await page.evaluate(() => {
      const script = document.head.querySelector('script[src="/theme.js"]');
      return Boolean(script) && !script.type && !script.defer && !script.async;
    });
    expect(blocking).toBe(true);
  });
});

test.describe("Theme System - Toggle", () => {
  test("the toggle switches, remembers and swaps code themes", async ({
    page,
  }) => {
    await page.goto("/content/tests/Markdown-it.md");
    await toggle(page);
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe(
      "light",
    );
    await expect(page.locator("#highlightjs-light")).not.toHaveAttribute(
      "disabled",
    );
    await page.reload();
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    await toggle(page);
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
  });

  test("the theme colour follows the page", async ({ page }) => {
    await page.goto("/");
    const color = () =>
      page.locator('meta[name="theme-color"]').getAttribute("content");
    const dark = await color();
    await toggle(page);
    await expect.poll(color).not.toBe(dark);
  });

  test("t toggles the theme", async ({ page }) => {
    await page.goto("/content/Home.md");
    await page.keyboard.press("t");
    await expect(html(page)).toHaveAttribute("data-theme", "light");
  });
});

test.describe("Theme System - Preferences", () => {
  test("a stored choice wins on load", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "light"));
    await page.goto("/");
    await expect(html(page)).toHaveAttribute("data-theme", "light");
  });

  test("an invalid stored value falls back to the default", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "purple"));
    await page.goto("/");
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
  });

  test("works without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    await context.close();
  });

  test("the toggle is labelled", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#themeToggleIcon")).toHaveAttribute(
      "aria-label",
      /theme/iu,
    );
  });
});
