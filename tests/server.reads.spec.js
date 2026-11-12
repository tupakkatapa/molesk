import { test, expect } from "@playwright/test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import http from "node:http";
import path from "node:path";
import { useServers } from "./server.js";
import { downloadHref, pageHref } from "../public/slug.mjs";

const serve = useServers();
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);
const status = async (request, url) =>
  (await request.get(url, { maxRedirects: 0 })).status();

test.describe("Reads - Hidden Paths", () => {
  const FILES = {
    "Note.md": "# Note\n",
    ".secret.md": "# Secret\n",
    ".hidden/Inside.md": "# Inside\n",
    ".hidden.png": PNG,
    ".trash/Old.md": "# Old\n",
  };

  for (const args of [[], ["--edit"]]) {
    test(`dot-paths are 404 ${args.join(" ")}`, async ({ request }) => {
      const { url } = await serve(FILES, "--download", ...args);
      for (const rel of [".secret.md", ".hidden/Inside.md", ".hidden.png"]) {
        expect(await status(request, `${url}/content/${rel}`), rel).toBe(404);
        expect(await status(request, `${url}/download/${rel}`), rel).toBe(404);
      }
      expect(await status(request, `${url}${pageHref("Note.md")}`)).toBe(200);
      expect(await status(request, `${url}${downloadHref("Note.md")}`)).toBe(
        200,
      );
    });
  }

  test("the feed leaves out dot-folders and the trash", async ({ request }) => {
    const { url } = await serve(FILES);
    const feed = await (await request.get(`${url}/rss.xml`)).text();
    expect(feed).toContain(pageHref("Note.md"));
    expect(feed).not.toContain("Inside");
    expect(feed).not.toContain("Old");
    expect(feed).not.toContain("Secret");
  });
});

test.describe("Reads - Symlinks", () => {
  const link = (dir) => {
    mkdirSync(`${dir}-outside`);
    writeFileSync(`${dir}-outside/Out.md`, "# Out\n");
    symlinkSync(`${dir}-outside`, path.join(dir, "linked"));
  };

  test("read-only mode follows them", async ({ request }) => {
    const { url, dir } = await serve({ "Note.md": "# Note\n" });
    link(dir);
    expect(await status(request, `${url}${pageHref("linked/Out.md")}`)).toBe(
      200,
    );
  });

  test("edit mode keeps reads inside the notes", async ({ request }) => {
    const { url, dir } = await serve({ "Note.md": "# Note\n" }, "--edit");
    link(dir);
    expect(await status(request, `${url}/content/linked/Out.md`)).toBe(404);
    expect(await status(request, `${url}/download/linked/Out.md`)).toBe(404);
  });
});

test.describe("Reads - Single File", () => {
  test("serves only that note and images", async ({ request }) => {
    const { url } = await serve.file(
      { "Note.md": "# Note\n", "Other.md": "# Other\n", "pic.png": PNG },
      "Note.md",
    );
    expect(await status(request, `${url}${pageHref("Note.md")}`)).toBe(200);
    expect(await status(request, `${url}/content/pic.png`)).toBe(200);
    expect(await status(request, `${url}/content/Other.md`)).toBe(404);
    expect(await status(request, `${url}/download/Other.md`)).toBe(404);
  });
});

test.describe("Reads - RSS", () => {
  const FILES = {
    "Dated.md": '---\ndate: "2026-02-03"\ndescription: "A <b>"\n---\n# D\n',
    "Undated.md": "# U\n",
  };
  const feedFor = (url, host) =>
    new Promise((resolve, reject) => {
      http
        .get(`${url}/rss.xml`, { headers: { Host: host } }, (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => resolve(body));
        })
        .on("error", reject);
    });

  test("--no-rss removes the feed", async ({ request }) => {
    const { url } = await serve(FILES, "--no-rss");
    expect(await status(request, `${url}/rss.xml`)).toBe(404);
  });

  test("links follow the request's host", async () => {
    const { url } = await serve(FILES);
    const one = await feedFor(url, "one.test");
    const two = await feedFor(url, "two.test:8443");
    const dated = pageHref("Dated.md");
    expect(one).toContain(`<link>http://one.test${dated}</link>`);
    expect(two).toContain(`<link>http://two.test:8443${dated}</link>`);
    expect(one).not.toContain("two.test");
  });

  test("items are escaped and keep only real dates", async ({ request }) => {
    const image = path.join(
      mkdtempSync(path.join(os.tmpdir(), "molesk-")),
      "me.png",
    );
    writeFileSync(image, PNG);
    const { url } = await serve(FILES, "--image", image);
    const feed = await (await request.get(`${url}/rss.xml`)).text();
    expect(feed).toContain("A &lt;b&gt;");
    expect(feed).toContain("<pubDate>Tue, 03 Feb 2026 00:00:00 GMT</pubDate>");
    expect(feed.match(/<pubDate>/gu)).toHaveLength(1);
    expect(feed).not.toContain(image);
    expect(feed).toContain("/profile-pic</url>");
  });
});

test.describe("Reads - Unreadable Folders", () => {
  test("pages keep serving while a folder can't be read", async ({
    request,
  }) => {
    const { url, dir, child } = await serve({ "Note.md": "# Note\n" });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    const note = `${url}${pageHref("Note.md")}`;
    await request.get(note);
    const locked = path.join(dir, "locked");
    mkdirSync(locked, { mode: 0 });
    try {
      writeFileSync(path.join(dir, "Fresh.md"), "# Fresh\n");
      await expect
        .poll(async () => (await request.get(note)).text(), { timeout: 15_000 })
        .toContain(pageHref("Fresh.md"));
      expect((await request.get(note)).status()).toBe(200);
      expect(stderr).toContain(`Skipping unreadable ${locked}`);
      expect(child.exitCode).toBeNull();
    } finally {
      chmodSync(locked, 0o755);
    }
  });
});

test.describe("Reads - Rate Limits", () => {
  test("many requests from a mapped IPv4 client all pass", async ({
    request,
  }) => {
    const { url } = await serve({ "Note.md": "# Note\n" }, "--address", "::");
    const statuses = await Promise.all(
      Array.from({ length: 320 }, () =>
        status(request, `${url}${pageHref("Note.md")}`),
      ),
    );
    expect(statuses.filter((code) => code !== 200)).toEqual([]);
  });
});
