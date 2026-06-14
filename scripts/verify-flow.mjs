/* global console, process */
// verify:flow — single verdict surface for the PDD flow seams (design.md).
//
// Runs each flow seam as a subprocess, writes a machine-readable verdict per
// layer to report/flow/<layer>.json plus an aggregate report/flow/summary.json,
// and exits non-zero if any *run* layer failed. An AI assistant reads the JSON
// to close its build -> verify -> fix loop unattended.
//
//   Seam A  packages/pdd flow test        (transport / normalize / service)
//   Seam B  apps/desktop seam-b test       (received -> reply -> send glue)
//   Seam C  Playwright run vs mock process (IPC + renderer; FULL mode only)
//
// Fast inner loop (A + B): `node scripts/verify-flow.mjs --fast` (or VERIFY_FAST=1).
// Full run (A + B + C):    `node scripts/verify-flow.mjs`.
//
// Follows the existing scripts/*.mjs conventions (plain Node ESM, no extra deps).

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const reportDir = path.join(repoRoot, "report/flow");
const vitestBin = path.join(repoRoot, "node_modules/.bin/vitest");

const fast = process.argv.includes("--fast") || process.env.VERIFY_FAST === "1";

function runVitest(layer, cwd, testFile) {
  const outputFile = path.join(reportDir, `${layer}.vitest.json`);
  rmSync(outputFile, { force: true });
  const run = spawnSync(
    vitestBin,
    ["run", testFile, "--reporter=json", `--outputFile=${outputFile}`],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

  let report;
  try {
    report = JSON.parse(readFileSync(outputFile, "utf8"));
  } catch {
    // vitest could not even produce a report (config/import error): hard fail.
    return {
      layer,
      passed: 0,
      failed: 1,
      failures: [
        {
          id: `${layer}:vitest`,
          expected: "vitest run to produce a JSON report",
          actual: (run.stderr || run.stdout || "vitest did not run").trim().slice(-2000),
          file: testFile,
        },
      ],
    };
  } finally {
    rmSync(outputFile, { force: true });
  }

  const failures = [];
  for (const file of report.testResults ?? []) {
    for (const assertion of file.assertionResults ?? []) {
      if (assertion.status !== "passed" && assertion.status !== "skipped") {
        failures.push({
          id: assertion.fullName || assertion.title,
          expected: "passed",
          actual: assertion.status,
          file: file.name,
        });
      }
    }
  }

  return {
    layer,
    passed: report.numPassedTests ?? 0,
    failed: report.numFailedTests ?? failures.length,
    failures,
  };
}

function runSeamC() {
  const run = spawnSync("node", ["scripts/e2e-seam-c.mjs"], {
    cwd: path.join(repoRoot, "apps/desktop"),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ok = run.status === 0;
  return {
    layer: "seam-c",
    passed: ok ? 1 : 0,
    failed: ok ? 0 : 1,
    failures: ok
      ? []
      : [
          {
            id: "seam-c:playwright",
            expected: "received -> draft -> sent through real IPC + renderer",
            actual: (run.stderr || run.stdout || `exit code ${run.status}`).trim().slice(-2000),
            file: "apps/desktop/scripts/e2e-seam-c.mjs",
          },
        ],
  };
}

function writeReport(name, data) {
  writeFileSync(path.join(reportDir, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`);
}

function main() {
  mkdirSync(reportDir, { recursive: true });

  const layers = [];

  layers.push(runVitest("seam-a", path.join(repoRoot, "packages/pdd"), "src/flow.test.ts"));
  layers.push(runVitest("seam-b", path.join(repoRoot, "apps/desktop"), "src/main/seam-b.test.ts"));

  let seamC;
  if (fast) {
    seamC = { layer: "seam-c", skipped: true };
  } else {
    seamC = runSeamC();
  }
  layers.push(seamC);

  for (const layer of layers) {
    writeReport(layer.layer, layer);
  }

  const ran = layers.filter((layer) => !layer.skipped);
  const allPassed = ran.every((layer) => layer.failed === 0);

  const summary = {
    passed: allPassed,
    mode: fast ? "fast" : "full",
    generatedAt: new Date().toISOString(),
    layers: layers.map((layer) =>
      layer.skipped
        ? { layer: layer.layer, skipped: true }
        : { layer: layer.layer, passed: layer.passed, failed: layer.failed },
    ),
    failures: ran.flatMap((layer) =>
      layer.failures.map((failure) => ({ ...failure, layer: layer.layer })),
    ),
  };
  writeReport("summary", summary);

  for (const layer of layers) {
    if (layer.skipped) {
      console.log(`${layer.layer}: skipped`);
    } else {
      const status = layer.failed === 0 ? "PASS" : "FAIL";
      console.log(`${layer.layer}: ${status} (${layer.passed} passed, ${layer.failed} failed)`);
    }
  }
  console.log(
    `verdict: ${allPassed ? "PASS" : "FAIL"} (${summary.mode} mode) -> ${path.join(reportDir, "summary.json")}`,
  );

  process.exit(allPassed ? 0 : 1);
}

main();
