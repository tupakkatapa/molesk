import { test, expect } from "@playwright/test";
import { openNav } from "./helpers.js";
import {
  create,
  openNote,
  serverText,
  holdSaves,
  dialogTypes,
  status,
  textarea,
} from "./editor.js";
import { pageHref } from "../public/slug.mjs";

test.describe("Editor - Autosave", () => {
  test("saves 800ms after the last keystroke", async ({ page, request }) => {
    await page.clock.install();
    const { file } = await openNote(page, request, "# A\n");
    const { puts, release } = await holdSaves(page, file);
    release();
    await textarea(page).fill("# A\nmore");
    await page.clock.runFor(700);
    await textarea(page).press("End");
    await textarea(page).press("!");
    await page.clock.runFor(799);
    expect(puts).toHaveLength(0);
    await page.clock.runFor(1);
    await expect(status(page)).toHaveText("Saved");
    expect(puts.map((put) => put.body)).toEqual(["# A\nmore!"]);
    expect(await serverText(request, file)).toBe("# A\nmore!");
  });

  test("coalesces saves and chains each ETag", async ({ page, request }) => {
    const { file, etag } = await openNote(page, request, "# A\n");
    const { puts, release } = await holdSaves(page, file);
    await textarea(page).fill("# One\n");
    await textarea(page).press("Control+s");
    await expect.poll(() => puts.length).toBe(1);
    await textarea(page).fill("# Two\n");
    await textarea(page).press("Control+s");
    await textarea(page).fill("# Three\n");
    await textarea(page).press("Control+s");
    expect(puts).toHaveLength(1);
    release();
    await expect(status(page)).toHaveText("Saved");
    expect(puts.map((put) => put.body)).toEqual(["# One\n", "# Three\n"]);
    expect(puts[0].ifMatch).toBe(etag);
    expect(puts[1].ifMatch).not.toBe(etag);
    expect(await serverText(request, file)).toBe("# Three\n");
  });
});

test.describe("Editor - Autosave Chaining", () => {
  test("text typed during a save is saved next", async ({ page, request }) => {
    const { file } = await openNote(page, request, "# A\n");
    const { puts, release } = await holdSaves(page, file);
    await textarea(page).fill("# Sent\n");
    await textarea(page).press("Control+s");
    await expect.poll(() => puts.length).toBe(1);
    await textarea(page).press("End");
    await textarea(page).pressSequentially("more");
    release();
    await expect(status(page)).toHaveText("Saved");
    await expect.poll(() => serverText(request, file)).toBe("# Sent\nmore");
  });

  test("leaving the page flushes unsaved text", async ({ page, request }) => {
    const { file } = await openNote(page, request, "# A\n");
    await textarea(page).fill("# Flushed\n");
    await page.goto("/content/posts/My%20First%20Post.md");
    await expect.poll(() => serverText(request, file)).toBe("# Flushed\n");
  });

  test("a network failure says so and retries", async ({ page, request }) => {
    const { file } = await openNote(page, request, "# A\n");
    await page.route(`**/api/files/${file}`, (route) => route.abort());
    await textarea(page).fill("# Offline\n");
    await textarea(page).press("Control+s");
    await expect(status(page)).toHaveText("Offline — not saved");
    await page.unroute(`**/api/files/${file}`);
    await textarea(page).press("Control+s");
    await expect(status(page)).toHaveText("Saved");
  });
});

test.describe("Editor - Leaving", () => {
  test("Done saves and opens the note", async ({ page, request }) => {
    const { file } = await openNote(page, request, "# A\n");
    const dialogs = dialogTypes(page);
    await textarea(page).fill("# Done\n");
    await page.locator(".editor-done:visible").click();
    await expect(page).toHaveURL(pageHref(file));
    await expect(page.locator("#file-content h1")).toHaveText("Done");
    expect(dialogs).toEqual([]);
  });

  test("Escape is Done", async ({ page, request }) => {
    const { file } = await openNote(page, request, "# A\n");
    await textarea(page).press("Escape");
    await expect(page).toHaveURL(pageHref(file));
  });

  test("sidebar links save before leaving", async ({ page, request }) => {
    const { file } = await openNote(page, request, "# A\n");
    const dialogs = dialogTypes(page);
    await textarea(page).fill("# Left\n");
    await openNav(page);
    await page.locator(".sidebar a.site-name").click();
    await expect(page).toHaveURL("/");
    await expect(
      page.locator(`.sidebar a[href="${pageHref("Home.md")}"]`),
    ).toBeAttached();
    expect(await serverText(request, file)).toBe("# Left\n");
    expect(dialogs).toEqual([]);
  });

  test("closing with unsaved text asks first", async ({ page, request }) => {
    await openNote(page, request, "# A\n");
    const dialogs = dialogTypes(page);
    await textarea(page).fill("# Unsaved\n");
    await page.close({ runBeforeUnload: true });
    await expect.poll(() => dialogs).toEqual(["beforeunload"]);
  });
});

