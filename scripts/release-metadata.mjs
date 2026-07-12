#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveAcceptanceCommitSha } from "../packages/core/dist/index.js";

/** Parses release-metadata command-line arguments. */
const args = parseArgs(process.argv.slice(2));
/** Identifies the platform whose package files are being described. */
const platform = requireArg(args, "platform");
/** Identifies the immutable Git tag for the release. */
const tag = requireArg(args, "tag");
/** Identifies the tagged evidence-only release commit. */
const releaseCommit = requireArg(args, "release-commit");
/** Locates sanitized acceptance records for the release. */
const acceptanceDir = args["acceptance-dir"] ?? "openspec/changes/implement-reference-feature-parity/acceptance";
/** Locates desktop artifacts emitted by electron-builder. */
const releaseDir = args["release-dir"] ?? "apps/desktop/release";
/** Resolves the desktop package metadata used by the published artifacts. */
const desktopPackage = JSON.parse(await readFile("apps/desktop/package.json", "utf8"));
/** Resolves all release-scoped acceptance records before recording provenance. */
const records = (await readAcceptanceRecords(acceptanceDir)).filter((record) => record.tag === tag);
/** Resolves the exact implementation commit exercised by the operator. */
const acceptedCommit = resolveAcceptedCommit(records);
/** Lists artifacts and update metadata without reading any secret-bearing content. */
const artifacts = await collectReleaseArtifacts(releaseDir);
/** Names the metadata file uploaded with this platform's artifacts. */
const outputPath = path.join(releaseDir, `release-metadata-${platform}.json`);

await writeFile(outputPath, `${JSON.stringify({
  packageVersion: desktopPackage.version,
  tag,
  acceptedCommit,
  releaseCommit,
  platform,
  artifacts,
  generatedAt: new Date().toISOString(),
}, null, 2)}\n`);
console.log(`Wrote ${outputPath}.`);

/**
 * Resolves the single accepted implementation commit from release-scoped evidence.
 *
 * @param records - Sanitized records for the requested tag.
 * @returns The accepted implementation commit SHA.
 */
function resolveAcceptedCommit(records) {
  const resolution = resolveAcceptanceCommitSha(records);
  if (!resolution.ok || !resolution.commitSha) {
    throw new Error(`Unable to resolve accepted implementation commit: ${resolution.errors.join("; ")}`);
  }
  return resolution.commitSha;
}

/**
 * Reads every JSON acceptance record recursively from the configured directory.
 *
 * @param dir - Directory containing sanitized acceptance record files.
 * @returns Flattened acceptance records.
 */
async function readAcceptanceRecords(dir) {
  const records = [];
  for (const file of await collectJsonFiles(dir)) {
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
 * @returns JSON file paths.
 */
async function collectJsonFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
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
 * Returns release artifact names and update metadata names for one platform.
 *
 * @param dir - Artifact output directory.
 * @returns Sorted artifact file names safe to publish in provenance metadata.
 */
async function collectReleaseArtifacts(dir) {
  return (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /\.(dmg|exe|zip|blockmap|json|txt|yml)$/u.test(name))
    .sort();
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
function requireArg(parsed, name) {
  const value = parsed[name];
  if (!value) {
    throw new Error(`Missing required --${name}`);
  }
  return value;
}
