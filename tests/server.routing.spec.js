import { test, expect } from "@playwright/test";
import { useServers } from "./server.js";
import { folderHref, pageHref } from "../public/slug.mjs";

const serve = useServers();

const NOTES = {
  "Alpha.md": "# Alpha\n\nFirst words of alpha.\n",
  "posts/Old.md": '---\ndate: "2026-01-01"\n---\n# Old\n\nAn old post.\n',
  "posts/New.md": '---\ndate: "2026-11-01"\n---\n# New\n\nA **new** post.\n',
};

const location = async (request, url) => {
  const res = await request.get(url, { maxRedirects: 0 });
  return [res.status(), res.headers().location];
};

test.describe("Root Resolution", () => {
  for (const [file, others] of [
    ["index.md", ["README.md", "Home.md"]],
    ["README.md", ["Home.md"]],
    ["readme.MD", []],
    ["Home.md", []],
  ]) {
    test(`opens ${file} as the home page`, async ({ request }) => {
      const files = { ...NOTES, [file]: "# Home\n" };
      for (const other of others) files[other] = "# Other\n";
      const { url } = await serve(files);
      expect(await location(request, `${url}/`)).toEqual([302, pageHref(file)]);
    });
  }
});

test.describe("Root Resolution - Options", () => {
  test("--home picks any note", async ({ request }) => {
    const { url } = await serve(
      { ...NOTES, "Home.md": "# Home\n" },
      "--home",
      "posts/Old.md",
    );
    expect(await location(request, `${url}/`)).toEqual([
      302,
      pageHref("posts/Old.md"),
    ]);
  });

  test("a missing --home falls back to the index", async ({ request }) => {
    const { url } = await serve(NOTES, "--home", "Gone.md");
    const res = await request.get(`${url}/`, { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('class="folder-index"');
  });

  test("without a home file / shows the index", async ({ page }) => {
    const { url } = await serve(NOTES);
    const res = await page.goto(`${url}/`);
    expect(res.status()).toBe(200);
    await expect(page).toHaveURL(`${url}/`);
    await expect(page.locator(".folder-index .index-note")).toHaveText([
      /Alpha/u,
    ]);
    await expect(page.locator(".folder-index .index-folder")).toHaveText([
      /Posts/u,
    ]);
  });
});

test.describe("Root Resolution - Toggles", () => {
  test("--no-home shows the index despite a home file", async ({ request }) => {
    const { url } = await serve(
      { ...NOTES, "Home.md": "# Home\n" },
      "--no-home",
    );
    const res = await request.get(`${url}/`, { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain(`href="${pageHref("Home.md")}"`);
  });

  test("--no-index without a home opens the first note", async ({
    request,
  }) => {
    const { url } = await serve(NOTES, "--no-index");
    expect(await location(request, `${url}/`)).toEqual([
      302,
      pageHref("Alpha.md"),
    ]);
  });
});

test.describe("Root Resolution - Empty", () => {
  for (const mode of [[], ["--edit"]]) {
    test(`an empty data dir shows an empty index ${mode.join(" ")}`, async ({
      page,
    }) => {
      const { url } = await serve({}, ...mode);
      const res = await page.goto(`${url}/`);
      expect(res.status()).toBe(200);
      await expect(page.locator(".index-empty")).toBeVisible();
    });
  }
});

test.describe("Home in the Sidebar", () => {
  test("is hidden from the tree; the title links to /", async ({ page }) => {
    const { url } = await serve({ ...NOTES, "Home.md": "# Home\n" });
    await page.goto(`${url}/`);
    await expect(page).toHaveURL(`${url}${pageHref("Home.md")}`);
    await expect(
      page.locator(`.sidebar a[href="${pageHref("Home.md")}"]`),
    ).toHaveCount(0);
    await expect(page.locator(".sidebar .fa-home")).toHaveCount(0);
    await expect(page.locator(".sidebar a.site-name")).toHaveAttribute(
      "href",
      "/",
    );
  });

  test("--no-home lists Home.md like any note", async ({ page }) => {
    const { url } = await serve(
      { ...NOTES, "Home.md": "# Home\n" },
      "--no-home",
    );
    await page.goto(`${url}/content/Alpha.md`);
    await expect(
      page.locator(`.sidebar a[href="${pageHref("Home.md")}"]`),
    ).toHaveCount(1);
  });
});

test.describe("Folder Index Pages", () => {
  test("list notes newest first with date and excerpt", async ({ page }) => {
    const { url } = await serve(NOTES);
    await page.goto(`${url}/content/posts/`);
    const notes = page.locator(".folder-index .index-note");
    await expect(notes).toHaveCount(2);
    await expect(notes.nth(0).locator(".index-title")).toHaveText("New");
    await expect(notes.nth(0).locator("time")).toHaveText("1 Nov 2026");
    await expect(notes.nth(0).locator(".index-excerpt")).toHaveText(
      "A new post.",
    );
    await expect(notes.nth(1).locator(".index-title")).toHaveText("Old");
    await expect(page.locator(".folder-index h1")).toHaveText("Posts");
  });
});

test.describe("Folder Index Pages - Routing", () => {
  test("add the trailing slash", async ({ request }) => {
    const { url } = await serve(NOTES);
    expect(await location(request, `${url}/content/posts`)).toEqual([
      301,
      "/content/posts/",
    ]);
  });

  test("open the folder's own index note", async ({ request }) => {
    const { url } = await serve({ ...NOTES, "posts/README.md": "# Posts\n" });
    expect(await location(request, `${url}/content/posts/`)).toEqual([
      302,
      pageHref("posts/README.md"),
    ]);
  });

  test("load in place through sidebar-style navigation", async ({
    request,
  }) => {
    const { url } = await serve(NOTES);
    const res = await request.get(`${url}/content/posts/`, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    const html = await res.text();
    expect(html).toContain('class="folder-index"');
    expect(html).not.toContain("<html");
  });

  test("are 404 with --no-index", async ({ request }) => {
    const { url } = await serve(NOTES, "--no-index");
    const res = await request.get(`${url}/content/posts/`);
    expect(res.status()).toBe(404);
  });

  test("are 404 for missing folders", async ({ request }) => {
    const { url } = await serve(NOTES);
    const res = await request.get(`${url}/content/nope/`);
    expect(res.status()).toBe(404);
  });
});

test.describe("Old Addresses", () => {
  test("move a file's own path to its page address", async ({ request }) => {
    const { url } = await serve({ "My Notes/First Try.md": "# First\n" });
    expect(
      await location(request, `${url}/content/My%20Notes/First%20Try.md`),
    ).toEqual([301, pageHref("My Notes/First Try.md")]);
    expect(await location(request, `${url}/content/My%20Notes/`)).toEqual([
      301,
      folderHref("My Notes"),
    ]);
  });
});
