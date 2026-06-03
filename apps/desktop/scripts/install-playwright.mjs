/* global console, process */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const browsersPath = path.join(process.cwd(), "build", "playwright-browsers");
mkdirSync(browsersPath, { recursive: true });

const command = process.platform === "win32" ? "playwright.cmd" : "playwright";
const result = spawnSync(command, ["install", "chromium"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
  },
  stdio: "inherit",
});

if (result.status !== 0) {
  console.error(`Playwright Chromium install failed with status ${result.status ?? "unknown"}`);
  process.exit(result.status ?? 1);
}

console.log(`Playwright Chromium installed at ${browsersPath}`);
