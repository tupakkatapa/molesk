import { test, expect } from "@playwright/test";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import files from "../lib/files.js";
import { useServers } from "./server.js";

const serve = useServers();
const markdown = { "Content-Type": "text/markdown" };
const put = (request, url, file, data, headers) =>
  request.put(`${url}/api/files/${encodeURIComponent(file)}`, {
    headers: { ...markdown, ...headers },
    data,
  });
const move = (request, url, from, to, headers = {}) =>
  request.post(`${url}/api/move`, { data: { from, to }, headers });
const trashed = (dir) =>
  readdirSync(path.join(dir, ".trash"), { recursive: true });

test.describe("Writes - Moves", () => {
  test("moving a note onto itself is a no-op", async ({ request }) => {
    const { url, dir } = await serve({ "A.md": "# A\n" }, "--edit");
    const res = await move(request, url, "A.md", "A.md", { "If-Match": "*" });
    expect(res.status()).toBe(200);
    const after = await put(request, url, "A.md", "# B\n", { "If-Match": "*" });
    expect(after.status()).toBe(200);
    expect(readFileSync(path.join(dir, "A.md"), "utf8")).toBe("# B\n");
  });

  test("a folder move during a save keeps the note whole", async ({
    request,
  }) => {
    const { url, dir } = await serve({ "f0/A.md": "# A\n" }, "--edit");
    const big = "x".repeat(900_000);
    for (let i = 0; i < 8; i++) {
      const [saved, moved] = await Promise.all([
        put(request, url, `f${i}/A.md`, big, { "If-Match": "*" }),
        move(request, url, `f${i}`, `f${i + 1}`),
      ]);
      expect([200, 412]).toContain(saved.status());
      expect(moved.status()).toBe(200);
      expect(readdirSync(dir).filter((name) => name.startsWith("f"))).toEqual([
        `f${i + 1}`,
      ]);
      expect(readdirSync(path.join(dir, `f${i + 1}`))).toEqual(["A.md"]);
    }
  });
});

test.describe("Writes - Overwrites", () => {
  test("If-Match * keeps the replaced text in the trash", async ({
    request,
  }) => {
    const { url, dir } = await serve({ "A.md": "theirs\n" }, "--edit");
    const res = await put(request, url, "A.md", "mine\n", { "If-Match": "*" });
    expect(res.status()).toBe(200);
    const [copy] = trashed(dir);
    expect(copy).toMatch(/^A\.md~/u);
    expect(readFileSync(path.join(dir, ".trash", copy), "utf8")).toBe(
      "theirs\n",
    );
    await put(request, url, "A.md", "mine\n", { "If-Match": "*" });
    expect(trashed(dir)).toHaveLength(1);
  });
});

test.describe("Writes - Long Names", () => {
  const long = `${"n".repeat(227)}.md`;

  test("an existing 230-byte note saves and trashes", async ({ request }) => {
    const { url, dir } = await serve({ [long]: "# Long\n" }, "--edit");
    const saved = await put(request, url, long, "# Saved\n", {
      "If-Match": "*",
    });
    expect(saved.status()).toBe(200);
    expect(readFileSync(path.join(dir, long), "utf8")).toBe("# Saved\n");
    const gone = await request.delete(
      `${url}/api/files/${encodeURIComponent(long)}`,
      { headers: { "If-Match": "*" } },
    );
    expect(gone.status()).toBe(204);
    expect(existsSync(path.join(dir, long))).toBe(false);
  });

  test("new names are capped at 200 bytes", async ({ request }) => {
    const { url } = await serve({ "A.md": "# A\n" }, "--edit");
    const created = await put(request, url, long, "# New\n", {
      "If-None-Match": "*",
    });
    expect(created.status()).toBe(400);
    const moved = await move(request, url, "A.md", long, { "If-Match": "*" });
    expect(moved.status()).toBe(400);
  });

  test("removing a folder clears stale temp files", async ({ request }) => {
    const { url, dir } = await serve(
      { "old/.molesk-1a2b3c.tmp": "partial" },
      "--edit",
    );
    const res = await request.delete(`${url}/api/dirs/old`);
    expect(res.status()).toBe(204);
    expect(existsSync(path.join(dir, "old"))).toBe(false);
  });
});

test.describe("Writes - Durability", () => {
  test("a failed folder fsync after the rename still succeeds", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "molesk-fsync-"));
    const file = path.join(dir, "A.md");
    writeFileSync(file, "old");
    const { open } = fsp;
    fsp.open = (target, flags) =>
      target === dir
        ? Promise.reject(Object.assign(new Error("EIO"), { code: "EIO" }))
        : open(target, flags);
    try {
      await files.writeAtomic(file, "new");
    } finally {
      fsp.open = open;
    }
    expect(readFileSync(file, "utf8")).toBe("new");
  });
});
