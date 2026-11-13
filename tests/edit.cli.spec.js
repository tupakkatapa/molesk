import { test, expect } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";

const port = (Number(process.env.MOLESK_TEST_PORT) || 18080) + 2;

const run = (...args) =>
  spawnSync("node", ["app.js", ...args, "--port", String(port)], {
    encoding: "utf8",
    timeout: 5000,
  });

const startup = (...args) =>
  new Promise((resolve, reject) => {
    const child = spawn("node", ["app.js", ...args, "--port", String(port)]);
    let stdout = "";
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.includes("Running on")) {
        child.kill();
        resolve({ stdout, stderr });
      }
    });
    child.on("exit", (code) => {
      if (!stdout.includes("Running on")) reject(new Error(`exit ${code}`));
    });
  });

test.describe("Edit Mode Startup", () => {
  test.describe.configure({ mode: "serial" });

  test("rejects single-file mode", () => {
    const result = run("contents/Home.md", "--edit", "--address", "127.0.0.1");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--edit");
  });

  test("binds loopback by default", async () => {
    const { stdout, stderr } = await startup("contents", "--edit");
    expect(stdout).toContain(`Running on http://127.0.0.1:${port}`);
    expect(stderr).toBe("");
  });

  test("warns on an explicit non-loopback address", async () => {
    const { stdout, stderr } = await startup(
      "contents",
      "--edit",
      "--address",
      "0.0.0.0",
    );
    expect(stdout).toContain("Running on");
    expect(stderr).toContain("lets anyone who reaches it edit");
  });

  test("read-only mode still binds all interfaces by default", async () => {
    const { stdout } = await startup("contents");
    expect(stdout).toContain(
      `Running on all interfaces (http://localhost:${port})`,
    );
  });

  test("help lists the edit flags", () => {
    const result = run("--help");
    expect(result.stdout).toContain("--edit");
    expect(result.stdout).toContain("--allowed-host");
  });
});
