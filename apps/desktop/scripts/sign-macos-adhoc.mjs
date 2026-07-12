import { execFile } from "node:child_process";
import { log } from "node:console";
import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

/** Promise-based process runner used for native macOS signing. */
const execFileAsync = promisify(execFile);

/** Re-signs local macOS directory packages so every nested Electron binary has one ad-hoc identity. */
async function signMacosDirectoryPackage() {
  if (process.platform !== "darwin") {
    return;
  }
  const releaseDir = path.resolve("release");
  const outputDirs = (await readdir(releaseDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("mac"))
    .map((entry) => path.join(releaseDir, entry.name));
  for (const outputDir of outputDirs) {
    const appName = (await readdir(outputDir)).find((name) => name.endsWith(".app"));
    if (!appName) {
      continue;
    }
    const appPath = path.join(outputDir, appName);
    await execFileAsync("codesign", ["--force", "--deep", "--sign", "-", appPath]);
    await execFileAsync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
    log(`Ad-hoc signed local package: ${appPath}`);
  }
}

await signMacosDirectoryPackage();
