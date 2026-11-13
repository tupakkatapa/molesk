import { test, expect } from "@playwright/test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { useServers } from "./server.js";

const serve = useServers();
const PNG = Buffer.from("89504e470d0a1a0a", "hex");
const PAGE = "My (First) Post";
const FILES = { [`posts/${PAGE}.md`]: "# Post\n" };

const upload = (request, url, rel, type, data) =>
  request.put(`${url}/api/assets/${rel}`, {
    headers: { "Content-Type": type, "If-None-Match": "*" },
    data,
  });

const paste = (page, bytes, type) =>
  page.evaluate(
    ([hex, mime]) => {
      const data = new DataTransfer();
      const raw = new Uint8Array(hex.match(/../gu).map((h) => parseInt(h, 16)));
      data.items.add(new File([raw], "clip", { type: mime }));
      document
        .querySelector(".editor-text")
        .dispatchEvent(
          new ClipboardEvent("paste", { clipboardData: data, bubbles: true }),
        );
    },
    [bytes.toString("hex"), type],
  );

const MP4 = Buffer.from(
  "000000186674797069736f6d0000020069736f6d69736f32",
  "hex",
);
const VIDEOS = {
  "video/mp4": ["mp4", MP4],
  "video/quicktime": [
    "mov",
    Buffer.from("00000014667479707174202000000000717420", "hex"),
  ],
  "video/webm": ["webm", Buffer.from("1a45dfa39f4286810142f7810142", "hex")],
};

test.describe("Videos - Rendering", () => {
  test("embeds a video link as a player", async ({ request }) => {
    const { url } = await serve(FILES, "--edit");
    const res = await request.post(`${url}/api/preview`, {
      headers: { "Content-Type": "text/markdown" },
      data: '![Two-hand cut](<assets/cut 1.mp4> "Slow")\n\n![](a.png)\n',
    });
    const html = await res.text();
    expect(html).toContain(
      '<video controls playsinline preload="metadata" src="assets/cut%201.mp4" aria-label="Two-hand cut" title="Slow"></video>',
    );
    expect(html).toContain('<img src="a.png" alt="">');
    expect(html).not.toContain("<p><video");
    const odd = await request.post(`${url}/api/preview`, {
      headers: { "Content-Type": "text/markdown" },
      data: '![a "b"](x.MOV#t=2 "c\'d") ![](y.webm?v=1)\n',
    });
    const oddHtml = await odd.text();
    expect(oddHtml).toContain(
      'src="x.MOV#t=2" aria-label="a &quot;b&quot;" title="c&#039;d"',
    );
    expect(oddHtml).toContain('src="y.webm?v=1"></video>');
  });
});

test.describe("Videos - Serving", () => {
  test("serves a video in ranges", async ({ request }) => {
    const { url } = await serve({ ...FILES, "posts/assets/cut.mp4": MP4 });
    const read = await request.get(`${url}/content/posts/assets/cut.mp4`, {
      headers: { Range: "bytes=4-7" },
    });
    expect(read.status()).toBe(206);
    expect(read.headers()["content-type"]).toBe("video/mp4");
    expect(await read.body()).toEqual(Buffer.from("ftyp"));
  });

  test("serves each video type", async ({ request }) => {
    const files = Object.fromEntries(
      Object.values(VIDEOS).map(([ext, data]) => [`assets/a.${ext}`, data]),
    );
    const { url } = await serve({ ...FILES, ...files });
    for (const [type, [ext]] of Object.entries(VIDEOS)) {
      const read = await request.get(`${url}/content/assets/a.${ext}`);
      expect(read.status(), ext).toBe(200);
      expect(read.headers()["content-type"], ext).toBe(type);
    }
  });
  test("a single note serves the videos beside it", async ({ request }) => {
    const { url } = await serve.file(
      { "Note.md": "![](cut.mp4)\n", "cut.mp4": MP4, "Other.md": "x\n" },
      "Note.md",
    );
    const read = await request.get(`${url}/content/cut.mp4`);
    expect(read.status()).toBe(200);
    expect(read.headers()["content-type"]).toBe("video/mp4");
    expect((await request.get(`${url}/content/Other.md`)).status()).toBe(404);
  });
});

test.describe("Videos - Uploads", () => {
  test("stores each video type under assets/", async ({ request }) => {
    const { url, dir } = await serve(FILES, "--edit");
    for (const [type, [ext, data]] of Object.entries(VIDEOS)) {
      const res = await upload(request, url, `assets/a.${ext}`, type, data);
      expect(res.status(), ext).toBe(201);
      expect(readFileSync(path.join(dir, `assets/a.${ext}`))).toEqual(data);
    }
    const cases = [
      ["assets/b.mp4", "video/mp4", PNG, 415],
      ["assets/b.webm", "video/mp4", MP4, 415],
      ["assets/b.mov", "video/quicktime", MP4, 415],
      ["b.mp4", "video/mp4", MP4, 400],
      ["assets/b.mp4", "video/mp4", Buffer.alloc(0), 415],
      ["assets/b.mp4", "video/mp4", Buffer.alloc(100 * 1024 * 1024 + 1), 413],
    ];
    for (const [rel, type, data, code] of cases) {
      const res = await upload(request, url, rel, type, data);
      expect(res.status(), `${rel} ${type}`).toBe(code);
    }
    expect(existsSync(path.join(dir, "assets/b.mp4"))).toBe(false);
  });
});

// A PUT with no body and no Content-Length, as curl sends it.
const bareUpload = (url, rel, type) =>
  new Promise((resolve, reject) => {
    const { hostname, port } = new URL(url);
    const socket = net.connect(Number(port), hostname, () => {
      socket.write(
        `PUT /api/assets/${rel} HTTP/1.1\r\nHost: ${hostname}:${port}\r\n` +
          `Content-Type: ${type}\r\nIf-None-Match: *\r\nConnection: close\r\n\r\n`,
      );
    });
    let head = "";
    socket.on("data", (chunk) => (head += chunk));
    socket.on("end", () => resolve(Number(head.split(" ")[1])));
    socket.on("error", reject);
  });

test.describe("Videos - Empty Uploads", () => {
  test("an upload without a body is refused", async () => {
    const { url } = await serve(FILES, "--edit");
    expect(await bareUpload(url, "assets/e.mp4", "video/mp4")).toBe(415);
    expect(await bareUpload(url, "assets/e.png", "image/png")).toBe(415);
  });
});

test.describe("Videos - Editor", () => {
  test("a pasted video is stored, linked and previewed", async ({ page }) => {
    const { url, dir } = await serve(FILES, "--edit");
    await page.goto(`${url}/edit/posts/${encodeURIComponent(PAGE)}.md`);
    const textarea = page.locator(".editor-text");
    await textarea.fill("");
    await paste(page, MP4, "video/mp4");
    await expect(textarea).toHaveValue(
      /^!\[\]\(<assets\/My \(First\) Post-\d{8}-\d{6}\.mp4>\)$/u,
    );
    const [file] = readdirSync(path.join(dir, "posts/assets"));
    expect(readFileSync(path.join(dir, "posts/assets", file))).toEqual(MP4);
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.locator(".editor-preview video")).toHaveJSProperty(
      "src",
      `${url}/content/posts/assets/${encodeURIComponent(file)}`,
    );
  });
});
