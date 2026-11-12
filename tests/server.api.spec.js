import { test, expect } from "@playwright/test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { useServers } from "./server.js";

const serve = useServers();
const markdown = { "Content-Type": "text/markdown" };

const NOTES = {
  "a.md": "# A\n",
  "posts/b.md": "# B\n",
  "posts/deep/c.md": "# C\n",
  "empty/": "",
};

const notes = () => serve(NOTES, "--edit");

const rewrite = (request, url, file, text) =>
  request.put(`${url}/api/files/${file}`, {
    headers: { ...markdown, "If-Match": "*" },
    data: text,
  });

const move = (request, url, from, to, headers = {}) =>
  request.post(`${url}/api/move`, { headers, data: { from, to } });

test.describe("Move - Notes", () => {
  test("renames a note and returns the etag of its new text", async ({
    request,
  }) => {
    const { url, dir } = await notes();
    const { etag } = (await rewrite(request, url, "a.md", "# A\n")).headers();
    const res = await move(request, url, "a.md", "Renamed.md", {
      "If-Match": etag,
    });
    expect(res.status()).toBe(200);
    const front = '---\naliases:\n  - "a"\n---\n\n';
    expect(await res.json()).toEqual({ path: "Renamed.md", front });
    const saved = await request.get(`${url}/api/files/Renamed.md`);
    expect(await saved.text()).toBe(`${front}# A\n`);
    expect(res.headers().etag).toBe(saved.headers().etag);
    expect(existsSync(path.join(dir, "a.md"))).toBe(false);
    expect(existsSync(path.join(dir, "Renamed.md"))).toBe(true);
  });

  test("creates the target folder", async ({ request }) => {
    const { url, dir } = await notes();
    const res = await move(request, url, "a.md", "new/place/a.md", {
      "If-Match": "*",
    });
    expect(res.status()).toBe(200);
    expect(existsSync(path.join(dir, "new/place/a.md"))).toBe(true);
  });

  test("requires If-Match", async ({ request }) => {
    const { url } = await notes();
    expect((await move(request, url, "a.md", "x.md")).status()).toBe(428);
  });

  test("refuses a stale etag", async ({ request }) => {
    const { url } = await notes();
    const res = await move(request, url, "a.md", "x.md", {
      "If-Match": '"sha256-stale"',
    });
    expect(res.status()).toBe(412);
  });
});

test.describe("Move - Note Conflicts", () => {
  test("refuses an existing target", async ({ request }) => {
    const { url, dir } = await notes();
    const res = await move(request, url, "a.md", "posts/b.md", {
      "If-Match": "*",
    });
    expect(res.status()).toBe(409);
    expect(readFileSync(path.join(dir, "posts/b.md"), "utf8")).toBe("# B\n");
  });

  test("404s a missing source", async ({ request }) => {
    const { url } = await notes();
    const res = await move(request, url, "nope.md", "x.md", {
      "If-Match": "*",
    });
    expect(res.status()).toBe(404);
  });
});

test.describe("Move - Folders and Validation", () => {
  test("moves a folder with its notes", async ({ request }) => {
    const { url, dir } = await notes();
    const res = await move(request, url, "posts", "archive/posts");
    expect(res.status()).toBe(200);
    expect(existsSync(path.join(dir, "archive/posts/deep/c.md"))).toBe(true);
    expect(existsSync(path.join(dir, "posts"))).toBe(false);
  });

  test("refuses a folder into itself", async ({ request }) => {
    const { url } = await notes();
    const res = await move(request, url, "posts", "posts/deep/posts");
    expect([400, 409]).toContain(res.status());
  });

  for (const [label, from, to] of [
    ["traversal", "../a.md", "x.md"],
    ["a hidden target", "a.md", ".trash/a.md"],
    ["a note to a non-note", "a.md", "a.js"],
    ["a missing field", "a.md", undefined],
  ]) {
    test(`refuses ${label}`, async ({ request }) => {
      const { url } = await notes();
      const res = await move(request, url, from, to, { "If-Match": "*" });
      expect([400, 403]).toContain(res.status());
    });
  }

  test("takes both locks in one order", async ({ request }) => {
    const { url } = await notes();
    const statuses = await Promise.all([
      move(request, url, "a.md", "z.md", { "If-Match": "*" }),
      move(request, url, "z.md", "a.md", { "If-Match": "*" }),
    ]).then((all) => all.map((res) => res.status()));
    for (const status of statuses) expect([200, 404]).toContain(status);
  });
});

