import { test, expect } from "@playwright/test";
import { openNav } from "./helpers.js";
import {
  unique,
  create,
  openNote,
  serverText,
  dialogTypes,
  status,
  textarea,
} from "./editor.js";
import { editHref, folderHref, pageHref, slugPath } from "../public/slug.mjs";

test.describe("Editor - New Note", () => {
  test("a nested name creates folders and opens the editor", async ({
    page,
    request,
  }) => {
    const name = unique();
    await page.goto(pageHref("posts/My First Post.md"));
    await openNav(page);
    await page
      .locator(".sidebar .navigation-buttons > ul > li.tree-new > button")
      .click();
    const input = page.locator(".sidebar .tree-input");
    await input.fill(`${name}/Idea`);
    await input.press("Enter");
    await expect(page).toHaveURL(editHref(`${name}/Idea.md`));
    await textarea(page).press("End");
    await textarea(page).pressSequentially(`Body ${name}`);
    await expect(status(page)).toHaveText("Saved");
    expect(await serverText(request, `${name}/Idea.md`)).toMatch(
      new RegExp(`^---\\ndate: "[-\\d]+"\\n---\\n\\nBody ${name}$`, "u"),
    );
  });
});

test.describe("Editor - Front Matter", () => {
  const front = `---\ntitle: "T"\ndate: "2024-01-02"\n---\n\n`;

  test("shows the date like the note, not the block", async ({
    page,
    request,
  }) => {
    await openNote(page, request, `${front}Hello\n`);
    await expect(textarea(page)).toHaveValue("Hello\n");
    await expect(page.locator("#editor .meta-date")).toHaveText("2 Jan 2024");
  });

  test("saves the front matter back unchanged", async ({ page, request }) => {
    const { file } = await openNote(page, request, `${front}Hello\n`);
    await textarea(page).press("Control+End");
    await textarea(page).pressSequentially("again\n");
    await expect(status(page)).toHaveText("Saved");
    expect(await serverText(request, file)).toBe(`${front}Hello\nagain\n`);
  });
});

test.describe("Editor - Tags", () => {
  const tags = (page) => page.locator(".editor-tags");

  test("shows the page's tags and saves changed ones", async ({
    page,
    request,
  }) => {
    const { file } = await openNote(
      page,
      request,
      "---\ndate: 2024-01-02\ntags:\n  - old\n  - two\n---\n\nHello\n",
    );
    await expect(tags(page)).toHaveValue("old, two");
    await tags(page).fill("cards, two words");
    await expect(status(page)).toHaveText("Saved");
    expect(await serverText(request, file)).toBe(
      '---\ndate: 2024-01-02\ntags: ["cards", "two words"]\n---\n\nHello\n',
    );
  });

  test("adds a block to a page without one and removes it again", async ({
    page,
    request,
  }) => {
    const { file } = await openNote(page, request, "Hello\n");
    await tags(page).fill("cards");
    await expect(status(page)).toHaveText("Saved");
    expect(await serverText(request, file)).toBe(
      '---\ntags: ["cards"]\n---\n\nHello\n',
    );
    await tags(page).fill("");
    await expect(status(page)).toHaveText("Saved");
    expect(await serverText(request, file)).toBe("Hello\n");
  });
});

test.describe("Editor - Opening", () => {
  test("edit button opens the editor with the raw text", async ({
    page,
    request,
  }) => {
    const file = `${unique()}.md`;
    await create(request, file, "# Raw <b>text</b>\n");
    await page.goto(pageHref(file));
    await page.locator(".edit-icon:visible, .topbar-edit:visible").click();
    await expect(page).toHaveURL(editHref(file));
    await expect(textarea(page)).toHaveValue("# Raw <b>text</b>\n");
  });

  test("e opens the editor from a note", async ({ page, request }) => {
    const file = `${unique()}.md`;
    await create(request, file, "# E\n");
    await page.goto(pageHref(file));
    await page.keyboard.press("e");
    await expect(page).toHaveURL(editHref(file));
  });

  test("the file's own path moves to the page address", async ({ request }) => {
    const file = `${unique()} Note.md`;
    await create(request, file, "# Moved\n");
    const res = await request.get(`/edit/${encodeURIComponent(file)}`, {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(301);
    expect(res.headers().location).toBe(editHref(file));
  });
});

test.describe("Editor - Layout", () => {
  test("shares the note card, title and folder crumbs", async ({
    page,
    request,
  }) => {
    const { file } = await openNote(page, request, "# T\n", "posts/");
    const editor = page.locator("#editor");
    await expect(editor).toHaveClass(/markdown-body/u);
    await expect(page.locator("#editor .editor-title")).toHaveValue(
      file.slice("posts/".length, -".md".length),
    );
    await expect(page.locator("#editor .crumbs a").last()).toHaveAttribute(
      "href",
      "/content/posts/",
    );
    const font = await textarea(page).evaluate(
      (el) => getComputedStyle(el).fontFamily,
    );
    expect(font).toContain("Literata");
  });

  test("grows with the text; the action bar stays in view", async ({
    page,
    request,
  }) => {
    const { width } = page.viewportSize();
    await page.setViewportSize({ width, height: 500 });
    await openNote(page, request, "line\n".repeat(200));
    const box = await textarea(page).evaluate((el) => ({
      fontSize: parseFloat(getComputedStyle(el).fontSize),
      clipped: el.scrollHeight > el.clientHeight + 1,
    }));
    expect(box.fontSize).toBeGreaterThanOrEqual(16);
    expect(box.clipped).toBe(false);
    await page.evaluate(() =>
      window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }),
    );
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(page.locator(".editor-done:visible")).toBeInViewport({
      ratio: 1,
    });
  });
});

