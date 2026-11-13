import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { useServers } from "./server.js";

const serve = useServers();
const LONG = Array.from({ length: 80 }, (_, i) => `Line ${i}.`).join("\n\n");
const FILES = {
  "Home.md":
    "# Home\n\n[Other](/content/Other.md)\n\n[Far](/content/Other.md#far)\n",
  "Other.md": `# Other\n\n${LONG}\n\n## Far\n\nEnd.\n`,
  "notes/Kitchen.md": "---\ndate: 2024-05-01\n---\n# Kitchen\n",
  "notes/Kites.md": "# Kites\n",
  "notes/Maybe.md": "---\ndraft: true\n---\n# Maybe\n",
};
const status = (page) => page.locator(".sidebar .search-status");

test.describe("Navigation - Focus and anchors", () => {
  test("after a link, focus is on the new page's title", async ({ page }) => {
    const { url } = await serve(FILES);
    await page.goto(`${url}/content/Home.md`);
    await page
      .locator("#file-content")
      .getByRole("link", { name: "Other" })
      .click();
    await expect(page.locator("#file-content h1")).toHaveText("Other");
    await expect(page.locator("#file-content h1")).toBeFocused();
  });

  test("a link to a heading on another page lands on it", async ({ page }) => {
    const { url } = await serve(FILES);
    await page.goto(`${url}/content/Home.md`);
    await page
      .locator("#file-content")
      .getByRole("link", { name: "Far" })
      .click();
    await expect(page).toHaveURL(/\/content\/other#far$/u);
    await expect(page.locator("#far")).toBeInViewport();
  });

  test("scripts never ask for smooth scrolling", () => {
    const scripts = readdirSync("public").filter((name) =>
      name.endsWith(".js"),
    );
    for (const name of scripts) {
      expect(readFileSync(`public/${name}`, "utf8"), name).not.toMatch(
        /behavior: "smooth"/u,
      );
    }
  });

  test("a skip link leads to the content; social icons are named", async ({
    page,
  }) => {
    const { url } = await serve(FILES, "--link", "fa-x-twitter:x.com/a");
    await page.goto(`${url}/content/Home.md`);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toHaveAttribute("href", "#file-content");
    await expect(
      page.getByRole("link", { name: "X", exact: true }),
    ).toBeVisible();
  });
});

test.describe("Navigation - Search and keys", () => {
  test("a live region says the count and the highlighted row", async ({
    page,
  }) => {
    const { url } = await serve(FILES);
    await page.goto(`${url}/content/Home.md`);
    await expect(status(page)).toHaveAttribute("role", "status");
    await page.locator(".sidebar .tree-filter").fill("ki");
    await expect(status(page)).toHaveText("2 results. Kitchen");
    await page.keyboard.press("ArrowDown");
    await expect(status(page)).toHaveText("2 results. Kites");
  });

  test("the name filter ignores dates and badges", async ({ page }) => {
    const { url } = await serve(FILES, "--edit");
    await page.goto(`${url}/content/Home.md`);
    const filter = page.locator(".sidebar .tree-filter");
    for (const query of ["2024", "draft"]) {
      await filter.fill(query);
      await expect(page.locator(".sidebar li.note:not([hidden])")).toHaveCount(
        0,
      );
    }
  });

  test("Escape closes the sidebar on phones only", async ({ page }) => {
    const { url } = await serve(FILES);
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto(`${url}/content/Home.md`);
    await page.keyboard.press("Escape");
    await expect(page.locator(".sidebar")).not.toHaveClass(/collapsed/u);
    await page.setViewportSize({ width: 390, height: 800 });
    await page.reload();
    await page.locator("#menuToggle").click();
    await expect(page.locator(".sidebar")).not.toHaveClass(/collapsed/u);
    await page.keyboard.press("Escape");
    await expect(page.locator(".sidebar")).toHaveClass(/collapsed/u);
  });
});
