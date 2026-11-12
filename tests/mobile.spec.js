import { test, expect } from "@playwright/test";
import { openNav } from "./helpers";

const PAGES = [
  "/content/Home.md",
  "/content/posts/My%20First%20Post.md",
  "/content/tests/Markdown-it.md",
  "/content/tests/%C3%84iti.md",
];

const isOverflowing = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
function swipe(page, { from, to }) {
  return page.evaluate(
    ({ from, to }) => {
      const node = document.elementFromPoint(from.x, from.y);
      const touch = (point) =>
        new Touch({
          identifier: 1,
          target: node,
          clientX: point.x,
          clientY: point.y,
        });
      const fire = (type, point) =>
        node.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: type === "touchend" ? [] : [touch(point)],
            changedTouches: [touch(point)],
          }),
        );
      fire("touchstart", from);
      fire("touchend", to);
    },
    { from, to },
  );
}

test.describe("Mobile Overflow", () => {
  test("no horizontal overflow on any page", async ({ page }) => {
    for (const width of [320, 360, 390, 768]) {
      await page.setViewportSize({ width, height: 700 });
      for (const path of PAGES) {
        await page.goto(path);
        expect(await isOverflowing(page), `${path} at ${width}px`).toBe(false);
      }
    }
  });

  test("wide tables scroll inside their wrapper", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 700 });
    await page.goto("/content/tests/%C3%84iti.md");
    const wrapper = page.locator(".table-wrapper");
    await expect(wrapper).toHaveCount(1);
    expect(
      await wrapper.evaluate((node) => node.scrollWidth > node.clientWidth),
    ).toBe(true);
    expect(await isOverflowing(page)).toBe(false);
  });
});

test.describe("Mobile Typography", () => {
  test("text is readable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto("/content/posts/My%20First%20Post.md");
    const size = (selector) =>
      page
        .locator(selector)
        .first()
        .evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
    expect(await size("#file-content p")).toBeGreaterThanOrEqual(16);
    expect(await size(".metadata")).toBeGreaterThanOrEqual(12);
  });
});

test.describe("Mobile Drawer Layout", () => {
  test("content uses the full width on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto("/content/Home.md");
    const main = await page.locator(".main").boundingBox();
    expect(main.x).toBe(0);
    expect(main.width).toBe(390);
    await expect(page.locator("#menuToggle")).toBeVisible();
  });

  test("resizing across the breakpoint resets drawer state", async ({
    page,
  }) => {
    const sidebar = page.locator(".sidebar");
    const backdrop = page.locator("#sidebarBackdrop");
    const body = page.locator("body");

    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto("/content/Home.md");
    await expect(sidebar).not.toHaveClass(/collapsed/u);
    await expect(page.locator("#menuToggle")).toBeHidden();

    await page.setViewportSize({ width: 390, height: 700 });
    await expect(sidebar).toHaveClass(/collapsed/u);
    await page.locator("#menuToggle").click();
    await expect(sidebar).not.toHaveClass(/collapsed/u);
    await expect(backdrop).toHaveClass(/active/u);

    await page.setViewportSize({ width: 1200, height: 800 });
    await expect(sidebar).not.toHaveClass(/collapsed/u);
    await expect(backdrop).not.toHaveClass(/active/u);
    await expect(body).not.toHaveClass(/no-scroll/u);

    await page.setViewportSize({ width: 390, height: 700 });
    await expect(sidebar).toHaveClass(/collapsed/u);
    await expect(backdrop).not.toHaveClass(/active/u);
    await expect(body).not.toHaveClass(/no-scroll/u);
  });
});

test.describe("Mobile Drawer", () => {
  test.skip(({ isMobile }) => !isMobile, "needs touch emulation");

  test("is never wider than the viewport", async ({ page }) => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 700 });
      await page.goto("/content/Home.md");
      await openNav(page);
      const box = await page.locator(".sidebar").boundingBox();
      expect(box.width).toBeLessThanOrEqual(width);
    }
  });

  test("menu button opens; backdrop and Escape close", async ({ page }) => {
    await page.goto("/content/Home.md");
    const sidebar = page.locator(".sidebar");
    const menu = page.locator("#menuToggle");

    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await menu.click();
    await expect(sidebar).not.toHaveClass(/collapsed/u);
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#sidebarBackdrop")).toHaveClass(/active/u);
    await expect(page.locator("#sidebarBackdrop")).toBeVisible();
    await expect(page.locator("body")).toHaveClass(/no-scroll/u);

    const { width } = page.viewportSize();
    await page.touchscreen.tap(width - 5, 300);
    await expect(sidebar).toHaveClass(/collapsed/u);
    await expect(page.locator("body")).not.toHaveClass(/no-scroll/u);

    await menu.click();
    await page.keyboard.press("Escape");
    await expect(sidebar).toHaveClass(/collapsed/u);
  });
});

