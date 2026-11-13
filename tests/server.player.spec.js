import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { useServers } from "./server.js";

const serve = useServers();
const MOVE = { "Move.md": "![Cut](clip.webm)\n" };
const CLIP = readFileSync("tests/fixtures/clip.webm");
const FILES = { ...MOVE, "clip.webm": CLIP };

test.describe("Videos - Player", () => {
  test("plays, seeks and sets speed and volume", async ({ page }) => {
    const { url } = await serve(FILES);
    await page.goto(`${url}/content/move`);
    const player = page.getByRole("group", { name: "Cut" });
    const video = player.locator("video");
    await expect(video).not.toHaveAttribute("controls");
    await expect(player.locator(".player-time")).toHaveText("0:00 / 0:02");
    await player.getByRole("button", { name: "Play" }).click();
    await expect(video).toHaveJSProperty("paused", false);
    await player.getByRole("button", { name: "Pause" }).click();
    await expect(video).toHaveJSProperty("paused", true);
    await player.getByRole("slider", { name: "Seek" }).fill("1");
    await expect(player.locator(".player-time")).toHaveText("0:01 / 0:02");
    const speed = player.getByRole("button", { name: /^Speed/u });
    await speed.click();
    await page.getByRole("menuitem", { name: "0.5×" }).click();
    await expect(video).toHaveJSProperty("playbackRate", 0.5);
    await expect(speed).toHaveText("0.5×");
    const mute = player.getByRole("button", { name: "Mute" });
    await mute.hover();
    const volume = player.getByRole("slider", { name: "Volume" });
    await expect(volume).toHaveCSS("width", "64px");
    await volume.hover();
    await expect(volume).toHaveCSS("width", "64px");
    await volume.fill("0.3");
    await expect(video).toHaveJSProperty("volume", 0.3);
    await player.getByRole("button", { name: "Mute" }).click();
    await expect(video).toHaveJSProperty("muted", true);
    await expect(player.getByRole("button", { name: "Unmute" })).toBeVisible();
    await expect(
      player.getByRole("button", { name: "Full screen" }),
    ).toBeVisible();
    const axe = await new AxeBuilder({ page }).include(".player").analyze();
    expect(axe.violations).toEqual([]);
  });

  test("the editor preview gets the player", async ({ page }) => {
    const { url } = await serve(FILES, "--edit");
    await page.goto(`${url}/edit/move`);
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(
      page.locator(".editor-preview").getByRole("button", { name: "Play" }),
    ).toBeVisible();
  });
});

const liveVideos = async (page) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.collectGarbage");
  const proto = await cdp.send("Runtime.evaluate", {
    expression: "HTMLVideoElement.prototype",
  });
  const found = await cdp.send("Runtime.queryObjects", {
    prototypeObjectId: proto.result.objectId,
  });
  const count = await cdp.send("Runtime.callFunctionOn", {
    objectId: found.objects.objectId,
    functionDeclaration: "function () { return this.length; }",
    returnByValue: true,
  });
  return count.result.value;
};

test.describe("Videos - Player Upkeep", () => {
  test("removed players are freed", async ({ page }) => {
    const { url } = await serve(FILES);
    await page.goto(`${url}/content/move`);
    const before = await liveVideos(page);
    await page.evaluate(async () => {
      const { enhanceVideos } = await import("/player.js");
      for (let i = 0; i < 20; i++) {
        const box = document.createElement("div");
        box.innerHTML = "<video controls></video>";
        document.body.append(box);
        enhanceVideos(box);
        box.remove();
      }
    });
    await expect.poll(() => liveVideos(page)).toBe(before);
  });

  test("a clip that can't play says so", async ({ page }) => {
    const { url } = await serve({
      "Move.md": "![Cut](bad.mp4)\n",
      "bad.mp4": "not a video",
    });
    await page.goto(`${url}/content/move`);
    const player = page.getByRole("group", { name: "Cut" });
    await expect(player.getByRole("alert")).toHaveText(
      "This video is missing or can't be played in this browser.",
    );
    await expect(player.getByRole("button", { name: "Play" })).toBeHidden();
  });
});

test.describe("Videos - Player in the Page", () => {
  test("the controls lie over the clip and hide while it plays", async ({
    page,
  }) => {
    const { url } = await serve(FILES);
    await page.goto(`${url}/content/move`);
    const player = page.getByRole("group", { name: "Cut" });
    const osd = player.locator(".player-osd");
    const inside = await player.evaluate((el) => {
      const video = el.querySelector("video").getBoundingClientRect();
      const bar = el.querySelector(".player-osd").getBoundingClientRect();
      return bar.top >= video.top && bar.bottom <= video.bottom;
    });
    expect(inside).toBe(true);
    await expect(osd).toHaveCSS("opacity", "1");
    await player.locator("video").evaluate((v) => {
      v.loop = true;
      v.muted = true;
    });
    await player.getByRole("button", { name: "Play" }).click();
    await page.mouse.move(0, 0);
    await expect(osd).toHaveCSS("opacity", "0", { timeout: 6000 });
    await player.hover();
    await expect(osd).toHaveCSS("opacity", "1");
  });

  test("a playing clip keeps playing while the text changes", async ({
    page,
  }) => {
    const { url } = await serve(FILES, "--edit");
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(`${url}/edit/move`);
    await page.getByRole("button", { name: "Split", exact: true }).click();
    const preview = page.locator(".editor-preview");
    const video = preview.locator("video");
    await video.evaluate((v) => {
      v.loop = true;
      v.muted = true;
      v.dataset.kept = "yes";
    });
    await preview.getByRole("button", { name: "Play" }).click();
    await expect(video).toHaveJSProperty("paused", false);
    await page.locator(".editor-text").fill("![Cut 2](clip.webm)\n\nMore text");
    await expect(preview).toContainText("More text");
    await expect(video).toHaveAttribute("data-kept", "yes");
    await expect(video).toHaveJSProperty("paused", false);
    await expect(preview.getByRole("group", { name: "Cut 2" })).toBeVisible();
  });
});

test.describe("Videos - Loading", () => {
  const PLAIN = { "Plain.md": "# Plain\n\n[Move](/content/move)\n", ...FILES };

  test("a page without a video loads no player, menu or new-page form", async ({
    page,
  }) => {
    const { url } = await serve(PLAIN);
    const loaded = [];
    page.on("request", (req) => loaded.push(new URL(req.url()).pathname));
    await page.goto(`${url}/content/plain`, { waitUntil: "networkidle" });
    expect(loaded).toContain("/content.js");
    for (const module of ["/player.js", "/menu.js", "/tree.js"]) {
      expect(loaded).not.toContain(module);
    }
  });

  test("a page with a video loads the player, also after a link", async ({
    page,
  }) => {
    const { url } = await serve(PLAIN);
    const loaded = [];
    page.on("request", (req) => loaded.push(new URL(req.url()).pathname));
    await page.goto(`${url}/content/plain`);
    await page
      .locator("#file-content")
      .getByRole("link", { name: "Move", exact: true })
      .click();
    const player = page.getByRole("group", { name: "Cut" });
    await expect(player.getByRole("button", { name: "Play" })).toBeVisible();
    expect(loaded).toContain("/player.js");
  });
});
