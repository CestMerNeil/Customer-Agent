/* global console, process */
import { spawn, spawnSync } from "node:child_process";
import electronPath from "electron";
import { createServer } from "vite";

const children = new Set();
const smokeMode = process.argv.includes("--smoke");

function spawnManaged(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    ...options,
  });

  children.add(child);
  child.on("exit", () => {
    children.delete(child);
  });

  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    child.kill();
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const buildResult = spawnSync("tsc", ["-p", "tsconfig.build.json"], {
  cwd: process.cwd(),
  stdio: "inherit",
});

if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1);
}

const server = await createServer({
  configFile: "vite.renderer.config.ts",
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false,
  },
});

await server.listen();
server.printUrls();

const address = server.httpServer?.address();
const port = typeof address === "object" && address ? address.port : 5173;
const devServerUrl = `http://127.0.0.1:${port}`;

children.add({
  kill: () => {
    void server.close();
  },
});

if (smokeMode) {
  console.log(`Dev server smoke URL: ${devServerUrl}`);
  await server.close();
  process.exit(0);
}

spawnManaged("tsc", ["-p", "tsconfig.build.json", "--watch", "--preserveWatchOutput", "false"], {
  cwd: process.cwd(),
});

const electron = spawnManaged(electronPath, ["."], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: devServerUrl,
  },
});

electron.on("exit", (code) => {
  shutdown(code ?? 0);
});
