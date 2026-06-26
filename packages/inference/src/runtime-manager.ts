import { createHash } from "node:crypto";
import { existsSync, statSync, createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, statfs } from "node:fs/promises";
import path from "node:path";
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
      getAvailableBytes?: (dir: string) => Promise<number>;
    },
  ) {}

  async ensureModel(modelId: string, options: EnsureModelOptions | string = {}): Promise<string> {
    const resolvedOptions = typeof options === "string" ? { expectedSha256: options } : options;
    const trimmed = modelId.trim();
    if (!trimmed) {
      throw new Error("模型标识不能为空");
    }

    if (isExistingFile(trimmed)) {
      emitCachedProgress(trimmed, resolvedOptions.onProgress);
      return trimmed;
    }

    if (!isRemoteModel(trimmed)) {
      throw new Error("当前仅支持本地文件路径或 HTTPS 模型文件地址，请填写 .gguf 模型文件路径。");
    }

    const cacheDir = path.join(this.options.cacheDir, "downloads");
    await mkdir(cacheDir, { recursive: true });

    const filePath = path.join(cacheDir, modelFileName(trimmed));
    if (existsSync(filePath)) {
      const cachedValid = await verifyExistingModelFile(filePath, resolvedOptions.expectedSha256);
      if (cachedValid) {
        emitCachedProgress(filePath, resolvedOptions.onProgress);
        return filePath;
      }
      await rm(filePath, { force: true });
    }

    const partialPath = `${filePath}.part`;
    const partialBytes = existingFileSize(partialPath);
    const response = partialBytes > 0
      ? await fetch(trimmed, { headers: { Range: `bytes=${partialBytes}-` } })
      : await fetch(trimmed);
    if (!response.ok) {
      throw new Error(`模型下载失败（${trimmed}）：HTTP ${response.status}`);
    }
    if (!response.body) {
      throw new Error(`模型下载失败（${trimmed}）：响应体为空`);
    }

    const canAppend = partialBytes > 0 && response.status === 206;
    if (partialBytes > 0 && !canAppend) {
      await rm(partialPath, { force: true });
    }
    const startingBytes = canAppend ? partialBytes : 0;
    const totalBytes = parseTotalBytes(response, startingBytes);
    await assertAvailableDiskSpace(cacheDir, Math.max(0, (totalBytes ?? 0) - startingBytes), this.options.getAvailableBytes);
    await writeResponseBodyWithProgress(response, partialPath, resolvedOptions.onProgress, startingBytes, totalBytes, canAppend);
    await rename(partialPath, filePath);
    await verifyFileChecksum(filePath, resolvedOptions.expectedSha256);
    return filePath;
  }
}

export interface ModelDownloadProgress {
  receivedBytes: number;
  totalBytes?: number;
  percent?: number;
}

export interface EnsureModelOptions {
  expectedSha256?: string;
  onProgress?: (progress: ModelDownloadProgress) => void;
}

async function writeResponseBodyWithProgress(
  response: Response,
  filePath: string,
  onProgress?: (progress: ModelDownloadProgress) => void,
  startingBytes = 0,
  totalBytes = parseContentLength(response.headers.get("content-length")),
  append = false,
): Promise<void> {
  let receivedBytes = startingBytes;
  const destination = createWriteStream(filePath, { flags: append ? "a" : "w" });
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error(`模型下载失败：响应体不可读取`);
  }

  try {
    onProgress?.(buildProgress(receivedBytes, totalBytes));
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const chunk = Buffer.from(value);
      receivedBytes += chunk.byteLength;
      if (!destination.write(chunk)) {
        await new Promise<void>((resolve) => destination.once("drain", resolve));
      }
      onProgress?.(buildProgress(receivedBytes, totalBytes));
    }
  } finally {
    destination.end();
  }

  await new Promise<void>((resolve, reject) => {
    destination.once("finish", resolve);
    destination.once("error", reject);
  });
}

function parseTotalBytes(response: Response, startingBytes: number): number | undefined {
  const contentRange = response.headers.get("content-range");
  const rangeMatch = /\/(\d+)$/u.exec(contentRange ?? "");
  if (rangeMatch) {
    return Number(rangeMatch[1]);
  }
  const contentLength = parseContentLength(response.headers.get("content-length"));
  return contentLength === undefined ? undefined : contentLength + startingBytes;
}

async function assertAvailableDiskSpace(
  dir: string,
  requiredBytes: number,
  getAvailableBytes: ((dir: string) => Promise<number>) | undefined,
): Promise<void> {
  if (requiredBytes <= 0) {
    return;
  }
  const availableBytes = getAvailableBytes ? await getAvailableBytes(dir) : await getFsAvailableBytes(dir);
  if (availableBytes < requiredBytes) {
    throw new Error("模型下载空间不足，请释放磁盘空间后重试。");
  }
}

async function getFsAvailableBytes(dir: string): Promise<number> {
  const stats = await statfs(dir);
  return stats.bavail * stats.bsize;
}

function emitCachedProgress(filePath: string, onProgress?: (progress: ModelDownloadProgress) => void): void {
  if (!onProgress) {
    return;
  }
  const size = statSync(filePath).size;
  onProgress(buildProgress(size, size));
}

function buildProgress(receivedBytes: number, totalBytes?: number): ModelDownloadProgress {
  return {
    receivedBytes,
    ...(totalBytes === undefined ? {} : { totalBytes }),
    ...(totalBytes ? { percent: Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) } : {}),
  };
}

function parseContentLength(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function verifyFileChecksum(filePath: string, expectedSha256?: string): Promise<void> {
  if (!expectedSha256) {
    return;
  }
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  const actual = hash.digest("hex");
  if (actual !== expectedSha256.toLowerCase()) {
    throw new Error("模型文件校验失败，请重新下载或更换模型档案。");
  }
}

async function verifyExistingModelFile(filePath: string, expectedSha256?: string): Promise<boolean> {
  try {
    await verifyFileChecksum(filePath, expectedSha256);
    return true;
  } catch {
    return false;
  }
}

function isExistingFile(value: string): boolean {
  try {
    return existsSync(value) && statSync(value).isFile();
  } catch {
    return false;
  }
}

function existingFileSize(value: string): number {
  try {
    return existsSync(value) && statSync(value).isFile() ? statSync(value).size : 0;
  } catch {
    return 0;
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
