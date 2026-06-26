#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { validateAcceptanceRecordSet } from "../packages/core/dist/index.js";

const args = parseArgs(process.argv.slice(2));
const commitSha = requireArg(args, "commit");
const platform = requireArg(args, "platform");
const tag = args.tag;
const acceptanceDir = args.acceptanceDir ?? "openspec/changes/implement-reference-feature-parity/acceptance";
const records = await readAcceptanceRecords(acceptanceDir);

const scopedRecords = tag ? records.filter((record) => !record.tag || record.tag === tag) : records;
const result = validateAcceptanceRecordSet({ commitSha, platform, records: scopedRecords });
if (!result.ok) {
  console.error(`Release gate failed for commit=${commitSha} platform=${platform}${tag ? ` tag=${tag}` : ""}`);
  for (const error of result.errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log(`Release gate passed for commit=${commitSha} platform=${platform}${tag ? ` tag=${tag}` : ""}.`);

async function readAcceptanceRecords(dir) {
  const files = await collectJsonFiles(dir);
  const records = [];
  for (const file of files) {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    if (!Array.isArray(parsed)) {
      throw new Error(`${file} must contain an array of acceptance records`);
    }
    records.push(...parsed);
  }
  return records;
}

async function collectJsonFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return files;
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

function requireArg(args, name) {
  const value = args[name];
  if (!value) {
    console.error(`Missing required --${name}`);
    process.exit(2);
  }
  return value;
}
