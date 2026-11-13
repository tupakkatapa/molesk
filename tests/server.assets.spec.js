import { test, expect } from "@playwright/test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { useServers } from "./server.js";

const serve = useServers();
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);
const IMAGES = {
  "image/png": ["png", PNG],
  "image/jpeg": ["jpg", Buffer.from("ffd8ffe000104a464946", "hex")],
  "image/gif": ["gif", Buffer.from("GIF89a\u0001\u0000\u0001\u0000")],
  "image/webp": ["webp", Buffer.from("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ")],
};
const PAGE = "My (First) Post";
const FILES = { [`posts/${PAGE}.md`]: "# Post\n" };

const upload = (request, url, rel, type, data, headers = {}) =>
  request.put(`${url}/api/assets/${rel}`, {
    headers: { "Content-Type": type, "If-None-Match": "*", ...headers },
    data,
  });

test.describe("Uploads - API", () => {
  test("stores each image type under assets/", async ({ request }) => {
    const { url, dir } = await serve(FILES, "--edit");
    for (const [type, [ext, data]] of Object.entries(IMAGES)) {
      const res = await upload(
        request,
        url,
        `posts/assets/a.${ext}`,
        type,
        data,
      );
      expect(res.status(), type).toBe(201);
      expect(readFileSync(path.join(dir, `posts/assets/a.${ext}`))).toEqual(
        data,
      );
      const read = await request.get(`${url}/content/posts/assets/a.${ext}`);
      expect(read.status(), ext).toBe(200);
    }
  });

  test("refuses what isn't a matching image", async ({ request }) => {
    const { url, dir } = await serve(FILES, "--edit");
    const cases = [
      ["assets/a.png", "image/jpeg", PNG, 415],
      ["assets/a.png", "image/svg+xml", PNG, 415],
      ["assets/a.png", "text/plain", PNG, 415],
      ["assets/a.gif", "image/gif", PNG, 415],
      ["assets/a.md", "image/png", PNG, 415],
      ["a.png", "image/png", PNG, 400],
      ["assets/.a.png", "image/png", PNG, 400],
      ["assets%2F..%2F..%2Fassets%2Fa.png", "image/png", PNG, 403],
      ["assets/a.png", "image/png", Buffer.alloc(10 * 1024 * 1024 + 1), 413],
    ];
    for (const [rel, type, data, code] of cases) {
      const res = await upload(request, url, rel, type, data);
      expect(res.status(), `${rel} ${type}`).toBe(code);
    }
    expect(existsSync(path.join(dir, "assets"))).toBe(false);
    const bare = await request.put(`${url}/api/assets/assets/a.png`, {
      headers: { "Content-Type": "image/png" },
      data: PNG,
    });
    expect(bare.status()).toBe(428);
  });
});

test.describe("Uploads - Guards", () => {
  test("never overwrites", async ({ request }) => {
    const { url } = await serve(FILES, "--edit");
    const rel = "assets/a.png";
    expect((await upload(request, url, rel, "image/png", PNG)).status()).toBe(
      201,
    );
    expect((await upload(request, url, rel, "image/png", PNG)).status()).toBe(
      412,
    );
  });

  test("is not there in read-only mode", async ({ request }) => {
    const { url } = await serve(FILES);
    const res = await upload(request, url, "assets/a.png", "image/png", PNG);
    expect(res.status()).toBe(404);
  });
});

const paste = (page, kind) =>
  page.evaluate(
    ([hex, how]) => {
      const bytes = new Uint8Array(
        hex.match(/../gu).map((h) => parseInt(h, 16)),
      );
      const data = new DataTransfer();
      data.items.add(new File([bytes], "shot.png", { type: "image/png" }));
      const textarea = document.querySelector(".editor-text");
      const event =
        how === "paste"
          ? new ClipboardEvent("paste", { clipboardData: data, bubbles: true })
          : new DragEvent("drop", { dataTransfer: data, bubbles: true });
      textarea.dispatchEvent(event);
    },
    [PNG.toString("hex"), kind],
  );

