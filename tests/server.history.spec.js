import { test, expect } from "@playwright/test";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { useServers } from "./server.js";

const serve = useServers();
const markdown = { "Content-Type": "text/markdown" };
const gitLog = (dir) =>
  execFileSync("git", ["-C", dir, "log", "--format=%an|%s"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n");

const save = async (request, url, rel, text) => {
  const current = await request.get(`${url}/api/files/${rel}`);
  const precondition = current.ok()
    ? { "If-Match": current.headers().etag }
    : { "If-None-Match": "*" };
  const res = await request.put(`${url}/api/files/${rel}`, {
    headers: { ...markdown, ...precondition },
    data: text,
  });
  expect(res.ok()).toBe(true);
};

test("edits become versions, listed and readable back", async ({ request }) => {
  const { url, dir } = await serve(
    { "Note.md": "---\ndate: 1\n---\n# One\n" },
    "--edit",
    "--git",
  );
  await save(request, url, "Note.md", "---\ndate: 1\n---\n# Two\n");
  const { versions, error } = await (
    await request.get(`${url}/api/history/Note.md`)
  ).json();
  expect(error).toBeNull();
  expect(versions.map((v) => v.subject)).toEqual([
    "Edit Note.md",
    "molesk: snapshot at start",
  ]);
  const old = await request.get(
    `${url}/api/history/Note.md?at=${versions[1].commit}`,
  );
  expect(await old.json()).toEqual({ body: "# One\n" });
  expect(gitLog(dir)[0]).toBe("molesk|Edit Note.md");
});

test("versions from before a rename stay readable", async ({ request }) => {
  const { url } = await serve({ "a.md": "# First\n" }, "--edit", "--git");
  const { etag } = (await request.get(`${url}/api/files/a.md`)).headers();
  await request.post(`${url}/api/move`, {
    headers: { "If-Match": etag },
    data: { from: "a.md", to: "b.md" },
  });
  await save(request, url, "b.md", "# Second\n");
  const { versions } = await (
    await request.get(`${url}/api/history/b.md`)
  ).json();
  const first = versions.at(-1);
  expect(first.path).toBe("a.md");
  const old = await request.get(
    `${url}/api/history/${first.path}?at=${first.commit}`,
  );
  expect((await old.json()).body).toBe("# First\n");
});

test("bad versions and paths are refused", async ({ request }) => {
  const { url } = await serve({ "Note.md": "# N\n" }, "--edit", "--git");
  for (const at of ["HEAD", "abc", "ABCDEF0", "--output=x", "0000000"]) {
    const res = await request.get(`${url}/api/history/Note.md?at=${at}`);
    expect(res.status(), at).toBe(404);
  }
  for (const rel of [".trash/x.md", "..%2Fx.md"]) {
    const res = await request.get(`${url}/api/history/${rel}`);
    expect(res.status(), rel).toBeGreaterThanOrEqual(400);
  }
  const fresh = await (await request.get(`${url}/api/history/New.md`)).json();
  expect(fresh.versions).toEqual([]);
});

test("stopping the server commits what is pending", async ({ request }) => {
  const { url, dir, child } = await serve(
    { "Note.md": "# A\n" },
    "--edit",
    "--git",
  );
  await save(request, url, "Note.md", "# B\n");
  const exited = new Promise((resolve) => {
    child.on("exit", resolve);
  });
  child.kill("SIGTERM");
  expect(await exited).toBe(0);
  expect(gitLog(dir)[0]).toBe("molesk|Edit Note.md");
});

test("a failing git never fails a save", async ({ request }) => {
  const { url, dir } = await serve({ "Note.md": "# A\n" }, "--edit", "--git");
  chmodSync(path.join(dir, ".git", "objects"), 0o500);
  try {
    await save(request, url, "Note.md", "# B\n");
    const { error } = await (
      await request.get(`${url}/api/history/Note.md`)
    ).json();
    expect(error).toBeTruthy();
  } finally {
    chmodSync(path.join(dir, ".git", "objects"), 0o755);
  }
});

test("an existing repository's hooks never run", async ({ request }) => {
  const prepare = (dir) => {
    execFileSync("git", ["init", "-q", dir]);
    mkdirSync(path.join(dir, ".git", "hooks"), { recursive: true });
    writeFileSync(
      path.join(dir, ".git", "hooks", "pre-commit"),
      "#!/bin/sh\nexit 1\n",
      {
        mode: 0o755,
      },
    );
  };
  const { url, dir } = await serve.prepared(
    prepare,
    { "Note.md": "# A\n" },
    "--edit",
    "--git",
  );
  await save(request, url, "Note.md", "# B\n");
  await request.get(`${url}/api/history/Note.md`);
  expect(gitLog(dir)[0]).toBe("molesk|Edit Note.md");
});

test("git variables of the calling shell are ignored", async ({ request }) => {
  const stray = path.join(
    mkdtempSync(path.join(os.tmpdir(), "molesk-env-")),
    "index",
  );
  process.env.GIT_INDEX_FILE = stray;
  try {
    const { url, dir } = await serve({ "Note.md": "# A\n" }, "--edit", "--git");
    await save(request, url, "Note.md", "# B\n");
    await request.get(`${url}/api/history/Note.md`);
    delete process.env.GIT_INDEX_FILE;
    expect(gitLog(dir)[0]).toBe("molesk|Edit Note.md");
    expect(existsSync(stray)).toBe(false);
  } finally {
    delete process.env.GIT_INDEX_FILE;
  }
});

test.describe("--git refuses to start", () => {
  const run = (dir, args, env = process.env) =>
    spawnSync("node", ["app.js", dir, ...args], {
      encoding: "utf8",
      timeout: 5000,
      env,
    });

  test("without --edit", () => {
    const result = run("contents", ["--git"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--git needs --edit");
  });

  test("without git on PATH", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "molesk-nogit-"));
    const result = run(dir, ["--edit", "--git"], {
      ...process.env,
      PATH: path.dirname(process.execPath),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--git needs git on PATH");
  });

  test("inside another repository", () => {
    const outer = mkdtempSync(path.join(os.tmpdir(), "molesk-outer-"));
    execFileSync("git", ["init", "-q", outer]);
    const notes = path.join(outer, "notes");
    mkdirSync(notes);
    const result = run(notes, ["--edit", "--git"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("is inside the repository");
  });
});