test.describe("Mobile Drawer Focus", () => {
  test.skip(({ isMobile }) => !isMobile, "needs touch emulation");

  test("closed drawer is out of the tab order", async ({ page }) => {
    await page.goto("/content/Home.md");
    await expect(page.locator(".sidebar")).toHaveJSProperty("inert", true);
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(() => document.activeElement.closest(".sidebar")),
      ).toBeNull();
    }
  });

  test("opening focuses the drawer, closing returns focus", async ({
    page,
  }) => {
    await page.goto("/content/Home.md");
    const sidebar = page.locator(".sidebar");
    const main = page.locator(".main");
    const menu = page.locator("#menuToggle");

    await menu.click();
    await expect(sidebar).toHaveJSProperty("inert", false);
    await expect(main).toHaveJSProperty("inert", true);
    await expect(page.locator(".sidebar .tree-row").first()).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(sidebar).toHaveJSProperty("inert", true);
    await expect(main).toHaveJSProperty("inert", false);
    await expect(menu).toBeFocused();
  });

  test("skips links hidden in closed folders", async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto("/content/Home.md");
    await page.locator("#menuToggle").click();
    await expect(
      page.locator(".sidebar li.folder > .tree-row").first(),
    ).toBeVisible();
    await expect(
      page
        .locator('.sidebar li.folder:has(> [aria-expanded="false"]) a')
        .first(),
    ).toBeHidden();
  });
});

test.describe("Desktop Sidebar Focus", () => {
  test("hides fully when collapsed and comes back from the menu button", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto("/content/Home.md");
    const sidebar = page.locator(".sidebar");
    await expect(sidebar).toHaveJSProperty("inert", false);
    await expect(page.locator(".main")).toHaveJSProperty("inert", false);
    await page.locator("#collapseSidebar").click();
    await expect(sidebar).toHaveClass(/collapsed/u);
    await expect(sidebar).toHaveJSProperty("inert", true);
    await expect(page.locator("#menuToggle")).toBeFocused();
    await page.locator("#menuToggle").click();
    await expect(sidebar).not.toHaveClass(/collapsed/u);
    await expect(page.locator(".main")).toHaveJSProperty("inert", false);
  });
});

test.describe("Mobile Swipe", () => {
  test.skip(({ isMobile }) => !isMobile, "needs touch emulation");

  test("swipe left closes the drawer", async ({ page }) => {
    await page.goto("/content/Home.md");
    const sidebar = page.locator(".sidebar");
    await page.locator("#menuToggle").click();
    await expect(sidebar).not.toHaveClass(/collapsed/u);

    await swipe(page, { from: { x: 300, y: 300 }, to: { x: 100, y: 300 } });
    await expect(sidebar).toHaveClass(/collapsed/u);
    await expect(page.locator("body")).not.toHaveClass(/no-scroll/u);
  });

  test("edge swipes are left to the system back gesture", async ({ page }) => {
    await page.goto("/content/Home.md");
    await swipe(page, { from: { x: 5, y: 300 }, to: { x: 200, y: 310 } });
    await expect(page.locator(".sidebar")).toHaveClass(/collapsed/u);
    await expect(page.locator("#sidebarBackdrop")).not.toHaveClass(/active/u);
  });

  test("ignores short or mostly vertical swipes", async ({ page }) => {
    await page.goto("/content/Home.md");
    const sidebar = page.locator(".sidebar");
    await page.locator("#menuToggle").click();

    await swipe(page, { from: { x: 300, y: 300 }, to: { x: 260, y: 300 } });
    await swipe(page, { from: { x: 300, y: 100 }, to: { x: 200, y: 500 } });
    await expect(sidebar).not.toHaveClass(/collapsed/u);

    await swipe(page, { from: { x: 300, y: 300 }, to: { x: 100, y: 300 } });
    await expect(sidebar).toHaveClass(/collapsed/u);
  });
});

test.describe("Touch Targets", () => {
  test.skip(({ isMobile }) => !isMobile, "needs touch emulation");

  test("controls are at least 44px on coarse pointers", async ({ page }) => {
    await page.goto("/content/tests/Markdown-it.md");
    expect(
      await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
    ).toBe(true);

    for (const selector of [
      "#menuToggle",
      "#collapseSidebar",
      "#themeToggleIcon",
      ".copy-button",
      ".social-link",
      ".topbar-download",
    ]) {
      const box = await page.locator(selector).first().boundingBox();
      expect(box.width, selector).toBeGreaterThanOrEqual(44);
      expect(box.height, selector).toBeGreaterThanOrEqual(44);
    }
    for (const selector of [
      ".sidebar li.active > a",
      ".sidebar .folder > .tree-row",
    ]) {
      const box = await page.locator(selector).first().boundingBox();
      expect(box.height, selector).toBeGreaterThanOrEqual(44);
    }
  });

  test("copy buttons have an accessible name", async ({ page }) => {
    await page.goto("/content/tests/Markdown-it.md");
    await expect(page.locator(".copy-button").first()).toHaveAttribute(
      "aria-label",
      "Copy code",
    );
  });
});
