import { test, expect } from "@playwright/test";
import { clickNavLink, folderItem, folderRow, openNav } from "./helpers";
import { pageHref } from "../public/slug.mjs";

test.describe("Window Scrolling", () => {
  test("the window scrolls, not .main", async ({ page }) => {
    for (const width of [390, 1200]) {
      await page.setViewportSize({ width, height: 700 });
      await page.goto("/content/tests/Markdown-it.md");
      await page.keyboard.press("End");
      await expect
        .poll(() => page.evaluate(() => window.scrollY))
        .toBeGreaterThan(0);
      await page.keyboard.press("Home");
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    }
  });
});

test.describe("Theme Color", () => {
  test("theme-color follows the site theme", async ({ page }) => {
    await page.goto("/content/Home.md");
    const themeColor = page.locator('meta[name="theme-color"]');
    await expect(themeColor).toHaveAttribute("content", "rgb(26, 24, 18)");
    await page.keyboard.press("t");
    await expect(themeColor).toHaveAttribute("content", "rgb(237, 232, 223)");
  });
});

test.describe("Folder State", () => {
  test("is keyed by folder path", async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem("folder:tests", "open"),
    );
    await page.goto("/content/Home.md");
    await expect(folderRow(page, "Tests")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(folderRow(page, "Posts")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  test("folders above the current note start open", async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto("/content/tests/%C3%84iti.md");
    await expect(folderRow(page, "Tests")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(page.locator(".sidebar li.active")).toHaveText("Äiti");
  });

  test("a closed folder's notes can't be tabbed to", async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto("/content/Home.md");
    await openNav(page);
    await expect(folderItem(page, "Posts").locator("a")).toBeHidden();
  });
});

test.describe("AJAX Navigation", () => {
  test("updates the title and scrolls to top", async ({ page }) => {
    await page.goto("/content/tests/Markdown-it.md");
    await page.evaluate(() =>
      window.scrollTo({ top: 2000, behavior: "instant" }),
    );
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    await clickNavLink(page, "Tests", "Äiti");
    await expect(page).toHaveTitle("Äiti - TestSite");
    await expect(page.locator("#file-content h1")).toHaveText("Äiti");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("falls back to full navigation when fetch fails", async ({ page }) => {
    const aborted = [];
    await page.route("**/content/posts/**", (route) => {
      const ajax = route.request().headers()["x-requested-with"];
      if (ajax) aborted.push(route.request().url());
      return ajax ? route.abort() : route.continue();
    });
    await page.goto("/content/Home.md");
    await clickNavLink(page, "Posts", "My First Post");
    await expect(page).toHaveURL(pageHref("posts/My First Post.md"));
    await expect(page.locator("#file-content")).toContainText("NixOS");
    expect(aborted).toHaveLength(1);
  });

  test("does not leak lightbox overlays", async ({ page }) => {
    await page.goto("/content/Home.md");
    await clickNavLink(page, "Tests", "Markdown it");
    await clickNavLink(page, "Tests", "Äiti");
    await clickNavLink(page, "Posts", "My First Post");
    await expect(page.locator("#file-content")).toContainText("NixOS");
    await expect(page.locator(".lightbox-overlay")).toHaveCount(1);
  });

  test("closes the mobile drawer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto("/content/Home.md");
    await clickNavLink(page, "Posts", "My First Post");
    await expect(page).toHaveURL(pageHref("posts/My First Post.md"));
    await expect(page.locator(".sidebar")).toHaveClass(/collapsed/u);
    await expect(page.locator("#menuToggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(page.locator("body")).not.toHaveClass(/no-scroll/u);
  });
});

test.describe("History", () => {
  test("going back from an in-page anchor does not refetch", async ({
    page,
  }) => {
    await page.goto("/content/tests/Markdown-it.md");
    await page.evaluate(() => {
      const { fetch } = window;
      window.fetches = 0;
      window.fetch = (...args) => {
        window.fetches += 1;
        return fetch(...args);
      };
    });
    await page.locator('.markdown-body a[href^="#fn"]').first().click();
    await expect(page).toHaveURL(/#fn1$/u);
    await page.goBack();
    await expect(page).toHaveURL(pageHref("tests/Markdown-it.md"));
    expect(await page.evaluate(() => window.fetches)).toBe(0);
  });

  test("going back across notes restores the previous note", async ({
    page,
  }) => {
    await page.goto("/content/Home.md");
    const home = await page.locator("#file-content h1").first().textContent();
    await clickNavLink(page, "Tests", "Äiti");
    await expect(page.locator("#file-content h1")).toHaveText("Äiti");
    await page.goBack();
    await expect(page).toHaveURL(pageHref("Home.md"));
    await expect(page.locator("#file-content h1").first()).toHaveText(home);
  });
});

test.describe("Keyboard", () => {
  test("Escape closes the lightbox, not the sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto("/content/tests/Markdown-it.md");
    const overlay = page.locator(".lightbox-overlay");
    await page.locator(".markdown-body img").first().dispatchEvent("click");
    await expect(overlay).toHaveClass(/active/u);
    await page.keyboard.press("Escape");
    await expect(overlay).not.toHaveClass(/active/u);
    await expect(page.locator(".sidebar")).not.toHaveClass(/collapsed/u);
  });

  test("Escape still collapses the sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto("/content/Home.md");
    await page.keyboard.press("Escape");
    await expect(page.locator(".sidebar")).toHaveClass(/collapsed/u);
  });
});
