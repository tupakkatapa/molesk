import { test, expect } from "@playwright/test";
import { setTimeout as sleep } from "node:timers/promises";
import { expiring } from "../lib/cache.js";

const counter = () => {
  let builds = 0;
  return {
    build: async () => {
      builds++;
      await sleep(5);
      return builds;
    },
    count: () => builds,
  };
};

test("concurrent gets share one build", async () => {
  const c = counter();
  const cache = expiring(c.build);
  expect(await Promise.all([cache.get(), cache.get()])).toEqual([1, 1]);
  expect(c.count()).toBe(1);
});

test("a failed build is not kept", async () => {
  let fail = true;
  const cache = expiring(() =>
    fail ? Promise.reject(new Error("boom")) : Promise.resolve("ok"),
  );
  await expect(cache.get()).rejects.toThrow("boom");
  fail = false;
  expect(await cache.get()).toBe("ok");
});

test("a build started before an invalidation is not stored", async () => {
  const c = counter();
  const cache = expiring(c.build);
  const early = cache.get();
  cache.invalidate();
  expect(await early).toBe(1);
  expect(await cache.get()).toBe(2);
  expect(await cache.get()).toBe(2);
});

test("after the TTL the old value is served while one rebuild runs", async () => {
  const c = counter();
  const cache = expiring(c.build, 20);
  expect(await cache.get()).toBe(1);
  await sleep(30);
  expect(await cache.get()).toBe(1);
  await expect.poll(() => cache.peek()).toBe(2);
  expect(c.count()).toBe(2);
});
