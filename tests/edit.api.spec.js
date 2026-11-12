import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import http from "node:http";
import { pageHref } from "../public/slug.mjs";

const unique = () => `api-${randomUUID().slice(0, 8)}`;
const markdown = { "Content-Type": "text/markdown" };

const create = (request, file, data = "# Note\n") =>
  request.put(`/api/files/${file}`, {
    headers: { ...markdown, "If-None-Match": "*" },
    data,
  });

test.describe("Edit API - Writes", () => {
  test("creates a note and shows it in the sidebar", async ({ request }) => {
    const name = unique();
    const res = await create(request, `${name}.md`);
    expect(res.status()).toBe(201);
    expect(res.headers().etag).toMatch(/^"sha256-[0-9a-f]{64}"$/u);
    expect(res.headers()["cache-control"]).toBe("no-store");
    const page = await request.get(pageHref("Home.md"));
    expect(await page.text()).toContain(`href="${pageHref(`${name}.md`)}"`);
  });

  test("creates nested folders", async ({ request }) => {
    const name = unique();
    const res = await create(request, `${name}/deep/Idea.md`);
    expect(res.status()).toBe(201);
    const page = await request.get(pageHref(`${name}/deep/Idea.md`));
    expect(page.status()).toBe(200);
    expect(await page.text()).toContain(pageHref(`${name}/deep/Idea.md`));
  });
});

test.describe("Edit API - Updates", () => {
  test("updates with a matching etag", async ({ request }) => {
    const file = `${unique()}.md`;
    const { etag } = (await create(request, file)).headers();
    const res = await request.put(`/api/files/${file}`, {
      headers: { ...markdown, "If-Match": etag },
      data: "# Updated\n",
    });
    expect(res.status()).toBe(200);
    expect(res.headers().etag).not.toBe(etag);
    const page = await request.get(`/content/${file}`);
    expect(await page.text()).toContain("Updated");
  });

  test("rejects a stale etag", async ({ request }) => {
    const file = `${unique()}.md`;
    const { etag } = (await create(request, file)).headers();
    await request.put(`/api/files/${file}`, {
      headers: { ...markdown, "If-Match": etag },
      data: "# Elsewhere\n",
    });
    const res = await request.put(`/api/files/${file}`, {
      headers: { ...markdown, "If-Match": etag },
      data: "# Stale\n",
    });
    expect(res.status()).toBe(412);
    expect((await res.json()).error).toBeTruthy();
  });

  test("overwrites with If-Match: *", async ({ request }) => {
    const file = `${unique()}.md`;
    await create(request, file);
    const res = await request.put(`/api/files/${file}`, {
      headers: { ...markdown, "If-Match": "*" },
      data: "# Forced\n",
    });
    expect(res.status()).toBe(200);
  });
});

test.describe("Edit API - Preconditions and Bodies", () => {
  test("requires a precondition", async ({ request }) => {
    const res = await request.put(`/api/files/${unique()}.md`, {
      headers: markdown,
      data: "# x\n",
    });
    expect(res.status()).toBe(428);
  });

  test("refuses to create over an existing file", async ({ request }) => {
    const res = await create(request, "Home.md");
    expect(res.status()).toBe(412);
  });

  test("rejects non-markdown bodies", async ({ request }) => {
    const res = await request.put(`/api/files/${unique()}.md`, {
      headers: { "Content-Type": "text/plain", "If-None-Match": "*" },
      data: "# x\n",
    });
    expect(res.status()).toBe(415);
  });

  test("rejects bodies over 1 MB", async ({ request }) => {
    const res = await create(request, `${unique()}.md`, "x".repeat(1_100_000));
    expect(res.status()).toBe(413);
  });
});

test.describe("Edit API - Deletes", () => {
  test("deletes with a matching etag", async ({ request }) => {
    const file = `${unique()}.md`;
    const { etag } = (await create(request, file)).headers();
    const res = await request.delete(`/api/files/${file}`, {
      headers: { "If-Match": etag },
    });
    expect(res.status()).toBe(204);
    expect((await request.get(`/content/${file}`)).status()).toBe(404);
  });

  test("delete requires a precondition", async ({ request }) => {
    const file = `${unique()}.md`;
    await create(request, file);
    const res = await request.delete(`/api/files/${file}`);
    expect(res.status()).toBe(428);
  });

  test("delete rejects a stale etag", async ({ request }) => {
    const file = `${unique()}.md`;
    await create(request, file);
    const res = await request.delete(`/api/files/${file}`, {
      headers: { "If-Match": '"sha256-stale"' },
    });
    expect(res.status()).toBe(412);
  });
});

const rawPut = (rawPath) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: (Number(process.env.MOLESK_TEST_PORT) || 18080) + 1,
        method: "PUT",
        path: `/api/files/${rawPath}`,
        headers: {
          ...markdown,
          "If-None-Match": "*",
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on("error", reject);
    req.end("# x\n");
  });

test.describe("Edit API - Path Validation", () => {
  const rejected = [
    ["parent traversal", "../escape.md"],
    ["encoded traversal", "%2e%2e/escape.md"],
    ["nested traversal", "posts/../../escape.md"],
    ["encoded slash traversal", "x%2F..%2F..%2Fescape.md"],
    ["hidden segment", ".hidden/x.md"],
    ["hidden file", ".x.md"],
    ["non-markdown extension", "x.js"],
    ["no extension", "notes"],
    ["empty segment", "a//b.md"],
    ["control character", "a%01b.md"],
    ["long segment", `${"a".repeat(256)}.md`],
    ["symlinked directory", "escape/x.md"],
  ];
  for (const [label, file] of rejected) {
    test(`rejects ${label}`, async () => {
      const res = await rawPut(file);
      expect([400, 403]).toContain(res.status);
      expect(JSON.parse(res.body).error).toBeTruthy();
    });
  }

  test("path under an existing file conflicts", async ({ request }) => {
    expect((await request.get("/edit/Home.md/x.md")).status()).toBe(200);
    const res = await create(request, "Home.md/x.md");
    expect(res.status()).toBe(409);
  });

  test("editor refuses a symlinked directory", async ({ request }) => {
    const res = await request.get("/edit/escape/x.md");
    expect(res.status()).toBe(403);
  });

  test("rejects cross-site writes", async ({ request }) => {
    const res = await request.put(`/api/files/${unique()}.md`, {
      headers: {
        ...markdown,
        "If-None-Match": "*",
        "Sec-Fetch-Site": "cross-site",
      },
      data: "# x\n",
    });
    expect(res.status()).toBe(403);
  });
});
