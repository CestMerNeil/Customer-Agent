#!/usr/bin/env node
import { validateReleasePublishTarget } from "../packages/core/dist/index.js";

/** Parses publish-target command-line arguments. */
const args = parseArgs(process.argv.slice(2));
/** Validates the immutable GitHub Release target before artifact upload. */
const result = validateReleasePublishTarget({
  tag: requireArg(args, "tag"),
  tagCommit: requireArg(args, "tag-commit"),
  workflowCommit: requireArg(args, "workflow-commit"),
  existingReleaseStatus: requireArg(args, "existing-release-status"),
});

if (!result.ok) {
  for (const error of result.errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log(`Release target ${args.tag} is new and resolves to the workflow commit.`);

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
