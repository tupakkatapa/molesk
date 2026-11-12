import { test, expect } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  existsSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fakeOpener, freePort } from "./server.js";
import { pageHref } from "../public/slug.mjs";

const run = (...args) =>
  spawnSync("node", ["app.js", ...args], {
    encoding: "utf8",
    timeout: 5000,
    env: fakeOpener().env,
  });

const tmp = () => mkdtempSync(path.join(os.tmpdir(), "molesk-cli-"));

test.describe("CLI - Rejected Arguments", () => {
  const cases = [
    [["--home", "--edit"], "--home"],
    [["contents", "--port"], "--port"],
    [["contents", "--title"], "--title"],
    [["contents", "--image", "-o"], "--image"],
    [["contents", "--bogus"], "--bogus"],
    [["contents", "--port", "abc"], "--port"],
    [["contents", "--port", "8090x"], "--port"],
    [["contents", "--port", "99999"], "--port"],
    [["contents", "--port", "0"], "--port"],
    [["contents", "contents/posts"], "one file or directory"],
    [["package.json"], "package.json"],
    [["contents", "--link", "nocolon"], "--link"],
    [["contents", "--link"], "--link"],
    [["contents", "--image-size", "huge"], "--image-size must be"],
    [["contents", "--url", "blog.example"], "--url must be"],
    [["contents", "--url", "ftp://blog.example"], "--url must be"],
    [["contents", "--image", "/nonexistent.png"], "Cannot read --image"],
    [["--edit"], "--edit"],
    [["<read-only dir>", "--edit"], "writable"],
  ];
  for (const [args, message] of cases) {
    test(`${args.join(" ")} exits 1`, () => {
      const readOnly = tmp();
      chmodSync(readOnly, 0o555);
      const result = run(
        ...args.map((arg) => (arg === "<read-only dir>" ? readOnly : arg)),
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(message);
    });
  }
});

const started = (child) =>
  new Promise((resolve, reject) => {
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.includes("Running on")) resolve(stdout);
    });
    child.on("exit", (code) => reject(new Error(`exit ${code}`)));
  });

test.describe("CLI - Server Lifetime", () => {
  test("a port in use exits 1", async () => {
    const port = String(await freePort());
    const first = spawn("node", ["app.js", "contents", "--port", port]);
    try {
      await started(first);
      const second = run("contents", "--port", port);
      expect(second.status).toBe(1);
      expect(second.stderr).toContain(port);
    } finally {
      first.kill();
    }
  });
});

test.describe("CLI - Single File", () => {
  test("opens the browser on a URL with shell characters", async () => {
    const dir = tmp();
    const file = path.join(dir, "a(b) $c;.md");
    writeFileSync(file, "# A\n");
    const port = String(await freePort());
    const { env, log } = fakeOpener();
    const child = spawn(
      "node",
      ["app.js", file, "--address", "127.0.0.1", "--port", port],
      { env },
    );
    try {
      await started(child);
      await expect.poll(() => existsSync(log)).toBe(true);
      expect(readFileSync(log, "utf8")).toBe(
        `http://127.0.0.1:${port}${pageHref("a(b) $c;.md")}`,
      );
    } finally {
      child.kill();
    }
  });

  test("binds loopback by default", async () => {
    const port = String(await freePort());
    const child = spawn(
      "node",
      ["app.js", "contents/Home.md", "--port", port],
      {
        env: fakeOpener().env,
      },
    );
    try {
      expect(await started(child)).toContain(`http://127.0.0.1:${port}`);
    } finally {
      child.kill();
    }
  });
});
