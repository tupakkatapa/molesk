import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { useServers } from "./server.js";
import { staticOptions } from "../lib/headers.js";
import { createHistory } from "../lib/history.js";
import pkg from "../package.json" with { type: "json" };

const serve = useServers();
const MP4 = Buffer.from(
  "\u0000\u0000\u0000\u0018ftypisom\u0000\u0000",
  "latin1",
);
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);
const upload = (request, url, rel, type, data) =>
  request.put(`${url}/api/assets/${rel}`, {
    headers: { "Content-Type": type, "If-None-Match": "*" },
    data,
  });

test.describe("Robustness - Links and paths", () => {
  test("a link that does not decode breaks nothing", async ({ request }) => {
    const files = { "Home.md": "# Home\n", "Bad.md": "# Bad\n\n[x](%ff.md)\n" };
    const { url } = await serve(files);
    for (const route of [
      "/content/Home.md",
      "/content/Bad.md",
      "/api/search?q=bad",
      "/rss.xml",
      "/tags/",
    ]) {
      expect((await request.get(`${url}${route}`)).status(), route).toBe(200);
    }
    const edit = await serve(files, "--edit");
    const editor = await request.get(`${edit.url}/edit/Bad.md`);
    expect(editor.status()).toBe(200);
  });

  test("a NUL in a path is not found", async ({ request }) => {
    const { url } = await serve({ "a.md": "# A\n" });
    for (const route of ["/content/a%00.md", "/download/a%00.md"]) {
      expect((await request.get(`${url}${route}`)).status(), route).toBe(404);
    }
  });

  test("an object as description is not shown", async ({ request }) => {
    const { url } = await serve({
      "a.md": "---\ndescription:\n  a: 1\n---\n# A\n",
    });
    for (const route of ["/content/a.md", "/rss.xml"]) {
      const text = await (await request.get(`${url}${route}`)).text();
      expect(text, route).not.toContain("[object Object]");
    }
  });

  test("a 404 logs one line without a stack", async ({ request }) => {
    const { url, child } = await serve({ "a.md": "# A\n" });
    let log = "";
    child.stderr.on("data", (chunk) => {
      log += chunk;
    });
    expect((await request.get(`${url}/content/nope.md`)).status()).toBe(404);
    await expect.poll(() => log).toContain("404");
    expect(log.trim().split("\n")).toHaveLength(1);
  });
});

test.describe("Robustness - Caching", () => {
  test("static ETags change with the version and install path", () => {
    const etag = (root, version) => {
      const headers = {};
      staticOptions(root, version).setHeaders(
        { setHeader: (name, value) => (headers[name] = value) },
        path.join(root, "main.js"),
        { size: 100 },
      );
      return headers.ETag;
    };
    const tags = [
      etag("/nix/store/a-molesk/public", "1.0.0"),
      etag("/nix/store/b-molesk/public", "1.0.0"),
      etag("/nix/store/a-molesk/public", "1.1.0"),
    ];
    expect(new Set(tags).size).toBe(3);
    expect(staticOptions("/x", "1").lastModified).toBe(false);
  });

  test("own files carry the build in the ETag and no date", async ({
    request,
  }) => {
    const { url } = await serve({ "a.md": "# A\n" });
    const res = await request.get(`${url}/main.js`);
    expect(res.headers().etag).toContain(pkg.version);
    expect(res.headers()["last-modified"]).toBeUndefined();
  });

  test("pages vary on X-Requested-With", async ({ request }) => {
    const { url } = await serve({ "a.md": "# A\n", "b/c.md": "# C\n" });
    for (const route of ["/content/a.md", "/content/b/"]) {
      const res = await request.get(`${url}${route}`);
      expect(res.headers().vary, route).toMatch(/X-Requested-With/iu);
    }
  });
});

