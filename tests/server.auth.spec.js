import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { useServers } from "./server.js";
import { editHref, pageHref } from "../public/slug.mjs";

const serve = useServers();
const PASSWORD = "correct-horse-battery-staple";
const authFile = (text) => {
  const file = path.join(
    mkdtempSync(path.join(os.tmpdir(), "molesk-auth-")),
    "auth",
  );
  writeFileSync(file, text, { mode: 0o600 });
  return file;
};
const basic = (credentials) =>
  `Basic ${Buffer.from(credentials).toString("base64")}`;
const NOTES = { "Note.md": "# Note\n" };

test("every request needs a listed user's password", async ({ request }) => {
  const file = authFile(
    `# users\nme:${PASSWORD}\n\nyou:pass:with:colons-123\n`,
  );
  const { url, child } = await serve(NOTES, "--auth-file", file);
  let logs = "";
  child.stderr.on("data", (chunk) => (logs += chunk));
  child.stdout.on("data", (chunk) => (logs += chunk));
  const note = `${url}${pageHref("Note.md")}`;
  for (const authorization of [
    undefined,
    basic(`me:wrong-password-here!`),
    basic(`nobody:${PASSWORD}`),
    "Bearer token",
    "Basic !!!",
  ]) {
    const res = await request.get(note, {
      headers: authorization ? { Authorization: authorization } : {},
    });
    expect(res.status(), authorization).toBe(401);
    expect(res.headers()["www-authenticate"]).toBe(
      'Basic realm="molesk", charset="UTF-8"',
    );
  }
  for (const credentials of [`me:${PASSWORD}`, "you:pass:with:colons-123"]) {
    const res = await request.get(note, {
      headers: { Authorization: basic(credentials) },
    });
    expect(res.status(), credentials).toBe(200);
  }
  const feed = await request.get(`${url}/rss.xml`, {
    headers: { Authorization: basic(`me:${PASSWORD}`) },
  });
  expect(feed.headers()["cache-control"]).toBe("private, max-age=300");
  await expect.poll(() => logs).toContain("auth failed from");
  expect(logs).not.toContain("wrong-password-here");
  expect(logs).not.toContain(PASSWORD);
});

test("an unknown host name is refused before the login", async ({
  request,
}) => {
  const { url } = await serve(
    NOTES,
    "--auth-file",
    authFile(`me:${PASSWORD}\n`),
  );
  const res = await request.get(`${url}/`, {
    headers: { Host: "attacker.example" },
  });
  expect(res.status()).toBe(421);
});

test.describe("bad auth files stop the start", () => {
  const cases = [
    ["missing", null, "Cannot read --auth-file"],
    ["empty", "", "has no user:password lines"],
    ["comments only", "# nobody\n", "has no user:password lines"],
    ["no colon", "me\n", "line 1: expected user:password"],
    ["empty user", `:${PASSWORD}\n`, "line 1: expected user:password"],
    ["empty password", "me:\n", "line 1: expected user:password"],
    ["short password", "me:short\n", "shorter than 15 characters"],
    [
      "hashed password",
      "me:$apr1$abcdefgh$ijklmnopqrstuv\n",
      "hashed passwords",
    ],
    [
      "duplicate user",
      `me:${PASSWORD}\nme:${PASSWORD}x\n`,
      "line 2: me is listed twice",
    ],
  ];
  for (const [name, text, message] of cases) {
    test(name, () => {
      const file = text === null ? "/nonexistent/auth" : authFile(text);
      const result = spawnSync(
        "node",
        ["app.js", "contents", "--auth-file", file],
        {
          encoding: "utf8",
          timeout: 5000,
        },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(message);
      expect(result.stderr).not.toContain(PASSWORD);
    });
  }
});

test("the editor saves behind the login", async ({ browser }) => {
  const { url, dir } = await serve(
    NOTES,
    "--edit",
    "--auth-file",
    authFile(`me:${PASSWORD}\n`),
  );
  const context = await browser.newContext({
    httpCredentials: { username: "me", password: PASSWORD },
  });
  const page = await context.newPage();
  await page.goto(`${url}${editHref("Note.md")}`);
  await page.locator("#editor textarea").fill("# Saved behind a login\n");
  await expect(page.locator(".editor-status").first()).toHaveText("Saved");
  expect(readFileSync(path.join(dir, "Note.md"), "utf8")).toBe(
    "# Saved behind a login\n",
  );
  await context.close();
});
