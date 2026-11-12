// On-demand screenshot QA, not part of the suite:
//   SHOTS_DIR=/tmp/shots ONLY=editor playwright test -c tests/shots/shots.config.js
const { defineConfig, devices } = require("@playwright/test");

const phone = {
  ...devices["iPhone 13"],
  defaultBrowserType: undefined,
  deviceScaleFactor: 1,
};

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: /\.shots\.js$/u,
  reporter: "line",
  workers: 6,
  projects: [
    { name: "1400", use: { viewport: { width: 1400, height: 900 } } },
    { name: "1024", use: { viewport: { width: 1024, height: 768 } } },
    { name: "390", use: phone },
  ],
});
