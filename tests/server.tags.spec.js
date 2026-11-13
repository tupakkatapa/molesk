import { test, expect } from "@playwright/test";
import { useServers } from "./server.js";
import { pageHref } from "../public/slug.mjs";

const serve = useServers();
const NOTES = {
  "a.md": '---\ndate: "2024-01-01"\ntags: [NixOS, notes]\n---\n# A\n',
  "b.md": '---\ndate: "2025-01-01"\ntags: nixos\n---\n# B\n',
  "c.md": "---\ntags: [C++, 2026, true, null]\n---\n# C\n",
  "d.md": "---\ndraft: true\ntags: [notes]\n---\n# D\n",
};

test("tags show as chips linking to their page", async ({ request }) => {
  const { url } = await serve(NOTES);
  const page = await (await request.get(`${url}${pageHref("a.md")}`)).text();
  expect(page).toContain('<a class="tag" href="/tags/nixos/">NixOS</a>');
  expect(page).toContain('<a class="tag" href="/tags/notes/">notes</a>');
  expect(page.indexOf('class="tag-list"')).toBeGreaterThan(
    page.indexOf("</h1>"),
  );
  const coerced = await (await request.get(`${url}${pageHref("c.md")}`)).text();
  expect(coerced).toContain('href="/tags/c/">C++</a>');
  expect(coerced).toContain('href="/tags/2026/">2026</a>');
  expect(coerced).not.toContain(">true<");
});

test("a tag page lists its notes newest first, drafts left out", async ({
  request,
}) => {
  const { url, child } = await serve(NOTES);
  let stderr = "";
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const page = await (await request.get(`${url}/tags/nixos/`)).text();
  expect(page).toContain("<h1>NixOS</h1>");
  const hrefs = [
    ...page.matchAll(/class="index-note"><a href="([^"]+)"/gu),
  ].map((match) => match[1]);
  expect(hrefs).toEqual([pageHref("b.md"), pageHref("a.md")]);
  expect(page).not.toContain("New page");
  const notes = await (await request.get(`${url}/tags/notes/`)).text();
  expect(notes).not.toContain(pageHref("d.md"));
  await expect
    .poll(() => stderr)
    .toContain('Tag "nixos" in b.md shares a page with "NixOS"');
});

test("/tags/ lists tags with counts", async ({ request }) => {
  const { url } = await serve(NOTES);
  const page = await (await request.get(`${url}/tags/`)).text();
  expect(page).toContain('href="/tags/nixos/"');
  expect(page).toContain("2 pages");
  expect((await request.get(`${url}/tags/missing/`)).status()).toBe(404);
});

test("without index pages, tags are plain text and their pages 404", async ({
  request,
}) => {
  const { url } = await serve(NOTES, "--no-index");
  const page = await (await request.get(`${url}${pageHref("a.md")}`)).text();
  expect(page).toContain('<span class="tag">NixOS</span>');
  expect((await request.get(`${url}/tags/nixos/`)).status()).toBe(404);
  expect((await request.get(`${url}/tags/`)).status()).toBe(404);
});

test("the 404 page's sidebar has the Tags entry", async ({ request }) => {
  const { url } = await serve(NOTES);
  const response = await request.get(`${url}/content/missing`);
  expect(response.status()).toBe(404);
  expect(await response.text()).toContain('<li class="tree-tags">');
});
