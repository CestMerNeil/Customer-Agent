#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildDefaultAcceptanceSkeleton,
  validateAcceptanceRecordSet,
} from "../packages/core/dist/index.js";

const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));

if (!command || !["generate", "validate"].includes(command)) {
  usage();
  process.exit(2);
}

if (command === "generate") {
  const commitSha = requireArg(args, "commit");
  const platform = args.platform ?? `${process.platform}-${process.arch}`;
  const records = buildDefaultAcceptanceSkeleton({
    commitSha,
    platform,
    ...(args.version ? { version: args.version } : {}),
    ...(args.tag ? { tag: args.tag } : {}),
  });
  await writeJson(args.out, records);
  process.exit(0);
}

const file = requireArg(args, "file");
const commitSha = requireArg(args, "commit");
const platform = args.platform ?? `${process.platform}-${process.arch}`;
const records = JSON.parse(await readFile(file, "utf8"));
const result = validateAcceptanceRecordSet({ commitSha, platform, records });
if (!result.ok) {
  for (const error of result.errors) {
    console.error(error);
  }
  process.exit(1);
}
console.log("Acceptance evidence is valid.");

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    if (!item?.startsWith("--")) {
      continue;
    }
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

function requireArg(args, name) {
  const value = args[name];
  if (!value) {
    console.error(`Missing required --${name}`);
    usage();
    process.exit(2);
  }
  return value;
}

async function writeJson(outPath, payload) {
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  if (!outPath) {
    process.stdout.write(json);
    return;
  }
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, json);
}

function usage() {
  console.error(`Usage:
  pnpm acceptance:generate -- --commit <sha> [--platform <platform>] [--version <version>] [--tag <tag>] [--out <file>]
  pnpm acceptance:validate -- --file <file> --commit <sha> [--platform <platform>]`);
}
