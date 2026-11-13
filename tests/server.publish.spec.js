import { test, expect } from "@playwright/test";
import { useServers } from "./server.js";
import { downloadHref, folderHref, pageHref } from "../public/slug.mjs";

const serve = useServers();
const text = async (request, url) => (await request.get(url)).text();
const status = async (request, url) =>
  (await request.get(url, { maxRedirects: 0 })).status();
const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
const dated = (date, body = "Text.\n") => `---\ndate: "${date}"\n---\n${body}`;
const DRAFT = "---\ndraft: true\n---\n# Secret draft\n\nhidden words\n";

const DRAFTS = {
  "Public.md": "# Public\n\nshared words\n",
  "Draft.md": DRAFT,
  "only-drafts/Hidden.md": DRAFT,
  "Quoted.md": '---\ndraft: "true"\n---\nQuoted is not a draft.\n',
};

test.describe("Link previews", () => {
  test("pages carry escaped Open Graph tags", async ({ request }) => {
    const { url } = await serve(
      {
        'Say "hi" <now>.md':
          '---\ndescription: "A <b>bold</b> & \\"quoted\\" claim"\n---\nBody.\n',
        "Plain.md": "# Plain\n\nFirst paragraph of the plain page.\n",
      },
      "--image",
      "package.json",
    );
    const address = pageHref('Say "hi" <now>.md');
    const page = await text(request, `${url}${address}`);
    expect(page).toContain(
      '<meta property="og:title" content="Say &#34;hi&#34; &lt;now&gt;">',
    );
    expect(page).toContain(
      '<meta name="description" content="A &lt;b&gt;bold&lt;/b&gt; &amp; &#34;quoted&#34; claim">',
    );
    expect(page).toContain('<meta property="og:type" content="article">');
    expect(page).toContain(
      `<meta property="og:url" content="${url}${address}">`,
    );
    expect(page).toContain(
      `<meta property="og:image" content="${url}/profile-pic">`,
    );
    expect(page).toContain('<meta name="twitter:card" content="summary">');
    const plain = await text(request, `${url}/content/Plain.md`);
    expect(plain).toContain(
      '<meta property="og:description" content="First paragraph of the plain page.">',
    );
    const root = await text(request, `${url}/`);
    expect(root).toContain('<meta property="og:type" content="website">');
  });
});

