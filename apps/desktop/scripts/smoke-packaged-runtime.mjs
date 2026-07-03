/* global console, process */
import { existsSync } from "node:fs";
import path from "node:path";

function fail(message) {
  throw new Error(`RELEASE_BLOCKING_DIAGNOSTIC: ${message}`);
}

const packaged = process.env.APP_PACKAGED === "true";
const resourcesPath = process.env.RESOURCES_PATH;

if (!packaged) {
  fail("packaged runtime smoke requires APP_PACKAGED=true.");
}

if (!resourcesPath) {
  fail("packaged runtime smoke requires RESOURCES_PATH to resolve the bundled browser location.");
}

const resourcesRoot = path.isAbsolute(resourcesPath)
  ? resourcesPath
  : path.resolve(process.env.INIT_CWD ?? process.cwd(), resourcesPath);
const browsersPath = path.join(resourcesRoot, "playwright-browsers");
if (!existsSync(browsersPath)) {
  fail(`unable to resolve bundled Playwright browser path: ${browsersPath}`);
}

console.log(`Packaged Playwright browser path resolved: ${browsersPath}`);
