import { test, expect } from "@playwright/test";
import { useServers } from "./server.js";
import cli from "../lib/cli.js";

const serve = useServers();
const SWITCHES = {
  pager: "SHOW_PAGER",
  backlinks: "SHOW_BACKLINKS",
  toc: "SHOW_TOC",
  position: "SHOW_POSITION",
};
const resolve = (...args) => cli.parseArgs(cli.defaultConfig(), args);

const PROSE = "word ".repeat(150);
const NOTES = {
  "a.md": `# A\n\n${["One", "Two", "Three"].map((h) => `## ${h}\n\n${PROSE}\n`).join("\n")}`,
  "b.md": "# B\n\nSee [A](a.md).\n",
};
const TALL = `# Tall\n\n${"A paragraph of the story.\n\n".repeat(300)}`;

test("the opt-in flags add each piece", async ({ request }) => {
  const { url } = await serve(NOTES, "--pager", "--backlinks", "--toc");
  const page = await (await request.get(`${url}/content/a`)).text();
  expect(page).toContain('class="pager"');
  expect(page).toContain('class="backlinks"');
  expect(page).toContain('class="toc"');
});

test("each has the same default in both modes and a --no- flag", () => {
  for (const [name, key] of Object.entries(SWITCHES)) {
    expect(resolve()[key], name).toBe(name === "position");
    expect(resolve("contents", "--edit")[key], name).toBe(name === "position");
    expect(resolve(`--no-${name}`)[key], name).toBe(false);
    expect(resolve("--no-pager", `--${name}`)[key], name).toBe(true);
  }
});

test.describe("Switches", () => {
  test("by default a page keeps only its reading place", async ({
    request,
  }) => {
    const { url } = await serve(NOTES);
    const page = await (await request.get(`${url}/content/a`)).text();
    expect(page).not.toContain('class="pager"');
    expect(page).not.toContain('class="backlinks"');
    expect(page).not.toContain('class="toc"');
    expect(page).toContain("data-position");
  });

  test("--no- flags remove each piece", async ({ request }) => {
    const { url } = await serve(
      NOTES,
      ...Object.keys(SWITCHES).map((name) => `--no-${name}`),
    );
    const page = await (await request.get(`${url}/content/a`)).text();
    expect(page).toContain("<h1");
    expect(page).not.toContain('class="pager"');
    expect(page).not.toContain('class="backlinks"');
    expect(page).not.toContain('class="toc"');
    expect(page).not.toContain("data-position");
  });

  test("--no-position does not reopen a page where it was left", async ({
    page,
  }) => {
    const { url } = await serve(
      { "Tall.md": TALL, "Other.md": "# Other\n" },
      "--no-position",
    );
    await page.goto(`${url}/content/tall`);
    await page.evaluate(() =>
      window.scrollTo({ top: 3000, behavior: "instant" }),
    );
    await page.waitForTimeout(600);
    await page.goto(`${url}/content/other`);
    await page.goto(`${url}/content/tall`);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
});
