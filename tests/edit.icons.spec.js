import { test, expect } from "@playwright/test";

const actionIcons = async (page) => {
  await page.goto("/content/Home.md");
  const edit = await page
    .locator(".edit-icon:visible, .topbar-edit:visible")
    .boundingBox();
  const download = await page
    .locator(".download-icon:visible, .topbar-download:visible")
    .boundingBox();
  expect(edit.x + edit.width).toBeLessThanOrEqual(download.x);
  return [edit, download];
};

test.describe("Action Icons", () => {
  test("one set sits edit beside download per viewport", async ({ page }) => {
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await actionIcons(page);
    }
  });
});

for (const width of [390, 1024]) {
  test.describe(`Action Icons on Touch at ${width}px`, () => {
    test.use({ viewport: { width, height: 768 }, hasTouch: true });

    test("are separate 44px targets", async ({ page }) => {
      await page.goto("/content/Home.md");
      expect(
        await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
      ).toBe(true);
      for (const box of await actionIcons(page)) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    });
  });
}
