import { test, expect } from "@playwright/test";
import { useServers } from "./server.js";

const serve = useServers();
const site = (...args) => serve({ "Home.md": "# Home\n" }, ...args);

test.describe("Theme Option", () => {
  test("--theme light starts light", async ({ page }) => {
    const server = await site("--theme", "light");
    await page.goto(`${server.url}/`);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  for (const scheme of ["light", "dark"]) {
    test(`--theme auto follows a ${scheme} system`, async ({ page }) => {
      const server = await site("--theme", "auto");
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`${server.url}/`);
      await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
    });
  }

  test("a stored choice beats the default", async ({ page }) => {
    const server = await site("--theme", "light");
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    await page.goto(`${server.url}/`);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});
