/* global console, process */
import { mkdirSync } from "node:fs";
import path, { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const browsersPath = path.join(process.cwd(), "build", "playwright-browsers");
mkdirSync(browsersPath, { recursive: true });

const playwrightPackageJson = require.resolve("playwright/package.json");
const playwrightCli = path.join(dirname(playwrightPackageJson), "cli.js");
const result = spawnSync(process.execPath, [playwrightCli, "install", "chromium"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
  },
  stdio: "inherit",
});

if (result.status !== 0) {
  if (result.error) {
    console.error(result.error.message);
  }
  console.error(`Playwright Chromium install failed with status ${result.status ?? "unknown"}`);
  process.exit(result.status ?? 1);
}

console.log(`Playwright Chromium installed at ${browsersPath}`);
