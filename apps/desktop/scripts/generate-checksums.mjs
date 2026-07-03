/* global console, process */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { URL } from "node:url";

function readArg(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = process.argv.indexOf(name);
  if (index >= 0) {
    return process.argv[index + 1] ?? "";
  }

  return "";
}

function fail(message) {
  throw new Error(`CHECKSUM_GENERATION_FAILED: ${message}`);
}

const platform = readArg("--platform");
if (!platform) {
  fail("missing --platform.");
}

const releaseDir = new URL("../release/", import.meta.url);
const entries = readdirSync(releaseDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => !/^checksums-.+\.txt$/.test(name))
  .sort();

if (entries.length === 0) {
  fail(`no release files found in ${releaseDir.pathname}.`);
}

const lines = entries.map((name) => {
  const fileUrl = new URL(name, releaseDir);
  const digest = createHash("sha256").update(readFileSync(fileUrl)).digest("hex");
  return `${digest}  ${basename(name)}`;
});

const outputName = `checksums-${platform}.txt`;
writeFileSync(new URL(outputName, releaseDir), `${lines.join("\n")}\n`);

console.log(`Wrote ${outputName} for ${entries.length} release file(s).`);
