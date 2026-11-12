import { test, expect } from "@playwright/test";
import { openNote, serverText } from "./editor.js";

const textarea = (page) => page.locator("#editor textarea");
const status = (page) => page.locator(".editor-status:visible");

test("History restores an earlier version as a new edit", async ({
  page,
  request,
}) => {
  const first = `# First version of ${Date.now()}\n`;
  const { file } = await openNote(page, request, first);
  // Edits within the commit delay are one version; asking for the history
  // commits what is pending, as the delay passing would
  await request.get(`/api/history/${file}`);
  await textarea(page).press("ControlOrMeta+a");
  await page.keyboard.type("# Second version\n");
  await textarea(page).press("Control+s");
  await expect(status(page)).toHaveText("Saved");

  await page.locator(".editor-more:visible").click();
  await page.getByRole("menuitem", { name: "History" }).click();
  const versions = page.locator("#historyDialog .history-version");
  await expect(versions).toHaveCount(2);
  await versions.last().click();

  await expect(page.locator("#historyDialog")).not.toBeVisible();
  await expect(textarea(page)).toHaveValue(first);
  await expect(status(page)).toHaveText("Saved");
  expect(await serverText(request, file)).toBe(first);

  await textarea(page).press("Control+z");
  await expect(textarea(page)).toHaveValue("# Second version\n");
});

test("a note without versions says so", async ({ page, request }) => {
  await openNote(page, request, "# Only\n");
  await page.route("**/api/history/**", (route) =>
    route.fulfill({ json: { versions: [], error: null } }),
  );
  await page.locator(".editor-more:visible").click();
  await page.getByRole("menuitem", { name: "History" }).click();
  await expect(page.locator("#historyDialog .history-status")).toHaveText(
    "No versions yet.",
  );
});