test.describe("Folders API", () => {
  test("creates a folder, idempotently", async ({ request }) => {
    const { url, dir } = await notes();
    const first = await request.put(`${url}/api/dirs/new/sub`);
    expect(first.status()).toBe(201);
    expect(existsSync(path.join(dir, "new/sub"))).toBe(true);
    expect((await request.put(`${url}/api/dirs/new/sub`)).status()).toBe(200);
  });

  test("refuses a folder over a file", async ({ request }) => {
    const { url } = await notes();
    expect((await request.put(`${url}/api/dirs/a.md`)).status()).toBe(409);
  });

  test("refuses hidden and escaping folders", async ({ request }) => {
    const { url } = await notes();
    expect((await request.put(`${url}/api/dirs/.hidden`)).status()).toBe(400);
    expect(
      (await request.put(`${url}/api/dirs/escape%2F..%2F..%2Fx`)).status(),
    ).toBe(403);
  });

  test("deletes only empty folders", async ({ request }) => {
    const { url, dir } = await notes();
    expect((await request.delete(`${url}/api/dirs/posts`)).status()).toBe(409);
    expect((await request.delete(`${url}/api/dirs/empty`)).status()).toBe(204);
    expect(existsSync(path.join(dir, "empty"))).toBe(false);
    expect((await request.delete(`${url}/api/dirs/empty`)).status()).toBe(404);
  });

  test("shows empty folders in the edit-mode tree", async ({ request }) => {
    const { url } = await notes();
    const page = await (await request.get(`${url}/content/a.md`)).text();
    expect(page).toContain("Empty");
  });
});

const trashed = (dir) =>
  readdirSync(path.join(dir, ".trash"), { recursive: true }).map(String);

test.describe("Delete to Trash", () => {
  test("moves the note to .trash with a timestamp", async ({ request }) => {
    const { url, dir } = await notes();
    const res = await request.delete(`${url}/api/files/posts/b.md`, {
      headers: { "If-Match": "*" },
    });
    expect(res.status()).toBe(204);
    expect(existsSync(path.join(dir, "posts/b.md"))).toBe(false);
    const [entry] = trashed(dir).filter((name) => name.includes("b.md~"));
    expect(entry).toMatch(/^posts\/b\.md~\d{4}-\d\d-\d\dT[\d.-]+Z$/u);
    expect(readFileSync(path.join(dir, ".trash", entry), "utf8")).toBe("# B\n");
  });

  test("never overwrites an earlier trashed copy", async ({ request }) => {
    const { url, dir } = await notes();
    const remove = () =>
      request.delete(`${url}/api/files/a.md`, {
        headers: { "If-Match": "*" },
      });
    expect((await remove()).status()).toBe(204);
    await request.put(`${url}/api/files/a.md`, {
      headers: { ...markdown, "If-None-Match": "*" },
      data: "# Again\n",
    });
    expect((await remove()).status()).toBe(204);
    expect(
      trashed(dir).filter((name) => name.startsWith("a.md~")),
    ).toHaveLength(2);
  });

  test(".trash can't be read, listed or written", async ({ request }) => {
    const { url, dir } = await notes();
    await request.delete(`${url}/api/files/a.md`, {
      headers: { "If-Match": "*" },
    });
    const [entry] = trashed(dir);
    for (const target of [`.trash/${entry}`, ".trash/"]) {
      const res = await request.get(`${url}/content/${target}`);
      expect(res.status(), target).toBe(404);
    }
    expect(
      (await request.get(`${url}/download/.trash/${entry}`)).status(),
    ).not.toBe(200);
    const page = await (await request.get(`${url}/content/posts/b.md`)).text();
    expect(page).not.toContain(".trash");
  });
});

test.describe("Preview", () => {
  test("renders like the page renderer", async ({ request }) => {
    const { url } = await notes();
    const res = await request.post(`${url}/api/preview`, {
      headers: markdown,
      data: '---\ndate: "2026-11-09"\n---\n# Hi\n\n**bold** <b>raw</b>\n',
    });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("&lt;b&gt;raw&lt;/b&gt;");
    expect(html).toContain('class="meta-date"');
    expect(res.headers()["cache-control"]).toBe("no-store");
  });

  test("refuses cross-site requests", async ({ request }) => {
    const { url } = await notes();
    const res = await request.post(`${url}/api/preview`, {
      headers: { ...markdown, "Sec-Fetch-Site": "cross-site" },
      data: "# x",
    });
    expect(res.status()).toBe(403);
  });

  test("doesn't exist without --edit", async ({ request }) => {
    const { url } = await serve(NOTES);
    const res = await request.post(`${url}/api/preview`, {
      headers: markdown,
      data: "# x",
    });
    expect(res.status()).toBe(404);
  });
});
