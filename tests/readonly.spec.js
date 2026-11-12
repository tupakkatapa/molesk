import { test, expect } from "@playwright/test";

test.describe("Read-only Mode", () => {
  test("exposes no edit UI", async ({ page }) => {
    await page.goto("/content/Home.md");
    await expect(page.locator("#file-content")).toBeVisible();
    await expect(page.locator(".edit-icon")).toHaveCount(0);
    await expect(page.locator("#newNote")).toHaveCount(0);
    await expect(page.locator("#newNoteDialog")).toHaveCount(0);
    await expect(page.locator('script[src="/editor.js"]')).toHaveCount(0);
  });

  test("exposes no write API", async ({ request }) => {
    const put = await request.put("/api/files/x.md", {
      headers: { "Content-Type": "text/markdown", "If-None-Match": "*" },
      data: "# x",
    });
    expect(put.status()).toBe(404);
    const del = await request.delete("/api/files/Home.md", {
      headers: { "If-Match": "*" },
    });
    expect(del.status()).toBe(404);
    const edit = await request.get("/edit/Home.md");
    expect(edit.status()).toBe(404);
  });
});
