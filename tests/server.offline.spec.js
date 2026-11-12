import { test, expect } from "@playwright/test";
import { useServers } from "./server.js";

const serve = useServers();
const FILES = {
  "Note.md":
    "# Note\n\n*Some* `code` and a [link](#x).\n\n```js\nlet a = 1;\n```\n",
  "posts/Old.md": "# Old\n",
};

test.describe("Offline", () => {
  test("pages load nothing from other origins", async ({ page }) => {
    const { url } = await serve(FILES, "--edit", "--link", "fa-github:x.test");
    const foreign = [];
    const fonts = [];
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (new URL(request.url()).origin !== url) foreign.push(request.url());
      if (request.resourceType() === "font") fonts.push(request.url());
    });
    for (const path of [
      "/content/Note.md",
      "/content/posts/",
      "/edit/Note.md",
    ]) {
      await page.goto(`${url}${path}`);
      await page.waitForLoadState("networkidle");
    }
    expect(foreign).toEqual([]);
    expect(errors).toEqual([]);
    expect(fonts.length).toBeGreaterThan(0);
  });

  test("the CSP allows only this origin", async ({ request }) => {
    const { url } = await serve(FILES);
    const csp = (await request.get(`${url}/content/Note.md`)).headers()[
      "content-security-policy"
    ];
    expect(csp).not.toMatch(/https?:/u);
  });

  test("brand icons render from the vendored font", async ({ page }) => {
    const { url } = await serve(FILES, "--link", "fa-github:x.test");
    await page.goto(`${url}/content/Note.md`);
    const glyph = await page
      .locator(".social-link .fa-github")
      .evaluate((icon) => getComputedStyle(icon, "::before").content);
    expect(glyph).not.toBe("none");
    const brands = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts]
        .filter((font) => font.family.includes("Brands"))
        .map((font) => font.status);
    });
    expect(brands).toContain("loaded");
  });
});