test.describe("Uploads - Editor", () => {
  for (const kind of ["paste", "drop"]) {
    test(`a ${kind === "drop" ? "dropped" : "pasted"} image is stored and linked`, async ({
      page,
    }) => {
      const { url, dir } = await serve(FILES, "--edit");
      await page.goto(`${url}/edit/posts/${encodeURIComponent(PAGE)}.md`);
      const textarea = page.locator(".editor-text");
      await textarea.fill("# Post\n\nBefore after");
      await textarea.evaluate((t) => t.setSelectionRange(14, 14));
      await paste(page, kind);
      await expect(textarea).toHaveValue(
        /^# Post\n\nBefore!\[\]\(<assets\/My \(First\) Post-\d{8}-\d{6}\.png>\) after$/u,
      );
      const [file] = readdirSync(path.join(dir, "posts/assets"));
      expect(readFileSync(path.join(dir, "posts/assets", file))).toEqual(PNG);
      await page.getByRole("button", { name: "Preview", exact: true }).click();
      const img = page.locator(".editor-preview img");
      await expect(img).toHaveJSProperty("naturalWidth", 1);
      await expect(page.locator(".editor-status").first()).toHaveText("Saved");
      await page.goto(`${url}/content/posts/${encodeURIComponent(PAGE)}.md`);
      await expect(page.locator("#file-content img")).toHaveJSProperty(
        "naturalWidth",
        1,
      );
    });
  }

  test("a second paste in the same second gets its own name", async ({
    page,
  }) => {
    const { url, dir } = await serve(FILES, "--edit");
    await page.goto(`${url}/edit/posts/${encodeURIComponent(PAGE)}.md`);
    await page.locator(".editor-text").fill("");
    await page.clock.setFixedTime(new Date("2026-11-11T12:00:00"));
    await paste(page, "paste");
    await expect(page.locator(".editor-text")).toHaveValue(/png>\)$/u);
    await paste(page, "paste");
    await expect(page.locator(".editor-text")).toHaveValue(/-1\.png>\)$/u);
    expect(readdirSync(path.join(dir, "posts/assets"))).toHaveLength(2);
  });
});

test.describe("Preview - Images", () => {
  test("relative images show in the preview", async ({ page }) => {
    const { url } = await serve(
      { "posts/Note.md": "![dot](pic.png)\n", "posts/pic.png": PNG },
      "--edit",
    );
    await page.goto(`${url}/edit/posts/Note.md`);
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    const img = page.locator(".editor-preview img");
    await expect(img).toHaveJSProperty("naturalWidth", 1);
    await expect(img).toHaveCSS("opacity", "1");
  });
});

test.describe("Uploads - Moving the page", () => {
  test("its media follow it; shared ones are copied", async ({ request }) => {
    const { url, dir } = await serve(
      {
        "a/Page.md":
          '![](<assets/Page 1.png>)\n![](./assets/Shared.png "t")\n![](assets/Clip.mp4)\n',
        "a/Other.md": "![](assets/Shared.png)\n",
        "a/assets/Page 1.png": "one",
        "a/assets/Shared.png": "shared",
        "a/assets/Clip.mp4": "clip",
        "a/assets/Unrelated.png": "unrelated",
      },
      "--edit",
    );
    const res = await request.post(`${url}/api/move`, {
      data: { from: "a/Page.md", to: "b/Page.md" },
      headers: { "If-Match": "*" },
    });
    expect(res.status()).toBe(200);
    const at = (rel) => existsSync(path.join(dir, rel));
    expect(readFileSync(path.join(dir, "b/assets/Page 1.png"), "utf8")).toBe(
      "one",
    );
    expect(at("a/assets/Page 1.png")).toBe(false);
    expect(at("b/assets/Clip.mp4")).toBe(true);
    expect(at("a/assets/Clip.mp4")).toBe(false);
    expect(at("b/assets/Shared.png")).toBe(true);
    expect(at("a/assets/Shared.png")).toBe(true);
    expect(at("b/assets/Unrelated.png")).toBe(false);
    expect(at("a/assets/Unrelated.png")).toBe(true);
  });
});
