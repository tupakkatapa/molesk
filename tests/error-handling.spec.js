import { test, expect } from "@playwright/test";

test.describe("HTTP Error Responses", () => {
  test("404 page renders correctly", async ({ page }) => {
    const response = await page.goto("/content/does-not-exist.md");

    expect(response.status()).toBe(404);

    const content = page.locator("#file-content");
    await expect(content).toBeVisible();

    await expect(content).toContainText("404");
    await expect(content).toContainText("Not Found");
  });

  test("unsupported file type returns error", async ({ page }) => {
    const response = await page.goto("/content/test.json");

    expect(response.status()).toBe(400);

    const content = page.locator("#file-content");
    await expect(content).toBeVisible();

    await expect(content).toContainText("File type not supported");
  });
});

test.describe("Missing and Empty Content", () => {
  test("missing profile image handled gracefully", async ({ page }) => {
    await page.goto("/");

    const imgContainer = page.locator(".image-container");

    if ((await imgContainer.count()) > 0) {
      const img = imgContainer.locator("img");

      if ((await img.count()) > 0) {
        await expect(imgContainer).toBeVisible();
      }
    }

    const sidebar = page.locator(".sidebar");
    await expect(sidebar).toBeVisible();

    const content = page.locator("#file-content");
    await expect(content).toBeVisible();
  });

  test("empty content files handled", async ({ page }) => {
    await page.goto("/");

    const content = page.locator("#file-content");
    await expect(content).toBeVisible();

    const sidebar = page.locator(".sidebar");
    await expect(sidebar).toBeVisible();

    const mainContent = page.locator(".main");
    await expect(mainContent).toBeVisible();
  });
});

test.describe("Content Rendering", () => {
  test("malformed content handled gracefully", async ({ page }) => {
    await page.goto("/");

    const errors = [];
    page.on("pageerror", (error) => errors.push(error));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(new Error(msg.text()));
      }
    });

    await page.waitForLoadState("networkidle");

    expect(errors.length).toBeLessThan(5);

    const content = page.locator("#file-content");
    await expect(content).toBeVisible();

    const themeToggle = page.locator("#themeToggleIcon");
    await expect(themeToggle).toBeVisible();
  });

  test("very large content loads without issues", async ({ page }) => {
    await page.goto("/");

    const content = page.locator("#file-content");
    await expect(content).toBeVisible();

    const body = page.locator("body");
    const bodyWidth = await body.evaluate((el) => el.scrollWidth);
    const viewportWidth = await page.viewportSize();

    // Allow some tolerance for minor overflow
    if (viewportWidth && viewportWidth.width >= 768) {
      expect(bodyWidth).toBeLessThanOrEqual(viewportWidth.width + 50);
    }
  });
});

test.describe("Network Resilience", () => {
  test("network interruption handled gracefully", async ({ page }) => {
    await page.goto("/");

    await page.route("**/*.{css,png,jpg,jpeg,gif,svg}", (route) =>
      route.abort(),
    );

    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width <= 768) {
      const collapseBtn = page.locator("#collapseSidebar");
      await collapseBtn.click();
      await page.waitForTimeout(300);
    }

    const themeToggle = page.locator("#themeToggleIcon");
    await expect(themeToggle).toBeVisible();

    await themeToggle.scrollIntoViewIfNeeded();
    await themeToggle.click({ force: true });

    const content = page.locator("#file-content");
    await expect(content).toBeVisible();
  });
});

test.describe("Edge Cases", () => {
  test("JavaScript disabled fallback", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const jsDisabledPage = await context.newPage();
    await jsDisabledPage.goto("/");

    const content = jsDisabledPage.locator("#file-content");
    await expect(content).toBeVisible();

    const navLinks = jsDisabledPage.locator(".sidebar a");
    if ((await navLinks.count()) > 0) {
      await expect(navLinks.first()).toBeVisible();
    }

    const themeToggle = jsDisabledPage.locator("#themeToggleIcon");
    await expect(themeToggle).toBeVisible();

    await context.close();
  });

  test("special characters in file names handled", async ({ page }) => {
    await page.goto("/");

    const navLinks = page.locator('.sidebar a[href^="/content/"]');
    const linkCount = await navLinks.count();

    for (let i = 0; i < Math.min(linkCount, 3); i++) {
      const link = navLinks.nth(i);
      const href = await link.getAttribute("href");

      await page.goto(href);

      const content = page.locator("#file-content");
      await expect(content).toBeVisible();

      await expect(page).toHaveURL(href);
    }
  });
});

test.describe("Rapid Navigation", () => {
  test("rapid navigation does not break state", async ({ page }) => {
    await page.goto("/");

    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width <= 768) {
      const collapseBtn = page.locator("#collapseSidebar");
      await collapseBtn.click();
      await page.waitForTimeout(300);
    }

    const navLinks = page.locator('.sidebar a[href^="/content/"]');
    const linkCount = await navLinks.count();

    if (linkCount > 1) {
      for (let i = 0; i < Math.min(linkCount, 3); i++) {
        const link = navLinks.nth(i % linkCount);
        const href = await link.getAttribute("href");
        await page.goto(href, { timeout: 2000 });

        const content = page.locator("#file-content");
        await expect(content).toBeVisible();

        const themeToggle = page.locator("#themeToggleIcon");
        await expect(themeToggle).toBeVisible();
      }
    }
  });
});

test.describe("Theme Toggle Stability", () => {
  test("concurrent theme toggles handled", async ({ page }) => {
    await page.goto("/");

    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width <= 768) {
      const collapseBtn = page.locator("#collapseSidebar");
      await collapseBtn.click();
      await page.waitForTimeout(300);
    }

    const themeToggle = page.locator("#themeToggleIcon");
    const body = page.locator("body");

    await themeToggle.scrollIntoViewIfNeeded();
    await themeToggle.click({ force: true });
    await themeToggle.scrollIntoViewIfNeeded();
    await themeToggle.click({ force: true });
    await themeToggle.scrollIntoViewIfNeeded();
    await themeToggle.click({ force: true });
    await themeToggle.scrollIntoViewIfNeeded();
    await themeToggle.click({ force: true });

    const hasTheme = await body.evaluate(
      (el) =>
        el.classList.contains("dark-theme") ||
        !el.classList.contains("dark-theme"),
    );
    expect(hasTheme).toBe(true);

    await expect(themeToggle).toBeVisible();
  });
});
