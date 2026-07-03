/* global console, process */

import { readFileSync } from "node:fs";
import { URL } from "node:url";

const PLACEHOLDER_UPDATE_URLS = new Set([
  "https://updates.example.invalid/customer-agent/",
  "https://updates.example.invalid/customer-agent",
]);

function fail(message) {
  throw new Error(`RELEASE_PREFLIGHT_FAILED: ${message}`);
}

function isNonProductionCi() {
  return (
    process.argv.some((arg) => arg.includes("non-production-ci")) ||
    process.env.CI_NON_PRODUCTION === "true" ||
    process.env.npm_config_ci_non_production === "true" ||
    (process.env.npm_lifecycle_event?.endsWith(":ci") ?? false)
  );
}

function assertProductionUpdateUrl() {
  const updateUrl = process.env.UPDATE_URL ?? process.env.ELECTRON_BUILDER_PUBLISH_URL ?? readConfiguredUpdateUrl();
  if (!updateUrl) {
    fail("missing production update URL configuration; set UPDATE_URL or ELECTRON_BUILDER_PUBLISH_URL.");
  }
  if (PLACEHOLDER_UPDATE_URLS.has(updateUrl)) {
    fail(`placeholder production update URL detected (${updateUrl}); replace it before packaging production artifacts.`);
  }
}

function readConfiguredUpdateUrl() {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  return packageJson.build?.publish?.url ?? "";
}

function assertMacSigningEnv() {
  const required = ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    fail(`missing macOS signing/notarization environment values: ${missing.join(", ")}.`);
  }
}

function assertNoPddCredentialsInCi() {
  const disallowed = Object.keys(process.env).filter((key) => /^PDD_|PINDUODUO_/i.test(key));
  if (disallowed.length > 0) {
    fail(`PDD credentials/session material must not be configured in CI: ${disallowed.sort().join(", ")}.`);
  }
}

const nonProductionCi = isNonProductionCi();
const packagingMode = process.env.ELECTRON_PACKAGE_MODE ?? "production";
const platform = process.env.ELECTRON_BUILDER_PLATFORM ?? process.platform;

if (process.env.GITHUB_ACTIONS === "true" || process.env.CI === "true") {
  assertNoPddCredentialsInCi();
}

if (!nonProductionCi) {
  assertProductionUpdateUrl();
}

if (!nonProductionCi && platform === "darwin" && packagingMode === "signed") {
  assertMacSigningEnv();
}

console.log(
  `Release preflight passed (${nonProductionCi ? "non-production-ci" : "production"}, platform=${platform}, mode=${packagingMode})`,
);
