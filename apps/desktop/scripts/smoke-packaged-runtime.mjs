import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { clearInterval, clearTimeout, setInterval, setTimeout } from "node:timers";

/** Fails the release smoke with a recognizable diagnostic. */
function fail(message) {
  throw new Error(`RELEASE_BLOCKING_DIAGNOSTIC: ${message}`);
}

/** Resolves a smoke input relative to the original pnpm invocation directory. */
function resolveInput(input) {
  return path.isAbsolute(input) ? input : path.resolve(process.env.INIT_CWD ?? process.cwd(), input);
}

/** Waits for a condition while also failing when the packaged process exits early. */
function waitForCondition(child, condition, timeoutMs, description) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (condition()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for ${description}.`));
      }
    }, 100);
    child.once("exit", (code) => {
      if (!condition()) {
        clearInterval(timer);
        reject(new Error(`Packaged app exited before ${description} (code ${code ?? "unknown"}).`));
      }
    });
  });
}

/** Waits for the packaged process to terminate cleanly after emitting readiness. */
function waitForCleanExit(child, timeoutMs) {
  if (child.exitCode !== null) {
    return child.exitCode === 0 ? Promise.resolve() : Promise.reject(new Error(`Packaged app exited with code ${child.exitCode}.`));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Packaged app did not exit cleanly after readiness.")), timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Packaged app exited with code ${code ?? "unknown"}.`));
    });
  });
}

/** Launches the packaged app against temporary user data and verifies ready-and-clean-exit behavior. */
async function runPackagedSmoke() {
  if (process.env.APP_PACKAGED !== "true") fail("packaged runtime smoke requires APP_PACKAGED=true.");
  const resourcesPath = process.env.RESOURCES_PATH;
  const executablePath = process.env.APP_EXECUTABLE;
  if (!resourcesPath) fail("packaged runtime smoke requires RESOURCES_PATH.");
  if (!executablePath) fail("packaged runtime smoke requires APP_EXECUTABLE.");

  const resourcesRoot = resolveInput(resourcesPath);
  const executable = resolveInput(executablePath);
  for (const requiredPath of [executable, path.join(resourcesRoot, "playwright-browsers"), path.join(resourcesRoot, "app-update.yml")]) {
    if (!existsSync(requiredPath)) fail(`missing packaged runtime input: ${requiredPath}`);
  }

  const smokeDir = await mkdtemp(path.join(os.tmpdir(), "customer-agent-packaged-smoke-"));
  const readyFile = path.join(smokeDir, "ready.json");
  try {
    const child = spawn(executable, [`--user-data-dir=${path.join(smokeDir, "user-data")}`], {
      env: { ...process.env, CUSTOMER_AGENT_PACKAGED_SMOKE_READY_FILE: readyFile },
      stdio: "inherit",
    });
    await waitForCondition(child, () => existsSync(readyFile), 20_000, "the packaged ready signal");
    const ready = JSON.parse(await readFile(readyFile, "utf8"));
    if (ready.ready !== true) fail("packaged ready signal was malformed.");
    await waitForCleanExit(child, 10_000);
    process.stdout.write(`Packaged app launched and exited cleanly (version ${ready.version}).\n`);
  } finally {
    await rm(smokeDir, { force: true, recursive: true });
  }
}

await runPackagedSmoke();
