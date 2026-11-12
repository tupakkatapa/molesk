import { test, expect } from "@playwright/test";
import { downloadHref, pageHref } from "../public/slug.mjs";

const POST = "posts/My First Post.md";

test.describe("Download Links", () => {
  test("encodes paths with spaces", async ({ page, request }) => {
    await page.goto(pageHref(POST));
    const downloadBtn = page.locator(".download-icon");
    await expect(downloadBtn).toHaveAttribute("href", downloadHref(POST));
    const res = await request.get(downloadHref(POST));
    expect(res.status()).toBe(200);
  });

  test("the file's own path moves to the page address", async ({ request }) => {
    const res = await request.get("/download/posts/My%20First%20Post.md", {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(301);
    expect(res.headers().location).toBe(downloadHref(POST));
  });

  test("ajax navigation keeps an encoded download link", async ({
    request,
  }) => {
    const res = await request.get(pageHref(POST), {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    expect(await res.text()).toContain(`href="${downloadHref(POST)}"`);
  });
});