const conflictAfterExternalEdit = async (page, request) => {
  const { file, etag } = await openNote(page, request, "# One\n");
  await request.put(`/api/files/${file}`, {
    headers: { "Content-Type": "text/markdown", "If-Match": etag },
    data: "# Theirs\n",
  });
  await textarea(page).fill("# Mine\n");
  await textarea(page).press("Control+s");
  const banner = page.locator("#editor .editor-conflict");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("This page changed elsewhere.");
  await expect(status(page)).toBeHidden();
  return { file, banner };
};

test.describe("Editor - Conflicts", () => {
  test("Keep mine overwrites", async ({ page, request }) => {
    const { file, banner } = await conflictAfterExternalEdit(page, request);
    await banner.getByRole("button", { name: "Keep mine" }).click();
    await expect(status(page)).toHaveText("Saved");
    await expect(banner).toBeHidden();
    expect(await serverText(request, file)).toBe("# Mine\n");
  });

  test("Load theirs keeps mine as a conflict copy", async ({
    page,
    request,
  }) => {
    const { file, banner } = await conflictAfterExternalEdit(page, request);
    const dialogs = dialogTypes(page);
    const copy = file.replace(/\.md$/u, " (conflict).md");
    await create(request, copy, "# Earlier copy\n");
    await banner.getByRole("button", { name: "Load theirs" }).click();
    await expect(textarea(page)).toHaveValue("# Theirs\n");
    expect(await serverText(request, copy)).toBe("# Earlier copy\n");
    expect(
      await serverText(request, file.replace(/\.md$/u, " (conflict 2).md")),
    ).toBe("# Mine\n");
    expect(dialogs).toEqual([]);
  });

  test("Keep mine recreates a note deleted elsewhere", async ({
    page,
    request,
  }) => {
    const { file } = await openNote(page, request, "# One\n");
    await request.delete(`/api/files/${file}`, {
      headers: { "If-Match": "*" },
    });
    await textarea(page).fill("# Mine\n");
    await textarea(page).press("Control+s");
    const banner = page.locator("#editor .editor-conflict");
    await banner.getByRole("button", { name: "Keep mine" }).click();
    await expect(status(page)).toHaveText("Saved");
    expect(await serverText(request, file)).toBe("# Mine\n");
  });
});

// The first save reaches the server but its response is held in the page,
// so leaving happens with that save in flight. Holding it in the page rather
// than with page.route keeps the keepalive PUT sent on leaving clear of
// request interception, which aborts it when the page unloads.
const holdFirstResponse = (page) =>
  page.evaluate(() => {
    const { fetch } = window;
    let held = false;
    window.fetch = (url, init = {}) => {
      if (init.method !== "PUT" || held) return fetch(url, init);
      held = true;
      return fetch(url, init).then(() => new Promise(() => {}));
    };
  });

test.describe("Editor - Leaving During a Save", () => {
  test("text typed during a slow save is sent on leaving", async ({
    page,
    request,
  }) => {
    const { file } = await openNote(page, request, "# A\n");
    await holdFirstResponse(page);
    await textarea(page).fill("# Sent\n");
    await textarea(page).press("Control+s");
    await expect.poll(() => serverText(request, file)).toBe("# Sent\n");
    await textarea(page).press("End");
    await textarea(page).pressSequentially("later");
    await page.goto("/content/posts/My%20First%20Post.md");
    await expect.poll(() => serverText(request, file)).toBe("# Sent\nlater");
  });
});
