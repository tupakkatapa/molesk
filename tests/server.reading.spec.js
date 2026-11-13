import { test, expect } from "@playwright/test";
import { useServers } from "./server.js";

const serve = useServers();
const withToc = (files) => serve(files, "--toc");
const html = async (request, url) => (await request.get(url)).text();
const PROSE = "Text ".repeat(80);
const LONG = `# Guide\n\n${["Setup", "Usage", "Näkymä"]
  .map((name) => `## ${name}\n\n${PROSE}\n\n### Detail of ${name}\n\nMore.\n`)
  .join("\n")}`;
const GUIDE = { "Guide.md": LONG, "Other.md": "# Other\n" };

test.describe("Table of contents", () => {
  test("lists a long page's headings after its title", async ({ page }) => {
    const { url } = await withToc(GUIDE);
    await page.goto(`${url}/content/guide`);
    const toc = page.getByRole("navigation", { name: "On this page" });
    await expect(toc.getByRole("link")).toHaveCount(0);
    await toc.locator("summary").click();
    await expect(toc.getByRole("link")).toHaveText([
      "Setup",
      "Detail of Setup",
      "Usage",
      "Detail of Usage",
      "Näkymä",
      "Detail of Näkymä",
    ]);
    const order = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll("#file-content > *")];
      const at = (selector) =>
        nodes.findIndex((node) => node.matches(selector));
      return at("h1") < at(".toc") && at(".toc") < at("h2");
    });
    expect(order).toBe(true);
    await toc.getByRole("link", { name: "Näkymä", exact: true }).click();
    await expect(page).toHaveURL(/#n%C3%A4kym%C3%A4$/u);
  });

  test("is left out of short pages, opted-out pages and the feed", async ({
    request,
  }) => {
    const { url } = await withToc({
      "Short.md": "# Short\n\n## One\n\n## Two\n",
      "Brief.md": "# Brief\n\n## One\n\nA.\n\n## Two\n\nB.\n\n## Three\n",
      "Off.md": `---\ntoc: false\ndate: "2026-01-01"\n---\n\n${LONG}`,
      "Guide.md": `---\ndate: "2026-01-02"\n---\n\n${LONG}`,
    });
    expect(await html(request, `${url}/content/short`)).not.toContain(
      'class="toc"',
    );
    expect(await html(request, `${url}/content/brief`)).not.toContain(
      'class="toc"',
    );
    expect(await html(request, `${url}/content/off`)).not.toContain(
      'class="toc"',
    );
    expect(await html(request, `${url}/content/guide`)).toContain(
      'class="toc"',
    );
    expect(await html(request, `${url}/rss.xml`)).not.toContain("On this page");
  });
});

test("ToC items indent from the shallowest listed level", async ({
  request,
}) => {
  const deep = ["A", "B", "C"].map((h) => `### ${h}\n\n${PROSE}\n`).join("\n");
  const { url } = await serve(
    { "Deep.md": `# Deep\n\n${deep}`, "Guide.md": LONG },
    "--toc",
  );
  const page = await html(request, `${url}/content/deep`);
  expect(page).toContain('<li class="toc-1"><a href="#a">A</a></li>');
  expect(page).not.toContain("toc-2");
  expect(await html(request, `${url}/content/guide`)).toContain(
    '<li class="toc-2"><a href="#detail-of-setup">',
  );
});

const BOOK = {
  "book/zeta.md": "---\ntitle: Prologue\norder: 1\n---\n\nIt began.\n",
  "book/alpha.md": '---\ntitle: "Chapter 2: Night"\norder: 2\n---\n\nDark.\n',
  "book/dated.md": '---\ndate: "2026-05-01"\n---\n\nDated.\n',
  "book/plain.md": "Plain.\n",
};

