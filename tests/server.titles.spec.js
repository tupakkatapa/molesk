import { test, expect } from "@playwright/test";
import { useServers } from "./server.js";

const serve = useServers();
const FILES = {
  "my-post.md": "# A\n",
  "iPhone notes.md": "# B\n",
  "Note 10.md": "# C\n",
  "Note 2.md": "# D\n",
  "my_folder/Inner.md": "# E\n",
  "folder 10/x.md": "# F\n",
  "folder 9/x.md": "# G\n",
};
const text = async (request, url) => (await request.get(url)).text();

test.describe("Titles", () => {
  test("read the same in the tree, pages, crumbs and feed", async ({
    request,
  }) => {
    const { url } = await serve(FILES);
    const page = await text(request, `${url}/content/my-post.md`);
    expect(page).toContain("<title>My post - ");
    expect(page).toContain('<span class="tree-name">My post</span>');
    expect(page).toContain('<span class="tree-name">iPhone notes</span>');
    expect(page).toContain('<span class="tree-name">My folder</span>');
    const index = await text(request, `${url}/content/my_folder/`);
    expect(index).toContain("<h1>My folder</h1>");
    const feed = await text(request, `${url}/rss.xml`);
    expect(feed).toContain("<title>My post</title>");
    expect(feed).toContain("<title>iPhone notes</title>");
  });

  test("hyphens stay in names that have spaces", async ({ request }) => {
    const { url } = await serve({
      "Oven-Baked Feta Pasta.md": "Oven-Baked Feta Pasta\n",
      "my-first-post.md": "Hello there.\n",
    });
    const index = await text(request, `${url}/`);
    expect(index).toContain(
      '<span class="index-title">Oven-Baked Feta Pasta</span></a>',
    );
    expect(index).toContain('<span class="index-title">My first post</span>');
    expect(index).toContain('<span class="index-excerpt">Hello there.</span>');
  });

  test("the editor keeps the raw name", async ({ request }) => {
    const { url } = await serve(FILES, "--edit");
    const editor = await text(request, `${url}/edit/my-post.md`);
    expect(editor).toContain('value="my-post"');
  });
});

test.describe("Sorting", () => {
  test("numbers sort by value", async ({ request }) => {
    const { url } = await serve(FILES);
    const page = await text(request, `${url}/content/my-post.md`);
    const order = (names) =>
      names.map((name) => page.indexOf(`<span class="tree-name">${name}<`));
    const notes = order(["iPhone notes", "My post", "Note 2", "Note 10"]);
    expect(notes).toEqual([...notes].sort((a, b) => a - b));
    const folders = order(["Folder 9", "Folder 10", "My folder"]);
    expect(folders).toEqual([...folders].sort((a, b) => a - b));
    expect(Math.min(...notes, ...folders)).toBeGreaterThan(0);
  });
});