test.describe("Editor - Controls", () => {
  test("every control uses the content font", async ({ page, request }) => {
    await openNote(page, request, "# F\n");
    const fonts = await page
      .locator("#editor button, #editor input, #editor a.btn")
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).fontFamily));
    expect(fonts.length).toBeGreaterThan(3);
    for (const font of fonts) expect(font).toContain("Literata");
  });
});

test.describe("Editor - Rename", () => {
  test("the title renames the file", async ({ page, request }) => {
    const { file } = await openNote(page, request, "# A\n", "posts/");
    const name = unique();
    const title = page.locator("#editor .editor-title");
    await title.fill(name);
    await title.press("Enter");
    await expect(page).toHaveURL(editHref(`posts/${name}.md`));
    const old = await request.get(pageHref(file), { maxRedirects: 0 });
    expect(old.headers().location).toBe(pageHref(`posts/${name}.md`));
    const front = `---\naliases:\n  - "${decodeURIComponent(slugPath(file))}"\n---\n\n`;
    expect(await serverText(request, `posts/${name}.md`)).toBe(`${front}# A\n`);
    await textarea(page).fill("# After rename\n");
    await textarea(page).press("Control+s");
    await expect(status(page)).toHaveText("Saved");
    await expect(page.locator(".editor-conflict")).toBeHidden();
    expect(await serverText(request, `posts/${name}.md`)).toBe(
      `${front}# After rename\n`,
    );
  });

  test("a taken name shows an inline error", async ({ page, request }) => {
    const { file } = await openNote(page, request, "# A\n", "posts/");
    const title = page.locator("#editor .editor-title");
    await title.fill("My First Post");
    await title.press("Enter");
    await expect(page.locator("#editor .editor-title-error")).toHaveText(
      /already exists/u,
    );
    await expect(page).toHaveURL(editHref(file));
    await title.press("Escape");
    await expect(title).toHaveValue(file.slice(6, -3));
    await expect(page.locator("#editor .editor-title-error")).toBeHidden();
  });
});

test.describe("Editor - Delete", () => {
  test("asks in an app dialog, then trashes the note", async ({
    page,
    request,
  }) => {
    const { file } = await openNote(page, request, "# Doomed\n", "posts/");
    const dialogs = dialogTypes(page);
    await page.locator("#editor .editor-more").click();
    await page.getByRole("menuitem", { name: /Delete/u }).click();
    const confirm = page.locator("#deleteDialog");
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText(".trash");
    await confirm.getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(folderHref("posts"));
    expect((await request.get(pageHref(file))).status()).toBe(404);
    expect(dialogs).toEqual([]);
  });

  test("Cancel keeps the note", async ({ page, request }) => {
    const { file } = await openNote(page, request, "# Kept\n");
    await page.locator("#editor .editor-more").click();
    await page.getByRole("menuitem", { name: /Delete/u }).click();
    await page
      .locator("#deleteDialog")
      .getByRole("button", { name: "Cancel" })
      .click();
    await expect(page.locator("#deleteDialog")).toBeHidden();
    await expect(page).toHaveURL(editHref(file));
  });
});

test.describe("Editor - Mobile Top Bar", () => {
  test("offers Edit on notes and Done with the save status in the editor", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    const file = `${unique()}.md`;
    await create(request, file, "# Top\n");
    await page.goto(pageHref(file));
    const bar = page.locator(".topbar");
    await bar.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(editHref(file));
    await expect(page.locator("#editor .editor-done")).toBeHidden();
    await textarea(page).fill("# Top bar\n");
    await expect(bar.locator(".editor-status")).toHaveText("Saved");
    await bar.getByRole("link", { name: "Done" }).click();
    await expect(page).toHaveURL(pageHref(file));
  });
});

test.describe("Editor - Phone Layout", () => {
  test("the bar sticks under the top bar with 44px controls", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await openNote(page, request, `# Long\n\n${"line\n\n".repeat(80)}`);
    await expect(textarea(page)).toHaveAttribute(
      "placeholder",
      "Start writing…",
    );
    await page.evaluate(() => scrollTo({ top: 2000, behavior: "instant" }));
    const top = (await page.locator(".topbar").boundingBox()).height;
    const bar = await page.locator("#editor .editor-bar").boundingBox();
    expect(Math.round(bar.y)).toBe(Math.round(top));
    for (const control of [
      page.locator(".topbar .editor-done"),
      page.getByRole("button", { name: "Write", exact: true }),
      page.getByRole("button", { name: "Preview", exact: true }),
    ]) {
      expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
  });
});
