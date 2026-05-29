/* global console */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mainEntry = path.join(packageRoot, "dist/main/index.js");
const preloadEntry = path.join(packageRoot, "dist/preload/index.cjs");

const mainSource = readFileSync(mainEntry, "utf8");

if (!existsSync(preloadEntry)) {
  throw new Error(`Expected CommonJS preload output at ${preloadEntry}`);
}

if (!mainSource.includes("../preload/index.cjs")) {
  throw new Error("Electron main process does not point at the CommonJS preload output");
}

console.log("Electron runtime smoke checks passed");
