import { test, expect } from "@playwright/test";
import http from "node:http";
import { pageHref } from "../public/slug.mjs";

const port = (Number(process.env.MOLESK_TEST_PORT) || 18080) + 1;

const statusFor = (host, method = "GET", path = pageHref("Home.md")) =>
  new Promise((resolve, reject) => {
    const write =
      method === "PUT"
        ? { "Content-Type": "text/markdown", "If-None-Match": "*" }
        : {};
    const headers = { Host: host, ...write };
    const req = http.request(
      { host: "127.0.0.1", port, method, path, headers },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on("error", reject);
    req.end(method === "PUT" ? "# x\n" : undefined);
  });

test.describe("Edit Mode - Host Allowlist", () => {
  for (const host of [
    `localhost:${port}`,
    `127.0.0.1:${port}`,
    `[::1]:${port}`,
    "notes.test",
    "NOTES.test:443",
  ]) {
    test(`allows ${host}`, async () => {
      expect(await statusFor(host)).toBe(200);
    });
  }

  for (const host of [
    "evil.example",
    `evil.example:${port}`,
    "notes.test.evil",
  ]) {
    test(`refuses ${host} with 421`, async () => {
      expect(await statusFor(host)).toBe(421);
    });
  }

  test("refuses a rebound write before it touches disk", async () => {
    const file = `/api/files/rebind-${Date.now()}.md`;
    expect(await statusFor("evil.example", "PUT", file)).toBe(421);
    expect(await statusFor(`localhost:${port}`, "PUT", file)).toBe(201);
  });
});
