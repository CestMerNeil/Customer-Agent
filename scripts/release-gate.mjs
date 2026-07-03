#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { resolveAcceptanceCommitSha, validateAcceptanceRecordSet } from "../packages/core/dist/index.js";

const args = parseArgs(process.argv.slice(2));
const platform = requireArg(args, "platform");
const tag = args.tag;
const releaseCommit = args.releaseCommit;
const allowAncestorCommit = args["allow-ancestor-commit"] === "true";
const acceptanceDir = args.acceptanceDir ?? "openspec/changes/implement-reference-feature-parity/acceptance";
const records = await readAcceptanceRecords(acceptanceDir);

const scopedRecords = tag ? records.filter((record) => !record.tag || record.tag === tag) : records;
const commitResolutionRecords = tag ? records.filter((record) => record.tag === tag) : scopedRecords;
const commitSha = args.commit ?? resolveCommitFromRecords(commitResolutionRecords);
const result = validateAcceptanceRecordSet({ commitSha, platform, records: scopedRecords });
if (!result.ok) {
  console.error(`Release gate failed for commit=${commitSha} platform=${platform}${tag ? ` tag=${tag}` : ""}`);
  for (const error of result.errors) {
    console.error(error);
  }
  process.exit(1);
}

if (releaseCommit && releaseCommit !== commitSha) {
  if (!allowAncestorCommit) {
    console.error(
      `Release gate failed for commit=${commitSha} platform=${platform}${tag ? ` tag=${tag}` : ""}: release commit ${releaseCommit} differs from accepted implementation commit. Pass --allow-ancestor-commit to permit release-only commits.`,
    );
    process.exit(1);
  }
  assertAncestorCommit(commitSha, releaseCommit);
}

console.log(`Release gate passed for commit=${commitSha} platform=${platform}${tag ? ` tag=${tag}` : ""}.`);

function resolveCommitFromRecords(records) {
  const resolution = resolveAcceptanceCommitSha(records);
  if (!resolution.ok) {
    console.error("Release gate failed while resolving accepted implementation commit.");
    for (const error of resolution.errors) {
      console.error(error);
    }
    process.exit(1);
  }
  return resolution.commitSha;
}

function assertAncestorCommit(acceptedCommit, releaseCommit) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", acceptedCommit, releaseCommit], { stdio: "ignore" });
  } catch {
    console.error(
      `Release gate failed: accepted implementation commit ${acceptedCommit} is not an ancestor of release commit ${releaseCommit}.`,
    );
    process.exit(1);
  }
}

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