test.describe("Front matter - title and order", () => {
  test("the title names the page everywhere", async ({ page, request }) => {
    const { url } = await serve(BOOK, "--pager");
    await page.goto(`${url}/content/book/zeta`);
    await expect(page).toHaveTitle(/^Prologue - /u);
    await expect(page.locator(".sidebar li.active")).toContainText("Prologue");
    await expect(page.locator(".pager-next .pager-title")).toHaveText(
      "Chapter 2: Night",
    );
    expect(await html(request, `${url}/content/book/`)).toContain(
      "Chapter 2: Night",
    );
    const found = await request.get(`${url}/api/search?q=prologue`);
    expect((await found.json()).map((hit) => hit.path)).toEqual([
      "book/zeta.md",
    ]);
  });

  test("ordered pages come first, lowest first", async ({ page }) => {
    const { url } = await serve(BOOK);
    await page.goto(`${url}/content/book/zeta`);
    await expect(page.locator(".sidebar li.note .tree-name")).toHaveText([
      "Prologue",
      "Chapter 2: Night",
      "Dated",
      "Plain",
    ]);
    await page.goto(`${url}/content/book/`);
    await expect(page.locator(".index-note .index-title")).toHaveText([
      "Prologue",
      "Chapter 2: Night",
      "Dated",
      "Plain",
    ]);
  });
});

test.describe("Front matter - image", () => {
  test("a page's own picture is its link preview", async ({ request }) => {
    const { url } = await serve(
      {
        "posts/Own.md": "---\nimage: assets/My Cover.png\n---\n\n# Own\n",
        "posts/Remote.md":
          "---\nimage: https://cdn.example/c.jpg\n---\n\n# Remote\n",
        "posts/Bad.md": "---\nimage: ../../etc/passwd\n---\n\n# Bad\n",
        "posts/None.md": "# None\n",
      },
      "--url",
      "https://site.example",
    );
    const own = await html(request, `${url}/content/posts/own`);
    expect(own).toContain(
      '<meta property="og:image" content="https://site.example/content/posts/assets/My%20Cover.png">',
    );
    expect(own).toContain('name="twitter:card" content="summary_large_image"');
    expect(await html(request, `${url}/content/posts/remote`)).toContain(
      'property="og:image" content="https://cdn.example/c.jpg"',
    );
    for (const name of ["bad", "none"]) {
      const page = await html(request, `${url}/content/posts/${name}`);
      expect(page, name).not.toContain("og:image");
      expect(page, name).toContain('name="twitter:card" content="summary"');
    }
  });
});

const TALL = `# Tall\n\n${"A paragraph of the story.\n\n".repeat(300)}`;

test.describe("Reading", () => {
  test("a page reopens where it was left", async ({ page }) => {
    const { url } = await serve({ "Tall.md": TALL, "Other.md": "# Other\n" });
    await page.goto(`${url}/content/tall`);
    await page.evaluate(() =>
      window.scrollTo({ top: 3000, behavior: "instant" }),
    );
    await page.waitForTimeout(600);
    await page.goto(`${url}/content/other`);
    await page.goto(`${url}/content/tall`);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(3000);
    await page.goto(`${url}/content/tall#tall`);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeLessThan(500);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(600);
    await page.goto(`${url}/content/tall`);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("prints the text alone", async ({ page }) => {
    const { url } = await serve(
      { "Guide.md": LONG, "Other.md": "# Other\n" },
      "--pager",
    );
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${url}/content/guide`);
    await page.emulateMedia({ media: "print" });
    for (const part of [".sidebar", ".topbar", ".note-actions", ".pager"]) {
      await expect(page.locator(part).first(), part).toBeHidden();
    }
    const box = await page.locator("#file-content").boundingBox();
    expect(box.x).toBeLessThan(5);
    expect(box.width).toBeGreaterThan(1200);
  });
});

test.describe("Reading - navigation", () => {
  test("an in-site link opens at the top; back reopens where left", async ({
    page,
  }) => {
    const { url } = await serve({ "Tall.md": TALL, "Other.md": "# Other\n" });
    const scrollY = () => page.evaluate(() => window.scrollY);
    const leaveAt3000 = async () => {
      await page.evaluate(() =>
        window.scrollTo({ top: 3000, behavior: "instant" }),
      );
      await page.waitForTimeout(600);
      await page.locator('.sidebar a[href="/content/other"]').click();
      await expect(page).toHaveURL(/\/content\/other$/u);
    };
    await page.goto(`${url}/content/tall`);
    await leaveAt3000();
    await page.locator('.sidebar a[href="/content/tall"]').click();
    await expect(page).toHaveURL(/\/content\/tall$/u);
    await page.waitForTimeout(300);
    expect(await scrollY()).toBe(0);
    await leaveAt3000();
    await page.goBack();
    await expect.poll(scrollY).toBe(3000);
  });
});
