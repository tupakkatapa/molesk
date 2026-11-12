import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

const unique = () => `keys-${randomUUID().slice(0, 8)}`;

const openNote = async (page, request, text) => {
  const file = `${unique()}.md`;
  await request.put(`/api/files/${file}`, {
    headers: { "Content-Type": "text/markdown", "If-None-Match": "*" },
    data: text,
  });
  await page.goto(`/edit/${file}`);
  return file;
};

const textarea = (page) => page.locator("#editor textarea");

// Puts the caret where "|" is in `text`, or selects between two of them.
const setText = (page, text) =>
  textarea(page).evaluate((el, value) => {
    const [start, end = start] = [...value.matchAll(/\|/gu)].map(
      (match, i) => match.index - i,
    );
    el.focus();
    el.value = value.replaceAll("|", "");
    el.setSelectionRange(start, end);
  }, text);

// The text with "|" at the caret, or around the selection.
const textWithCaret = (page) =>
  textarea(page).evaluate((el) => {
    const { selectionStart: start, selectionEnd: end, value } = el;
    const selected = start === end ? "" : `${value.slice(start, end)}|`;
    return `${value.slice(0, start)}|${selected}${value.slice(end)}`;
  });

const CONTINUATION = [
  ["bullet", "- one|", "- one\n- |"],
  ["star bullet", "* one|", "* one\n* |"],
  ["numbered", "1. one|", "1. one\n2. |"],
  ["numbered paren", "9) nine|", "9) nine\n10) |"],
  ["task", "- [x] done|", "- [x] done\n- [ ] |"],
  ["quote", "> said|", "> said\n> |"],
  ["nested", "  - deep|", "  - deep\n  - |"],
  ["empty item ends the list", "- one\n- |", "- one\n|"],
  ["empty task ends the list", "- [ ] |", "|"],
  ["empty quote ends it", "> |", "|"],
  ["plain line", "plain|", "plain\n|"],
  ["mid item splits", "- on|e", "- on\n- |e"],
];

test.describe("Markdown Helpers - Enter", () => {
  for (const [label, before, after] of CONTINUATION) {
    test(label, async ({ page, request }) => {
      await openNote(page, request, "");
      await setText(page, before);
      await textarea(page).press("Enter");
      expect(await textWithCaret(page)).toBe(after);
    });
  }

  test("Ctrl+Z undoes a continuation", async ({ page, request }) => {
    await openNote(page, request, "");
    await setText(page, "- one|");
    await textarea(page).press("Enter");
    await textarea(page).press("Control+z");
    expect(await textarea(page).inputValue()).toBe("- one");
  });
});

test.describe("Markdown Helpers - Keys", () => {
  const cases = [
    ["Tab indents a list item", "- a\n- b|", "Tab", "- a\n  - b|"],
    ["Shift+Tab outdents it", "- a\n  - b|", "Shift+Tab", "- a\n- b|"],
    ["Ctrl+B wraps the selection", "a |word| b", "Control+b", "a **|word|** b"],
    ["Ctrl+I wraps the selection", "a |word| b", "Control+i", "a _|word|_ b"],
    ["Ctrl+B with no selection", "a |", "Control+b", "a **|**"],
    ["Ctrl+K makes a link", "|site|", "Control+k", "[site](|url|)"],
  ];
  for (const [label, before, key, after] of cases) {
    test(label, async ({ page, request }) => {
      await openNote(page, request, "");
      await setText(page, before);
      await textarea(page).press(key);
      expect(await textWithCaret(page)).toBe(after);
    });
  }

  test("Tab outside a list leaves the editor", async ({ page, request }) => {
    await openNote(page, request, "");
    await setText(page, "plain|");
    await textarea(page).press("Tab");
    await expect(textarea(page)).not.toBeFocused();
    expect(await textarea(page).inputValue()).toBe("plain");
  });
});

test.describe("Formatting Bar", () => {
  const cases = [
    ["Bold", "a |b|", "a **|b|**"],
    ["Checklist", "buy |milk", "- [ ] buy |milk"],
    ["Bulleted list", "x|", "- x|"],
    ["Heading", "Title|", "## Title|"],
    ["Code", "run |ls|", "run `|ls|`"],
  ];
  for (const [name, before, after] of cases) {
    test(`${name} keeps focus in the text`, async ({ page, request }) => {
      await openNote(page, request, "");
      await setText(page, before);
      await textarea(page).focus();
      await page.getByRole("button", { name, exact: true }).click();
      await expect(textarea(page)).toBeFocused();
      expect(await textWithCaret(page)).toBe(after);
    });
  }

  test("pressing it again removes a line prefix", async ({ page, request }) => {
    await openNote(page, request, "");
    await setText(page, "- [ ] milk|");
    await textarea(page).focus();
    await page.getByRole("button", { name: "Checklist", exact: true }).click();
    expect(await textWithCaret(page)).toBe("milk|");
  });
});

