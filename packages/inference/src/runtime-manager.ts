import { createHash } from "node:crypto";
import { existsSync, statSync, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";

type SpawnLike = typeof nodeSpawn;

export interface RuntimeProcessStartConfig {
  command: string;
  modelPath: string;
  port: number;
  host?: string;
  args?: string[];
}

export class RuntimeProcessManager {
  private process: ChildProcess | undefined;

  constructor(private readonly options: { spawn?: SpawnLike } = {}) {}

  async start(config: RuntimeProcessStartConfig): Promise<{ running: boolean; pid?: number }> {
    if (this.process?.pid) {
      return { running: true, pid: this.process.pid };
    }
    const spawn = this.options.spawn ?? nodeSpawn;
    const args = config.args ?? [];
    this.process = spawn(config.command, args, {
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
  constructor(
    private readonly options: {
      cacheDir: string;
    },
  ) {}

  async ensureModel(modelId: string): Promise<string> {
    const trimmed = modelId.trim();
    if (!trimmed) {
      throw new Error("模型标识不能为空");
    }

    if (isExistingFile(trimmed)) {
      return trimmed;
    }

    if (!isRemoteModel(trimmed)) {
      throw new Error("当前仅支持本地文件路径或 HTTPS 模型文件地址，请填写 .gguf 模型文件路径。");
    }

    const cacheDir = path.join(this.options.cacheDir, "downloads");
    await mkdir(cacheDir, { recursive: true });

    const filePath = path.join(cacheDir, modelFileName(trimmed));
    if (existsSync(filePath)) {
      return filePath;
    }

    const response = await fetch(trimmed);
    if (!response.ok) {
      throw new Error(`模型下载失败（${trimmed}）：HTTP ${response.status}`);
    }
    if (!response.body) {
      throw new Error(`模型下载失败（${trimmed}）：响应体为空`);
    }

    const destination = createWriteStream(filePath);
    const source = response.body as unknown as NodeJS.ReadableStream;
    await pipeline(source, destination);
    return filePath;
  }
}

function isExistingFile(value: string): boolean {
  try {
    return existsSync(value) && statSync(value).isFile();
  } catch {
    return false;
  }
}

function isRemoteModel(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function safeModelName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function modelFileName(modelUrl: string): string {
  const parsed = new URL(modelUrl);
  const base = path.basename(parsed.pathname) || "model.gguf";
  const safeBase = safeModelName(base);
  const digest = hashText(modelUrl);
  return `${safeBase}.${digest}`;
}

function hashText(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}
