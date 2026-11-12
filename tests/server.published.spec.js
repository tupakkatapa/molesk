import { test, expect } from "@playwright/test";
import { useServers } from "./server.js";
import { downloadHref, pageHref } from "../public/slug.mjs";

const serve = useServers();
const PNG = Buffer.from("89504e470d0a1a0a", "hex");
const get = (request, url) => request.get(url, { maxRedirects: 0 });

test("--url is the origin of feed, sitemap and link previews", async ({
  request,
}) => {
  const { url } = await serve(
    { "Note.md": "# Note\n" },
    "--url",
    "https://blog.example/",
  );
  const feed = await (await get(request, `${url}/rss.xml`)).text();
  expect(feed).toContain(
    `<link>https://blog.example${pageHref("Note.md")}</link>`,
  );
  const sitemap = await (await get(request, `${url}/sitemap.xml`)).text();
  expect(sitemap).toContain(
    `<loc>https://blog.example${pageHref("Note.md")}</loc>`,
  );
  const page = await (
    await get(request, `${url}${pageHref("Note.md")}`)
  ).text();
  expect(page).toContain(
    `<meta property="og:url" content="https://blog.example${pageHref("Note.md")}">`,
  );
  expect(page).toContain('<link rel="alternate" type="application/rss+xml"');
});

test("the feed lists dated notes newest first", async ({ request }) => {
  const { url } = await serve({
    "a.md": '---\ndate: "2024-01-01"\n---\n',
    "b.md": '---\ndate: "2025-01-01"\n---\n',
    "c.md": '---\ndate: "2023-01-01"\n---\n',
  });
  const feed = await (await get(request, `${url}/rss.xml`)).text();
  const order = [...feed.matchAll(/<link>[^<]*\/content\/(\w)<\/link>/gu)].map(
    (match) => match[1],
  );
  expect(order).toEqual(["b", "a", "c"]);
});

test("--no-download turns the download route off", async ({ request }) => {
  const { url } = await serve({ "Note.md": "# Note\n" }, "--no-download");
  expect(
    (await get(request, `${url}${downloadHref("Note.md")}`)).status(),
  ).toBe(404);
});

test("a single file has no feed or sitemap", async ({ request }) => {
  const { url } = await serve.file({ "Note.md": "# Note\n" }, "Note.md");
  expect((await get(request, `${url}/rss.xml`)).status()).toBe(404);
  expect((await get(request, `${url}/sitemap.xml`)).status()).toBe(404);
});

test("a page that starts with a --- rule keeps its text", async ({
  request,
}) => {
  const { url } = await serve({
    "Rule.md": "---\n\nIntro paragraph\n\n---\n\nAfter\n",
  });
  const page = await (
    await get(request, `${url}${pageHref("Rule.md")}`)
  ).text();
  expect(page).toContain("Intro paragraph");
});

test("AVIF images are served and the CSP blocks plugins and base hijacks", async ({
  request,
}) => {
  const { url } = await serve({ "Note.md": "# Note\n", "pic.avif": PNG });
  const image = await get(request, `${url}/content/pic.avif`);
  expect(image.status()).toBe(200);
  const csp = image.headers()["content-security-policy"];
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("form-action 'self'");
});