test.describe("Sitemap", () => {
  test("lists published pages and folders, read-only only", async ({
    request,
  }) => {
    const files = {
      "a.md": dated("2026-01-02"),
      "b.md": "B\n",
      "Draft.md": DRAFT,
      "posts/c.md": dated("someday"),
      "docs/index.md": "Docs\n",
      "docs/d.md": "D\n",
    };
    const { url } = await serve(files);
    const res = await request.get(`${url}/sitemap.xml`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("xml");
    const xml = await res.text();
    expect(xml).toContain(`<loc>${url}/</loc>`);
    expect(xml).toContain(
      `<url><loc>${url}${pageHref("a.md")}</loc><lastmod>2026-01-02</lastmod></url>`,
    );
    expect(xml).toContain(
      `<url><loc>${url}${pageHref("posts/c.md")}</loc></url>`,
    );
    expect(xml).toContain(`<loc>${url}${folderHref("posts")}</loc>`);
    expect(xml).not.toContain(`<loc>${url}${folderHref("docs")}</loc>`);
    expect(xml).not.toContain("Draft");
    const edit = await serve(files, "--edit");
    expect(await status(request, `${edit.url}/sitemap.xml`)).toBe(404);
  });
});

test.describe("Previous and next", () => {
  test("link neighbours in folder order", async ({ page }) => {
    const { url } = await serve(
      {
        "posts/Old.md": dated("2026-01-01"),
        "posts/Mid.md": dated("2026-02-01"),
        "posts/New.md": dated("2026-03-01"),
        "posts/Draft.md": `---\ndate: "2026-02-15"\ndraft: true\n---\n`,
        "notes/One.md": "One\n",
        "notes/Two.md": "Two\n",
        "solo/Only.md": "Only\n",
      },
      "--pager",
    );
    await page.goto(`${url}/content/posts/Mid.md`);
    const pager = page.locator(".pager");
    await expect(pager.locator("a")).toHaveCount(2);
    await expect(pager.locator("a").first()).toContainText("Previous");
    await expect(pager.locator("a").first()).toContainText("New");
    await expect(pager.locator("a").last()).toContainText("Next");
    await pager.locator("a").last().click();
    await expect(page).toHaveURL(`${url}${pageHref("posts/Old.md")}`);
    await expect(page.locator(".pager a")).toHaveCount(1);
    await expect(page.locator(".pager a")).toContainText("Mid");
    await page.goto(`${url}/content/notes/One.md`);
    await expect(page.locator(".pager a")).toContainText(["Next"]);
    await page.goto(`${url}/content/solo/Only.md`);
    await expect(page.locator(".pager")).toHaveCount(0);
  });
});

test.describe("Reading time", () => {
  test("joins the date caption, or stands alone on long pages", async ({
    request,
  }) => {
    const { url } = await serve({
      "Dated.md": dated(
        "2026-01-02",
        `${words(250)}\n\n\`\`\`\n${words(900)}\n\`\`\`\n`,
      ),
      "Long.md": `${words(401)}\n`,
      "Short.md": `${words(150)}\n`,
    });
    const caption = async (name) => {
      const page = await text(request, `${url}/content/${name}.md`);
      return /<div class="metadata">.*?<\/div>/su.exec(page)?.[0] ?? "";
    };
    expect(await caption("Dated")).toContain("2 min read");
    expect(await caption("Long")).toContain("3 min read");
    expect(await caption("Short")).toBe("");
  });
});

test.describe("Dates", () => {
  test("index pages show front-matter dates only", async ({ request }) => {
    const { url } = await serve({
      "posts/Undated b.md": "B\n",
      "posts/Undated a.md": "A\n",
      "posts/Dated.md": dated("2026-01-02"),
      "posts/Newer.md": dated("2026-03-02"),
    });
    const index = await text(request, `${url}/content/posts/`);
    const order = ["Newer", "Dated", "Undated a", "Undated b"].map((name) =>
      index.indexOf(`<span class="index-title">${name}<`),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    const list = index.slice(index.indexOf('class="folder-index"'));
    expect(list.match(/<time /gu)).toHaveLength(2);
    const tree = await text(request, `${url}/content/posts/Dated.md`);
    const treeOrder = ["Newer", "Dated", "Undated a", "Undated b"].map((name) =>
      tree.indexOf(`<span class="tree-name">${name}<`),
    );
    expect(treeOrder).toEqual([...treeOrder].sort((a, b) => a - b));
  });
});

test.describe("Drafts", () => {
  test("are hidden everywhere in read-only mode", async ({ request }) => {
    const { url } = await serve(DRAFTS);
    expect(await status(request, `${url}/content/Draft.md`)).toBe(404);
    expect(await status(request, `${url}/download/Draft.md`)).toBe(404);
    expect(await status(request, `${url}${pageHref("Draft.md")}`)).toBe(404);
    expect(await status(request, `${url}${downloadHref("Draft.md")}`)).toBe(
      404,
    );
    expect(await status(request, `${url}${pageHref("Quoted.md")}`)).toBe(200);
    const page = await text(request, `${url}/content/Public.md`);
    expect(page).not.toContain("Draft");
    expect(page).not.toContain("Only drafts");
    const root = await text(request, `${url}/`);
    expect(root).not.toContain("Draft");
    expect(await text(request, `${url}/rss.xml`)).not.toContain("Draft");
    const search = await request.get(`${url}/api/search?q=hidden`);
    expect(await search.json()).toEqual([]);
  });

  test("never become the home, folder index or first page", async ({
    request,
  }) => {
    const { url } = await serve({
      "index.md": DRAFT,
      "a.md": DRAFT,
      "b.md": "B\n",
      "docs/README.md": DRAFT,
      "docs/x.md": "X\n",
    });
    expect(await status(request, `${url}/`)).toBe(200);
    expect(await status(request, `${url}/content/docs/`)).toBe(200);
    const off = await serve({ "a.md": DRAFT, "b.md": "B\n" }, "--no-index");
    const res = await request.get(`${off.url}/`, { maxRedirects: 0 });
    expect(res.headers().location).toBe(pageHref("b.md"));
  });
});

test.describe("Drafts - Edit mode", () => {
  test("show with a badge in edit mode", async ({ request }) => {
    const { url } = await serve(DRAFTS, "--edit");
    const page = await text(request, `${url}/content/Draft.md`);
    expect(page).toMatch(
      /<span class="tree-name">Draft<\/span><span class="badge">Draft<\/span>/u,
    );
    expect(page).toMatch(/<div class="metadata">.*class="badge">Draft</su);
    const root = await text(request, `${url}/`);
    expect(root).toMatch(
      /index-title">Draft <span class="badge">Draft<\/span><\/span>/u,
    );
    expect(root).toContain("Only drafts");
  });
});

test.describe("Root heading", () => {
  test("is visually hidden on the root index only", async ({ request }) => {
    const { url } = await serve({ "posts/a.md": "A\n" }, "--title", "Site");
    const root = await text(request, `${url}/`);
    expect(root).toContain('<h1 class="visually-hidden">Site</h1>');
    const folder = await text(request, `${url}/content/posts/`);
    expect(folder).toContain("<h1>Posts</h1>");
  });
});
