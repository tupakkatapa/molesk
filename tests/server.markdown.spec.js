import { test, expect } from "@playwright/test";
import { useServers } from "./server.js";

const serve = useServers();
const markdown = { "Content-Type": "text/markdown" };

const preview = async (request, url, data) => {
  const res = await request.post(`${url}/api/preview`, {
    headers: markdown,
    data,
  });
  expect(res.status()).toBe(200);
  return res.text();
};

test.describe("Markdown - Lists", () => {
  test("a tight list after a loose one renders tight", async ({ request }) => {
    const { url } = await serve({}, "--edit");
    await preview(request, url, "- a\n\n- b\n");
    const tight = await preview(request, url, "- c\n- d\n");
    expect(tight).not.toContain("<p>");
    expect(tight).not.toContain("lvl-");
  });
});

test.describe("Markdown - Code", () => {
  test("fences without a language are not guessed", async ({ request }) => {
    const { url } = await serve({}, "--edit");
    const html = await preview(
      request,
      url,
      "```\nplain fence without a language\n```\n",
    );
    expect(html).toContain("plain fence without a language");
    expect(html).not.toContain("hljs-");
  });
});

test.describe("Markdown - Mermaid", () => {
  const DIAGRAM = "```mermaid\ngraph TD\n  A-->B\n```\n";
  const BROKEN = "```mermaid\nnot a diagram ((\n```\n";

  test("fences are sent as escaped diagram sources", async ({ request }) => {
    const { url } = await serve({}, "--edit");
    const html = await preview(request, url, DIAGRAM);
    expect(html).toContain('<pre class="mermaid">graph TD\n  A--&gt;B\n</pre>');
    expect(html).not.toContain("hljs");
  });

  test("diagrams are drawn and redrawn on a theme switch", async ({ page }) => {
    const { url } = await serve({ "Diagram.md": DIAGRAM + "\n" + BROKEN });
    await page.goto(`${url}/content/Diagram.md`);
    const [diagram, broken] = [0, 1].map((i) =>
      page.locator("pre.mermaid").nth(i),
    );
    await expect(diagram.locator("svg")).toBeVisible();
    await expect(broken).toContainText("not a diagram");
    await page.keyboard.press("t");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(diagram.locator("svg")).toBeVisible();
    await expect(diagram).not.toContainText("graph TD");
  });
});

test.describe("Markdown - Collapsibles", () => {
  const blocks = (bytes) => "+++ t\n".repeat(Math.floor(bytes / 6));
  const timed = async (request, url, data) => {
    const startedAt = Date.now();
    await preview(request, url, data);
    return Date.now() - startedAt;
  };

  test("+++ renders as details", async ({ request }) => {
    const { url } = await serve({}, "--edit");
    const html = await preview(request, url, "+++ More\nhidden\n+++\n");
    expect(html).toContain("<details>");
    expect(html).toContain("hidden");
  });

  test("a 1 MB preview stays fast and linear", async ({ request }) => {
    test.setTimeout(30_000);
    const { url } = await serve({}, "--edit");
    const half = await timed(request, url, blocks(480_000));
    const full = await timed(request, url, blocks(960_000));
    expect(full).toBeLessThan(5000);
    expect(full).toBeLessThan(4 * Math.max(half, 50));
  });
});

const BAD = "---\ntitle: [unclosed\n---\n# Bad\n\nbody\n";
const DATED = (day) => `---\ndate: 2026-01-0${day}\n---\n# Day ${day}\n`;
const FILES = {
  "Bad.md": BAD,
  "posts/One.md": DATED(1),
  "posts/Two.md": DATED(2),
  "posts/Crlf.md": '---\r\ndate: "2026-03-04"\r\n---\r\n# Crlf\r\n',
};

test.describe("Markdown - Front Matter", () => {
  for (const args of [[], ["--edit"]]) {
    test(`bad or unquoted YAML keeps every page up ${args.join(" ")}`, async ({
      request,
    }) => {
      const { url } = await serve(FILES, ...args);
      for (const page of [
        "/",
        "/content/Bad.md",
        "/content/posts/",
        "/content/posts/One.md",
      ]) {
        const res = await request.get(`${url}${page}`);
        expect(res.status(), page).toBe(200);
      }
    });
  }

  test("an unquoted date shows as the day", async ({ request }) => {
    const { url } = await serve(FILES);
    const html = await (
      await request.get(`${url}/content/posts/One.md`)
    ).text();
    expect(html).toContain(
      '<time class="meta-date" datetime="2026-01-01">1 Jan 2026</time>',
    );
    const index = await (await request.get(`${url}/content/posts/`)).text();
    expect(index).toContain('datetime="2026-01-02"');
  });

  test("CRLF front matter is read and hidden", async ({ request }) => {
    const { url } = await serve(FILES);
    const html = await (
      await request.get(`${url}/content/posts/Crlf.md`)
    ).text();
    expect(html).toContain(
      '<time class="meta-date" datetime="2026-03-04">4 Mar 2026</time>',
    );
    expect(html).not.toContain("date:");
  });
});

test.describe("Markdown - Front Matter in the Editor", () => {
  test("the editor opens a note with bad YAML", async ({ request }) => {
    const { url } = await serve(FILES, "--edit");
    const res = await request.get(`${url}/edit/Bad.md`);
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain("title: [unclosed");
    expect(await preview(request, url, BAD)).toContain("body");
  });
});
