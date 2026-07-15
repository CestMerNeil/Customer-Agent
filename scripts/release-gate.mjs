#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  resolveAcceptanceCommitSha,
  validateAcceptanceRecordSet,
  validateReleaseIdentity,
} from "../packages/core/dist/index.js";

/** Parses release-gate command-line arguments. */
const args = parseArgs(process.argv.slice(2));
/** Requires the target package platform. */
const platform = requireArg(args, "platform");
/** Filters evidence to a specific release tag when supplied. */
const tag = args.tag;
/** Identifies the tagged release commit. */
const releaseCommit = args["release-commit"];
/** Locates the sanitized acceptance records. */
const acceptanceDir = args["acceptance-dir"] ?? "openspec/changes/implement-reference-feature-parity/acceptance";
/** Loads every sanitized acceptance record before validation. */
const records = await readAcceptanceRecords(acceptanceDir);

/** Keeps tag-scoped evidence separate from historical records. */
const scopedRecords = tag ? records.filter((record) => !record.tag || record.tag === tag) : records;
/** Resolves the one implementation commit accepted for the requested tag. */
const commitResolutionRecords = tag ? records.filter((record) => record.tag === tag) : scopedRecords;
/** Uses an explicit commit override only for local diagnostic runs. */
const commitSha = args.commit ?? resolveCommitFromRecords(commitResolutionRecords);
/** Validates all required release capabilities for the selected platform. */
const result = validateAcceptanceRecordSet({ commitSha, platform, records: scopedRecords });
if (!result.ok) {
  console.error(`Release gate failed for commit=${commitSha} platform=${platform}${tag ? ` tag=${tag}` : ""}`);
  for (const error of result.errors) {
    console.error(error);
  }
  process.exit(1);
}

if (releaseCommit) {
  assertAncestorCommit(commitSha, releaseCommit);
  const identity = validateReleaseIdentity({
    acceptedCommit: commitSha,
    releaseCommit,
    tag: tag ?? "",
    packageVersion: await readDesktopPackageVersion(),
    changedPaths: collectChangedPaths(commitSha, releaseCommit),
  });
  if (!identity.ok) {
    console.error(`Release gate failed for accepted commit=${commitSha} release commit=${releaseCommit} platform=${platform}${tag ? ` tag=${tag}` : ""}.`);
    for (const error of identity.errors) {
      console.error(error);
    }
    process.exit(1);
  }
}

console.log(`Release gate passed for accepted commit=${commitSha}${releaseCommit ? ` release commit=${releaseCommit}` : ""} platform=${platform}${tag ? ` tag=${tag}` : ""}.`);

/**
 * Resolves the sole implementation commit named by release-scoped evidence.
 *
 * @param records - Sanitized acceptance records eligible for the requested release.
 * @returns The implementation commit accepted by the operator.
 */
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

/**
 * Verifies that the accepted implementation is reachable from the release commit.
 *
 * @param acceptedCommit - Commit exercised by real acceptance.
 * @param releaseCommit - Tagged descendant containing release evidence.
 */
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

/**
 * Reads the desktop package version used to validate the requested Git tag.
 *
 * @returns The declared desktop package version.
 */
async function readDesktopPackageVersion() {
  const packageJson = JSON.parse(await readFile("apps/desktop/package.json", "utf8"));
  if (typeof packageJson.version !== "string" || !packageJson.version.trim()) {
    throw new Error("apps/desktop/package.json must define a version");
  }
  return packageJson.version;
}

/**
 * Lists repository paths changed after real acceptance completed.
 *
 * @param acceptedCommit - Commit exercised by real acceptance.
 * @param releaseCommit - Tagged descendant containing release evidence.
 * @returns Repository-relative paths changed between the two commits.
 */
function collectChangedPaths(acceptedCommit, releaseCommit) {
  if (acceptedCommit === releaseCommit) {
    return [];
  }
  try {
    return execFileSync("git", ["diff", "--name-only", `${acceptedCommit}..${releaseCommit}`], { encoding: "utf8" })
      .split("\n")
      .map((filePath) => filePath.trim())
      .filter(Boolean);
  } catch {
    console.error(`Release gate failed: unable to compare accepted implementation commit ${acceptedCommit} with release commit ${releaseCommit}.`);
    process.exit(1);
  }
}

/**
 * Reads every JSON acceptance record recursively from the configured directory.
 *
 * @param dir - Directory containing sanitized acceptance record files.
 * @returns Flattened acceptance records.
 */
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

/**
 * Recursively finds JSON acceptance-record files.
 *
 * @param dir - Directory to traverse.
 * @returns Absolute or repository-relative JSON file paths.
 */
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

/**
 * Parses long-form command-line arguments into a string map.
 *
 * @param values - Raw argument values without the Node executable and script path.
 * @returns Parsed argument keys and values.
 */
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

/**
 * Returns a required argument or terminates with command usage status.
 *
 * @param parsed - Parsed command-line arguments.
 * @param name - Required argument name without the leading dashes.
 * @returns The non-empty argument value.
 */
function requireArg(args, name) {
  const value = args[name];
  if (!value) {
    console.error(`Missing required --${name}`);
    process.exit(2);
  }
  return value;
}
