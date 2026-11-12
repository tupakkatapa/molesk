import { test, expect } from "@playwright/test";
import { pageHref, folderHref } from "../public/slug.mjs";
import { useServers } from "./server.js";

const serve = useServers();
const head = (request, url) => request.get(url, { maxRedirects: 0 });

test("page addresses are lowercase, hyphenated and extensionless", () => {
  expect(pageHref("posts/My First Post.md")).toBe(
    "/content/posts/my-first-post",
  );
  expect(pageHref("dreams/The Siren’s Call.md")).toBe(
    "/content/dreams/the-sirens-call",
  );
  expect(pageHref('recipes/Macaroni "Salad".txt')).toBe(
    "/content/recipes/macaroni-salad",
  );
  expect(pageHref("Äiti.md")).toBe("/content/%C3%A4iti");
  expect(folderHref("My Posts/Sub_dir")).toBe("/content/my-posts/sub-dir/");
});

test("equal slugs go to the first name; the other keeps its file address", async ({
  request,
}) => {
  const { url } = await serve({
    "notes/b note.md": "# Second\n",
    "notes/A note.md": "# First\n",
    "notes/a-note.md": "# Third\n",
  });
  const first = await head(request, `${url}/content/notes/a-note`);
  expect(first.status()).toBe(200);
  expect(await first.text()).toContain("First");
  const other = await head(request, `${url}/content/notes/a-note.md`);
  expect(other.status()).toBe(200);
  expect(await other.text()).toContain("Third");
  const moved = await head(request, `${url}/content/notes/A%20note.md`);
  expect(moved.status()).toBe(301);
  expect(moved.headers().location).toBe("/content/notes/a-note");
});

test("folders with spaces resolve, images inside them keep their names", async ({
  request,
}) => {
  const { url } = await serve({
    "My Posts/Hello World.md": "# Hello\n\n![x](img/pic.png)\n",
    "My Posts/img/pic.png": "png",
  });
  expect(
    (await head(request, `${url}/content/my-posts/hello-world`)).status(),
  ).toBe(200);
  expect(
    (await head(request, `${url}/content/my-posts/img/pic.png`)).status(),
  ).toBe(200);
  const folder = await head(request, `${url}/content/My%20Posts/`);
  expect(folder.status()).toBe(301);
  expect(folder.headers().location).toBe("/content/my-posts/");
});
