import { mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";

type SpawnLike = typeof nodeSpawn;

export interface VllmStartConfig {
  command: string;
  modelPath: string;
  port: number;
  host?: string;
}

export class VllmManager {
  private process: ChildProcess | undefined;

  constructor(private readonly options: { spawn?: SpawnLike } = {}) {}

  async start(config: VllmStartConfig): Promise<{ running: boolean; pid?: number }> {
    if (this.process?.pid) {
      return { running: true, pid: this.process.pid };
    }
    const spawn = this.options.spawn ?? nodeSpawn;
    this.process = spawn(config.command, ["serve", config.modelPath, "--port", String(config.port), "--host", config.host ?? "127.0.0.1"], {
      stdio: "pipe",
      env: process.env,
    });
    return { running: true, ...(this.process.pid ? { pid: this.process.pid } : {}) };
  }

  async stop(): Promise<void> {
    this.process?.kill();
    this.process = undefined;
  }

  status(): { running: boolean; pid?: number } {
    return this.process?.pid ? { running: true, pid: this.process.pid } : { running: false };
  }
}

export class ModelScopeManager {
  constructor(private readonly options: { cacheDir: string; spawn?: SpawnLike }) {}

  async ensureModel(modelId: string): Promise<string> {
    const localDir = path.join(this.options.cacheDir, safeModelDir(modelId));
    await mkdir(localDir, { recursive: true });
    await new Promise<void>((resolve, reject) => {
      const spawn = this.options.spawn ?? nodeSpawn;
      const child = spawn("modelscope", ["download", "--model", modelId, "--local_dir", localDir], { stdio: "pipe", env: process.env });
      child.on("error", reject);
      child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`ModelScope download failed with code ${code}`)));
    });
    return localDir;
  }
}

function safeModelDir(modelId: string): string {
  return modelId.replace(/[^a-zA-Z0-9._-]/g, "__");
}
