import { test, expect } from "@playwright/test";
import { useServers } from "./server.js";

const serve = useServers();
const search = async (request, url, q) => {
  const res = await request.get(`${url}/api/search?q=${encodeURIComponent(q)}`);
  expect(res.status()).toBe(200);
  return res.json();
};

const FILES = {
  "Home.md": "# Welcome\n\nThe garden starts here.\n",
  "Garden.md": "# Garden\n\nTomatoes.\n",
  "notes/Plants.md":
    "# Plants\n\nA garden needs water. The garden needs sun. My garden.\n",
  "notes/Kitchen.md": "# Kitchen\n\nCooking with **basil** from the garden.\n",
  "Code.md": "# Code\n\nUse <script>alert(1)</script> carefully.\n",
  "Äiti.md": "# Äiti\n\nCafé crème brûlée.\n",
  ".hidden/Secret.md": "garden secret\n",
};

test.describe("Search - Results", () => {
  test("ranks title hits first, then by hit count", async ({ request }) => {
    const { url } = await serve(FILES);
    const results = await search(request, url, "garden");
    expect(results.map((r) => r.path)).toEqual([
      "Garden.md",
      "notes/Plants.md",
      "Home.md",
      "notes/Kitchen.md",
    ]);
    expect(results[0].title).toBe("Garden");
    const plants = results[1];
    expect(plants.match).toBe("garden");
    expect(`${plants.before}${plants.match}${plants.after}`).toContain(
      "A garden needs water",
    );
  });

  test("snippets are plain text around the hit", async ({ request }) => {
    const { url } = await serve(FILES);
    const [code] = await search(request, url, "alert");
    expect(code).toEqual({
      path: "Code.md",
      title: "Code",
      before: "Code Use <script>",
      match: "alert",
      after: "(1)</script> carefully.",
    });
    const [kitchen] = await search(request, url, "BASIL");
    expect(kitchen.match).toBe("basil");
  });

  test("ignores case and accents", async ({ request }) => {
    const { url } = await serve(FILES);
    const [aiti] = await search(request, url, "creme brulee");
    expect(aiti.path).toBe("Äiti.md");
    expect(aiti.match).toBe("crème brûlée");
    expect((await search(request, url, "aiti"))[0].path).toBe("Äiti.md");
  });
});

test.describe("Search - Scope", () => {
  test("caps the query and the results", async ({ request }) => {
    const many = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`n${i}.md`, `needle ${i}\n`]),
    );
    const { url } = await serve(many);
    expect(await search(request, url, "n")).toEqual([]);
    expect(await search(request, url, "needle")).toHaveLength(20);
    expect(await search(request, url, `needle${"x".repeat(200)}`)).toEqual([]);
    const long = "needle 1".padEnd(100, " ") + "zzz";
    expect(await search(request, url, long)).not.toEqual([]);
  });

  test("updates after a write in edit mode", async ({ request }) => {
    const { url } = await serve(FILES, "--edit");
    expect(await search(request, url, "zucchini")).toEqual([]);
    await request.put(`${url}/api/files/Garden.md`, {
      headers: { "Content-Type": "text/markdown", "If-Match": "*" },
      data: "# Garden\n\nZucchini now.\n",
    });
    await expect
      .poll(async () => (await search(request, url, "zucchini")).length)
      .toBe(1);
  });

  test("covers only the open file in single-file mode", async ({ request }) => {
    const { url } = await serve.file(FILES, "Garden.md");
    const results = await search(request, url, "garden");
    expect(results.map((r) => r.path)).toEqual(["Garden.md"]);
  });

  test("is off with --no-search", async ({ request }) => {
    const { url } = await serve(FILES, "--no-search");
    const res = await request.get(`${url}/api/search?q=garden`);
    expect(res.status()).toBe(404);
    const page = await (await request.get(`${url}/content/Garden.md`)).text();
    expect(page).not.toContain("switcher");
  });
});
