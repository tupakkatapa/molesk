import { test } from "@playwright/test";
import { spawn } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export const freePort = () =>
  new Promise((resolve) => {
    const server = net.createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

// Paths ending in "/" are created as empty folders.
function tree(files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "molesk-test-"));
  for (const [rel, text] of Object.entries(files)) {
    const target = path.join(dir, rel);
    if (rel.endsWith("/")) {
      mkdirSync(target, { recursive: true });
    } else {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, text);
    }
  }
  return dir;
}

// An environment whose xdg-open records the URL it is given in `log`
// instead of opening a browser.
export function fakeOpener() {
  const bin = mkdtempSync(path.join(os.tmpdir(), "molesk-open-"));
  const log = path.join(bin, "opened");
  const script = path.join(bin, "xdg-open");
  writeFileSync(script, `#!/bin/sh\nprintf '%s' "$1" > '${log}'\n`);
  chmodSync(script, 0o755);
  return { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, log };
}

async function start(target, args, env = fakeOpener().env) {
  const port = await freePort();
  const child = spawn(
    "node",
    [
      "app.js",
      target,
      "--address",
      "127.0.0.1",
      "--port",
      String(port),
      ...args,
    ],
    { env },
  );
  await new Promise((resolve, reject) => {
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.includes("Running on")) resolve();
    });
    child.on("exit", (code) => reject(new Error(`molesk exited ${code}`)));
  });
  return { url: `http://127.0.0.1:${port}`, child };
}

// Returns `serve(files, ...args)`, which starts molesk on a fresh data dir,
// `serve.file(files, name, ...args)`, which opens one note of it, and
// `serve.prepared(prepare, files, ...args)`, which runs `prepare(dir)`
// first; servers and dirs are removed after each test of the calling file.
export function useServers() {
  const started = [];
  test.afterEach(() => {
    for (const { child, dir } of started.splice(0)) {
      child.kill();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  const launch = async (files, name, args, prepare) => {
    const dir = tree(files);
    await prepare?.(dir);
    const server = await start(path.join(dir, name), args);
    started.push({ dir, ...server });
    return { url: server.url, dir, child: server.child };
  };
  const serve = (files, ...args) => launch(files, "", args);
  serve.file = (files, name, ...args) => launch(files, name, args);
  serve.prepared = (prepare, files, ...args) =>
    launch(files, "", args, prepare);
  return serve;
}