test.describe("Robustness - Uploads", () => {
  test("one video upload at a time; images are not limited", async ({
    request,
  }) => {
    const { url } = await serve({ "a.md": "# A\n" }, "--edit");
    const held = http.request(`${url}/api/assets/assets/held.mp4`, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "If-None-Match": "*",
        "Content-Length": 1000,
      },
    });
    held.on("error", () => {});
    held.write(MP4);
    let n = 0;
    const second = () =>
      upload(request, url, `assets/v${n++}.mp4`, "video/mp4", MP4);
    await expect.poll(async () => (await second()).status()).toBe(503);
    expect((await second()).headers()["retry-after"]).toBeTruthy();
    const image = await upload(request, url, "assets/a.png", "image/png", PNG);
    expect(image.status()).toBe(201);
    held.destroy();
    await expect.poll(async () => (await second()).status()).toBe(201);
  });

  test("a stale temp file in assets is removed at start", async () => {
    const { dir } = await serve(
      { "a.md": "# A\n", "b/assets/.molesk-0a1b.tmp": "x" },
      "--edit",
    );
    const stale = path.join(dir, "b/assets/.molesk-0a1b.tmp");
    await expect.poll(() => existsSync(stale)).toBe(false);
  });
});

test.describe("Robustness - History", () => {
  test("a commit that takes 15 s still commits", async () => {
    test.setTimeout(60_000);
    const tmp = mkdtempSync(path.join(os.tmpdir(), "molesk-slow-"));
    const bin = path.join(tmp, "bin");
    const data = path.join(tmp, "data");
    mkdirSync(bin);
    mkdirSync(data);
    const real = execFileSync("sh", ["-c", "command -v git"]).toString().trim();
    const slow = path.join(tmp, "slow");
    writeFileSync(
      path.join(bin, "git"),
      `#!/bin/sh\ncase " $* " in *" commit "*) [ -e '${slow}' ] && sleep 15;; esac\nexec '${real}' "$@"\n`,
    );
    chmodSync(path.join(bin, "git"), 0o755);
    const { PATH } = process.env;
    process.env.PATH = `${bin}:${PATH}`;
    const history = createHistory(data);
    process.env.PATH = PATH;
    writeFileSync(path.join(data, "a.md"), "# A\n");
    await history.start();
    writeFileSync(path.join(data, "a.md"), "# A\n\nMore.\n");
    writeFileSync(slow, "");
    await history.flush();
    const log = execFileSync(real, ["log", "--oneline"], { cwd: data });
    rmSync(tmp, { recursive: true, force: true });
    expect(log.toString().trim().split("\n")).toHaveLength(2);
  });
});

test.describe("Robustness - Storage and search", () => {
  test("blocked storage breaks nothing", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("Blocked", "SecurityError");
        },
      });
    });
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));
    const { url } = await serve(
      { "a.md": "# A\n", "notes/b.md": "# B\n" },
      "--edit",
    );
    await page.goto(`${url}/content/a.md`);
    await expect(page.locator("html")).toHaveAttribute("data-theme", /./u);
    const theme = await page.locator("html").getAttribute("data-theme");
    await page.locator("#themeToggleIcon").click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", theme);
    const folder = page.locator('li.folder[data-path="notes"] > .tree-row');
    await folder.click();
    await expect(folder).toHaveAttribute("aria-expanded", "true");
    await page.goto(`${url}/edit/a.md`);
    const split = page.locator('.editor-mode [data-mode="split"]');
    await split.click();
    await expect(split).toHaveAttribute("aria-pressed", "true");
    expect(errors).toEqual([]);
  });

  test("a search answer that is not JSON ends the wait", async ({ page }) => {
    const { url } = await serve({ "a.md": "# A\n" });
    await page.route("**/api/search*", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<p>" }),
    );
    await page.goto(`${url}/content/a.md`);
    await page.locator(".sidebar .tree-filter").fill("zzzz");
    await expect(page.locator(".sidebar .tree-empty")).toBeVisible();
  });
});
