import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { useServers } from "./server.js";

const serve = useServers();

test.describe("Editor - Early typing", () => {
  test("text typed before the editor script is ready is saved", async ({
    page,
  }) => {
    const { url, dir } = await serve({ "Note.md": "# Top\n" }, "--edit");
    await page.route("**/editor.js", async (route) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });
      await route.continue();
    });
    await page.goto(`${url}/edit/note`, { waitUntil: "commit" });
    await page.locator(".editor-text").fill("# Top bar\n");
    await expect(page.locator(".editor-status").first()).toHaveText("Saved");
    expect(readFileSync(path.join(dir, "Note.md"), "utf8")).toBe("# Top bar\n");
  });

  test("an untouched note is not saved again", async ({ page }) => {
    const { url } = await serve(
      { "Note.md": "---\ntags: [a]\n---\n\n# Top\r\n\r\nText\n" },
      "--edit",
    );
    let saves = 0;
    page.on("request", (request) => {
      if (request.method() === "PUT") saves += 1;
    });
    await page.goto(`${url}/edit/note`);
    await expect(page.locator(".editor-text")).toHaveAttribute(
      "autocomplete",
      "off",
    );
    await page.waitForTimeout(1500);
    expect(saves).toBe(0);
    await expect(page.locator(".editor-status").first()).toHaveText("");
  });
});
