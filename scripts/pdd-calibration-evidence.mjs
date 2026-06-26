#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildDefaultPddCalibrationSkeleton,
  summarizePddCalibrationRecords,
  validatePddCalibrationRecordSet,
} from "../packages/core/dist/index.js";

const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));

if (!command || !["template", "validate", "summarize"].includes(command)) {
  usage();
  process.exit(2);
}

if (command === "template") {
  const commitSha = requireArg(args, "commit");
  const platform = args.platform ?? `${process.platform}-${process.arch}`;
  const referenceCommit = args["reference-commit"] ?? "59467291c64dd69335d3e52612e38556a1833865";
  const records = buildDefaultPddCalibrationSkeleton({
    commitSha,
    platform,
    referenceCommit,
    ...(args.version ? { version: args.version } : {}),
    ...(args.tag ? { tag: args.tag } : {}),
  });
  await writeJson(args.out, records);
  process.exit(0);
}

if (command === "validate") {
  const file = requireArg(args, "file");
  const requestedCommit = args.commit;
  const platform = args.platform ?? `${process.platform}-${process.arch}`;
  const payload = JSON.parse(await readFile(file, "utf8"));
  const records = payload.records ?? payload;
  const result = validatePddCalibrationRecordSet(records);
  const commitMismatch = requestedCommit
    ? records.some((record) => record.commitSha !== requestedCommit)
    : false;
  const platformMismatch = records.some((record) => record.platform !== platform);
  const commitErrors = commitMismatch ? [`Some records do not match requested commit: ${requestedCommit}`] : [];
  const platformErrors = platformMismatch ? [`Some records do not match requested platform: ${platform}`] : [];
  const allErrors = [...result.errors, ...commitErrors, ...platformErrors];
  if (allErrors.length > 0) {
    for (const error of allErrors) {
      console.error(error);
    }
    process.exit(1);
  }
  console.log("PDD calibration evidence is valid.");
  process.exit(0);
}

const file = requireArg(args, "file");
const payload = JSON.parse(await readFile(file, "utf8"));
const records = payload.records ?? payload;
if (!Array.isArray(records) || records.length === 0) {
  console.error("No calibration records found.");
  process.exit(1);
}
const result = validatePddCalibrationRecordSet(records);
if (!result.ok) {
  for (const error of result.errors) {
    console.error(error);
  }
  process.exit(1);
}
if (records.length > 0) {
  const summary = summarizePddCalibrationRecords(records);
  await writeJson(args.out, summary);
  console.log(`Generated calibration summary for ${summary.commitSha} on ${summary.platform}.`);
  process.exit(0);
}

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
  pnpm pdd:calibration:template -- --commit <sha> [--platform <platform>] [--version <version>] [--tag <tag>] [--reference-commit <sha>] [--out <file>]
  pnpm pdd:calibration:validate -- --file <file> --commit <sha> [--platform <platform>]
  pnpm pdd:calibration:summarize -- --file <file> [--out <file>]
`);
}
