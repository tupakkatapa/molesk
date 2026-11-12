import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { useServers } from "./server.js";
import { downloadHref, editHref, pageHref } from "../public/slug.mjs";

const serve = useServers();
const head = (request, url) => request.get(url, { maxRedirects: 0 });
const location = async (request, url) =>
  (await head(request, url)).headers().location;
const front = (aliases) =>
  `---\naliases:\n${aliases.map((alias) => `  - ${alias}`).join("\n")}\n---\n`;

test("hand-written aliases redirect pages and downloads", async ({
  request,
}) => {
  const { url } = await serve({
    "posts/New.md": `${front(["posts/old", "/content/posts/Older Name.md"])}# New\n`,
  });
  expect(await location(request, `${url}/content/posts/old`)).toBe(
    pageHref("posts/New.md"),
  );
  expect(await location(request, `${url}/content/posts/older-name`)).toBe(
    pageHref("posts/New.md"),
  );
  expect(await location(request, `${url}/download/posts/old`)).toBe(
    downloadHref("posts/New.md"),
  );
  expect((await head(request, `${url}/content/posts/missing`)).status()).toBe(
    404,
  );
});

test("a real page beats an alias; a shared alias goes to the first by path", async ({
  request,
}) => {
  const { url, child } = await serve({
    "a.md": `${front(["taken", "shared"])}# A\n`,
    "b.md": `${front(["shared", "https://elsewhere.example/x"])}# B\n`,
    "taken.md": "# Taken\n",
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => (stderr += chunk));
  expect((await head(request, `${url}/content/taken`)).status()).toBe(200);
  expect(await location(request, `${url}/content/shared`)).toBe(
    pageHref("a.md"),
  );
  await expect.poll(() => stderr).toContain('Alias "shared" in b.md');
  expect(stderr).toContain('Ignoring alias "https://elsewhere.example/x"');
});

test("a draft's alias stays hidden in read-only mode", async ({ request }) => {
  const { url } = await serve({
    "Draft.md": `---\ndraft: true\naliases:\n  - old\n---\n# Draft\n`,
  });
  expect((await head(request, `${url}/content/old`)).status()).toBe(404);
});

test.describe("renaming in the editor", () => {
  const rename = async (request, url, from, to) => {
    const { etag } = (await request.get(`${url}/api/files/${from}`)).headers();
    return request.post(`${url}/api/move`, {
      headers: { "If-Match": etag },
      data: { from, to },
    });
  };

  test("adds the old address without touching the rest", async ({
    request,
  }) => {
    const text = '---\ndate: "2024-01-01" # kept\ntags: [a]\n---\n\n# Body\n';
    const { url, dir } = await serve({ "Old Name.md": text }, "--edit");
    expect((await rename(request, url, "Old Name.md", "New.md")).status()).toBe(
      200,
    );
    expect(readFileSync(path.join(dir, "New.md"), "utf8")).toBe(
      '---\ndate: "2024-01-01" # kept\ntags: [a]\naliases:\n  - "old-name"\n---\n\n# Body\n',
    );
    expect(await location(request, `${url}/content/old-name`)).toBe(
      pageHref("New.md"),
    );
    expect(await location(request, `${url}/edit/old-name`)).toBe(
      editHref("New.md"),
    );
  });

  test("renaming back and forth leaves no loop", async ({ request }) => {
    const { url } = await serve({ "a.md": "# A\n" }, "--edit");
    await rename(request, url, "a.md", "b.md");
    await rename(request, url, "b.md", "a.md");
    expect((await head(request, `${url}/content/a`)).status()).toBe(200);
    expect(await location(request, `${url}/content/b`)).toBe(pageHref("a.md"));
  });

  test("front matter it can't extend is left as it is", async ({ request }) => {
    const text = "---\ndate: [unclosed\n---\n# Body\n";
    const { url, dir } = await serve({ "a.md": text }, "--edit");
    expect((await rename(request, url, "a.md", "b.md")).status()).toBe(200);
    expect(readFileSync(path.join(dir, "b.md"), "utf8")).toBe(text);
  });
});
