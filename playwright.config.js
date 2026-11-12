const { defineConfig, devices } = require("@playwright/test");

const port = Number(process.env.MOLESK_TEST_PORT) || 18080;
const editPort = port + 1;
const editSpec = /edit\..*\.spec\.js/u;
const serverSpec = /server\..*\.spec\.js/u;

const editServer = [
  "dir=$(mktemp -d)",
  "trap 'rm -rf \"$dir\"' EXIT",
  'cp -r contents "$dir/notes"',
  'mkdir "$dir/outside"',
  'ln -s "$dir/outside" "$dir/notes/escape"',
  `node app.js "$dir/notes" --edit --address 127.0.0.1 --port ${editPort} --allowed-host notes.test --git`,
].join(" && ");

const editUse = { baseURL: `http://127.0.0.1:${editPort}` };

module.exports = defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "line",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: [editSpec, serverSpec],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      testIgnore: [editSpec, serverSpec],
      use: {
        ...devices["Pixel 5"],
        hasTouch: true,
      },
    },
    {
      name: "server",
      testMatch: serverSpec,
      snapshotPathTemplate: "{testDir}/golden/{arg}{ext}",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "edit",
      testMatch: editSpec,
      use: { ...devices["Desktop Chrome"], ...editUse },
    },
    {
      name: "edit-mobile",
      testMatch: /edit\.(ui|sidebar|keys|save|history)\.spec\.js/u,
      use: { ...devices["Pixel 5"], hasTouch: true, ...editUse },
    },
    // Firefox and WebKit disabled for NixOS compatibility
    // {
    //   name: "firefox",
    //   use: { ...devices["Desktop Firefox"] },
    // },
    // {
    //   name: "webkit",
    //   use: { ...devices["Desktop Safari"] },
    // },
  ],
  webServer: [
    {
      command: `node app.js ./contents --title TestSite --port ${port}`,
      url: `http://localhost:${port}`,
      reuseExistingServer: false,
      timeout: 10000,
    },
    {
      command: editServer,
      url: `http://127.0.0.1:${editPort}`,
      reuseExistingServer: false,
      timeout: 10000,
    },
  ],
});
