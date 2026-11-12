import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { md } from "../lib/markdown.js";
import { useServers } from "./server.js";
import { pageHref } from "../public/slug.mjs";

const serve = useServers();
const site = {
  resolve: (target) => (target === "Known" ? "posts/Known.md" : null),
};
const render = (text) => md.render(text, { site }).trim();

test("wiki links render as links or marked missing text", () => {
  expect(render("[[Known]]")).toBe(
    `<p><a class="wikilink" href="${pageHref("posts/Known.md")}">Known</a></p>`,
  );
  expect(render("[[Known|the label]]")).toContain(">the label</a>");
  expect(render("[[Missing]]")).toContain(
    '<span class="wikilink missing" title="No page named Missing">Missing',
  );
  expect(render("| a |\n|---|\n| [[Known\\|cell]] |")).toContain(
    '<td><a class="wikilink"',
  );
});

test("code, escapes and malformed brackets stay literal", () => {
  for (const text of [
    "`[[Known]]`",
    "\\[[Known]]",
    "[[ -f x ]]",
    "[[]]",
    "[[|label]]",
    "[[Known",
  ]) {
    expect(render(text), text).not.toContain("wikilink");
  }
});

test("labels and targets are escaped", () => {
  const html = render('[[<script>|"><b>x</b>]]');
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("<b>");
});

const NOTES = {
  "Home.md": "[[Known]] and [[Old name]] and [[Secret]]\n",
  "posts/Known.md": "---\naliases:\n  - old-name\n---\n# Known\n",
  "Secret.md": "---\ndraft: true\n---\n[[Known]]\n",
};

test("links resolve by name and alias; drafts stay missing", async ({
  request,
}) => {
  const { url } = await serve(NOTES, "--no-home");
  const html = await (await request.get(`${url}${pageHref("Home.md")}`)).text();
  expect(
    html.match(/class="wikilink" href="\/content\/posts\/known"/gu),
  ).toHaveLength(2);
  expect(html).toContain("No page named Secret");
});

test("pages list the notes linking to them", async ({ request }) => {
  const { url } = await serve(NOTES, "--no-home");
  const known = await (
    await request.get(`${url}${pageHref("posts/Known.md")}`)
  ).text();
  expect(known).toContain("Linked from");
  expect(known).toContain(`<a href="${pageHref("Home.md")}">Home</a>`);
  expect(known).not.toContain(pageHref("Secret.md"));
  const home = await (await request.get(`${url}${pageHref("Home.md")}`)).text();
  expect(home).not.toContain("Linked from");
});

test("the editor preview resolves wiki links", async ({ request }) => {
  const { url } = await serve(NOTES, "--edit");
  const res = await request.post(`${url}/api/preview`, {
    headers: { "Content-Type": "text/markdown" },
    data: "[[Secret]] [[Known]]",
  });
  const html = await res.text();
  expect(html).toContain(`href="${pageHref("Secret.md")}"`);
  expect(html).toContain(`href="${pageHref("posts/Known.md")}"`);
});

test.describe("--check", () => {
  const check = (files, ...args) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "molesk-check-"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      writeFileSync(path.join(dir, rel), text);
    }
    return spawnSync("node", ["app.js", dir, "--check", ...args], {
      encoding: "utf8",
      timeout: 10_000,
    });
  };

  test("exits 0 with nothing on stdout when every link works", () => {
    const result = check({ "a.md": "[[b]] [b](b.md)\n", "b.md": "# B\n" });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("0 broken, 0 warnings in 2 notes");
  });

  test("lists broken links with their line and exits 1", () => {
    const result = check({ "a.md": "# A\n\n[[Gone]]\n\n[x](gone.md)\n" });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe(
      "a.md:3: broken link [[Gone]]\na.md:5: broken link (gone.md)\n",
    );
  });

  test("warns about ambiguous names without failing", () => {
    const result = check({ "a.md": "[[N]]\n", "x/N.md": "", "y/N.md": "" });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      "a.md:1: ambiguous link [[N]]: x/N.md, y/N.md\n",
    );
  });

  test("refuses edit mode with exit 2", () => {
    expect(check({ "a.md": "" }, "--edit").status).toBe(2);
  });
});
