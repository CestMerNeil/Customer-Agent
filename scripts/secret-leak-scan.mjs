#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { scanSensitiveText } from "../packages/core/dist/index.js";

const args = parseArgs(process.argv.slice(2));
const roots = args.path?.split(",").filter(Boolean) ?? [
  "openspec/changes/implement-reference-feature-parity/acceptance",
  "report",
  "apps/desktop/RELEASE.md",
  ".github/workflows",
];
const findings = [];

for (const root of roots) {
  await scanPath(root);
}

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`${finding.file}: ${finding.category}/${finding.pattern}`);
  }
  process.exit(1);
}

console.log(`Secret leak scan passed (${roots.join(", ")}).`);

async function scanPath(target) {
  let info;
  try {
    info = await stat(target);
  } catch {
    return;
  }
  if (info.isDirectory()) {
    for (const entry of await readdir(target)) {
      if (shouldSkip(entry)) {
        continue;
      }
      await scanPath(path.join(target, entry));
    }
    return;
  }
  if (!isTextFile(target)) {
    return;
  }
  const text = await readFile(target, "utf8");
  const result = scanSensitiveText(text);
  for (const issue of result.issues) {
    findings.push({ file: target, ...issue });
  }
}

function shouldSkip(name) {
  return name === "node_modules" || name === "dist" || name === "release" || name === "build" || name.startsWith(".");
}

function isTextFile(filePath) {
  return [".json", ".md", ".txt", ".log", ".yml", ".yaml"].includes(path.extname(filePath).toLowerCase());
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    if (!item?.startsWith("--")) continue;
    const key = item.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}