test.describe("Formatting Bar - Blocks", () => {
  const blocks = [
    ["Code block", "on an empty line", "|", "```\n|\n```"],
    ["Code block", "around selected lines", "|ls\npwd|", "```\n|ls\npwd|\n```"],
    ["Code block", "around the current line", "l|s", "```\n|ls|\n```"],
    [
      "Table",
      "on an empty line",
      "|",
      `| |Column| | Column |\n| ------ | ------ |\n|        |        |`,
    ],
    [
      "Table",
      "after text",
      "Intro|",
      `Intro\n\n| |Column| | Column |\n| ------ | ------ |\n|        |        |`,
    ],
  ];
  for (const [name, where, before, after] of blocks) {
    test(`${name} ${where}`, async ({ page, request }) => {
      await openNote(page, request, "");
      await setText(page, before);
      await textarea(page).focus();
      await page.getByRole("button", { name, exact: true }).click();
      await expect(textarea(page)).toBeFocused();
      expect(await textWithCaret(page)).toBe(after);
    });
  }

  test("every button fits on screen while typing", async ({
    page,
    request,
  }) => {
    await openNote(page, request, "");
    await textarea(page).focus();
    const { width } = page.viewportSize();
    const buttons = page.locator(".editor-format button");
    await expect(buttons.first()).toBeVisible();
    for (const box of await buttons.evaluateAll((all) =>
      all.map((button) => button.getBoundingClientRect().toJSON()),
    )) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(width);
    }
  });
});

test.describe("Preview", () => {
  test("draws Mermaid diagrams", async ({ page, request }) => {
    await openNote(page, request, "```mermaid\ngraph TD\n  A-->B\n```\n");
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.locator(".editor-preview pre.mermaid svg")).toBeVisible();
  });

  test("side by side on wide screens, remembered", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await openNote(page, request, "# Wide\n\n**bold**\n");
    const preview = page.locator("#editor .editor-preview");
    await expect(preview).toBeHidden();
    await page.getByRole("button", { name: "Split", exact: true }).click();
    await expect(preview.locator("strong")).toHaveText("bold");
    await expect(textarea(page)).toBeVisible();
    await expect(page.locator(".sidebar")).toHaveClass(/collapsed/u);
    await textarea(page).fill("# Wide\n\n_changed_\n");
    await expect(preview.locator("em")).toHaveText("changed");
    await page.reload();
    await expect(preview).toBeVisible();
  });
});

test.describe("Preview - Split", () => {
  test("Split survives a wide code block", async ({ page, request }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    const code = `\`\`\`js\n${"const x = 1; ".repeat(40)}\n\`\`\`\n`;
    await openNote(page, request, code);
    await page.getByRole("button", { name: "Split", exact: true }).click();
    const preview = page.locator("#editor .editor-preview");
    await expect(preview.locator(".code-wrapper .copy-button")).toBeVisible();
    await expect(preview.locator(".code-language")).toHaveText("js");
    const widths = await page.evaluate(() => [
      document.scrollingElement.scrollWidth,
      window.innerWidth,
      document.querySelector("#editor .editor-text").clientWidth,
    ]);
    expect(widths[0]).toBeLessThanOrEqual(widths[1]);
    expect(widths[2]).toBeGreaterThan(200);
  });

  test("Split is offered only on wide screens", async ({ page, request }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await openNote(page, request, "# Narrow\n");
    await expect(
      page.getByRole("button", { name: "Split", exact: true }),
    ).toBeHidden();
  });

  test("Write and Preview swap on narrow screens", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openNote(page, request, "# Narrow\n\n**bold**\n");
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    const preview = page.locator("#editor .editor-preview");
    await expect(preview.locator("strong")).toHaveText("bold");
    await expect(textarea(page)).toBeHidden();
    await page.getByRole("button", { name: "Write", exact: true }).click();
    await expect(textarea(page)).toBeVisible();
    await expect(preview).toBeHidden();
  });
});
