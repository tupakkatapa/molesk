import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync, statSync, utimesSync } from "node:fs";
import path from "node:path";
import { useServers } from "./server.js";

const serve = useServers();
const CONTENTS = "contents";
const MTIME = new Date("2026-01-01T00:00:00Z");
const NOW_WINDOW = 60 * 60 * 1000;

const rels = readdirSync(CONTENTS, { recursive: true }).sort();
const files = Object.fromEntries(
  rels
    .filter((rel) => statSync(path.join(CONTENTS, rel)).isFile())
    .map((rel) => [rel, readFileSync(path.join(CONTENTS, rel))]),
);
const href = (rel) =>
  rel
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
const pages = [
  "/",
  ...rels.map((rel) =>
    rel in files ? `/content/${href(rel)}` : `/content/${href(rel)}/`,
  ),
  "/rss.xml",
];

// The server's port and the feed's build time differ per run.
const normalise = (text) =>
  text
    .replaceAll(/http:\/\/127\.0\.0\.1:\d+/gu, "http://ORIGIN")
    .replaceAll(/<(lastBuildDate|pubDate)>([^<]*)</gu, (match, tag, date) =>
      Math.abs(Date.parse(date) - Date.now()) < NOW_WINDOW
        ? `<${tag}>NOW<`
        : match,
    );

test("read-only pages match the golden snapshot", async ({ request }) => {
  const { url, dir } = await serve(files, "--title", "TestSite");
  for (const rel of Object.keys(files)) {
    utimesSync(path.join(dir, rel), MTIME, MTIME);
  }
  for (const page of pages) {
    const res = await request.get(`${url}${page}`);
    expect(res.status(), page).toBe(200);
    const name = decodeURIComponent(page).replace(/\/$/u, "/index").slice(1);
    expect(normalise(await res.text())).toMatchSnapshot(`${name}.html`);
  }
});
