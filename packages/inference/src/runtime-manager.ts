import { createHash } from "node:crypto";
import { existsSync, statSync, createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, statfs } from "node:fs/promises";
import path from "node:path";
import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { finished } from "node:stream/promises";

/** Process-spawn function accepted for production use and deterministic tests. */
type SpawnLike = typeof nodeSpawn;

/** Generous default deadline for downloading one complete model response. */
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 2 * 60 * 60 * 1_000;

/** Signals a child process and resolves when it exits or the grace period expires. */
function terminateAndWait(child: ChildProcess, signal: NodeJS.Signals, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exited: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      child.off("error", onError);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const onError = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", onExit);
    child.once("error", onError);
    try {
      if (!child.kill(signal)) {
        finish(child.exitCode != null || child.signalCode != null);
      }
    } catch {
      finish(false);
    }
  });
}

/** Complete launch identity for one managed inference process. */
export interface RuntimeProcessStartConfig {
  command: string;
  modelPath: string;
  port: number;
  host?: string;
  args?: string[];
}

/** Owns the single app-managed local inference child process. */
export class RuntimeProcessManager {
  private process: ChildProcess | undefined;
  private processFingerprint: string | undefined;
  private lastStderr = "";
  private lifecycle: Promise<void> = Promise.resolve();

  /**
   * Creates a manager for one owned child process.
   *
   * @param options Optional process-spawn override for tests.
   */
  constructor(private readonly options: { spawn?: SpawnLike } = {}) {}

  /**
   * Starts or reuses the exactly matching runtime after prior lifecycle work settles.
   *
   * @param config Complete runtime launch identity.
   * @returns The running state and child PID when available.
   */
  start(config: RuntimeProcessStartConfig): Promise<{ running: boolean; pid?: number }> {
    return this.enqueueLifecycle(() => this.startNow(config));
  }

  /**
   * Stops the owned runtime after prior lifecycle work settles.
   *
   * @returns A promise resolved only after the child exits.
   * @throws If graceful and forced termination both fail.
   */
  stop(): Promise<void> {
    return this.enqueueLifecycle(() => this.stopNow());
  }

  /** Serializes one lifecycle operation while allowing later work after a failure. */
  private enqueueLifecycle<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.lifecycle.then(operation, operation);
    this.lifecycle = result.then(() => undefined, () => undefined);
    return result;
  }

  /** Starts immediately within the lifecycle queue, replacing a mismatched child. */
  private async startNow(config: RuntimeProcessStartConfig): Promise<{ running: boolean; pid?: number }> {
    const fingerprint = runtimeFingerprint(config);
    if (this.process && this.processFingerprint === fingerprint) {
      return { running: true, ...(this.process.pid ? { pid: this.process.pid } : {}) };
    }
    if (this.process) {
      await this.stopNow();
    }
    const spawn = this.options.spawn ?? nodeSpawn;
    const args = config.args ?? [];
    this.lastStderr = "";
    const child = spawn(config.command, args, {
      stdio: "pipe",
      env: process.env,
    });
    this.process = child;
    this.processFingerprint = fingerprint;
    // llama-server logs verbosely to stdout/stderr while loading the model. With
    // stdio "pipe" and no reader the OS pipe buffer fills (~64KB) and the child
    // blocks mid-load, so the model never comes up. Drain both streams, keeping a
    // tail of stderr so a failed start surfaces a real error instead of a timeout.
    child.stdout?.on("data", () => {});
    child.stderr?.on("data", (chunk: Buffer | string) => {
      this.lastStderr = (this.lastStderr + chunk.toString()).slice(-4000);
    });
    child.on("error", (error: Error) => {
      this.lastStderr = `${this.lastStderr}\n${error.message}`.slice(-4000);
      if (this.process === child) {
        this.process = undefined;
        this.processFingerprint = undefined;
      }
    });
    child.on("exit", () => {
      if (this.process === child) {
        this.process = undefined;
        this.processFingerprint = undefined;
      }
    });
    return { running: true, ...(child.pid ? { pid: child.pid } : {}) };
  }

  /** Stops immediately within the lifecycle queue and retains ownership on failure. */
  private async stopNow(): Promise<void> {
    const child = this.process;
    if (!child) {
      return;
    }
    const exited = await terminateAndWait(child, "SIGTERM", 3_000);
    const killed = exited || await terminateAndWait(child, "SIGKILL", 500);
    if (!killed) {
      throw new Error(`本地运行时进程 ${child.pid ?? "unknown"} 无法停止。`);
    }
    if (this.process === child) {
      this.process = undefined;
      this.processFingerprint = undefined;
    }
  }

  /** Returns the current owned-process state. */
  status(): { running: boolean; pid?: number } {
    return this.process?.pid ? { running: true, pid: this.process.pid } : { running: false };
  }

  /** Returns the bounded stderr tail from the most recent runtime process. */
  lastError(): string | undefined {
    return this.lastStderr.trim() || undefined;
  }
}

/** Builds a stable identity for deciding whether a running process is reusable. */
function runtimeFingerprint(config: RuntimeProcessStartConfig): string {
  return JSON.stringify([
    config.command,
    config.modelPath,
    config.host ?? "",
    config.port,
    config.args ?? [],
  ]);
}

/** Provisions approved remote model artifacts into an app-owned cache. */
export class ModelScopeManager {
  private readonly inFlight = new Map<string, InFlightDownload>();
  private readonly downloadControllers = new Set<AbortController>();

  /**
   * Creates a model cache with optional disk and download-deadline policies.
   *
   * @param options Cache location and optional testable resource policies.
   */
  constructor(
    private readonly options: {
      cacheDir: string;
      getAvailableBytes?: (dir: string) => Promise<number>;
      downloadTimeoutMs?: number;
    },
  ) {}

  /**
   * Returns a cached model or performs one shared verified download.
   *
   * @param modelId Local path or remote model URL.
   * @param options Verification, progress, cancellation, and timeout options.
   * @returns The verified local model path.
   * @throws If validation, download, cancellation, timeout, or verification fails.
   */
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

    const key = `${trimmed}:${resolvedOptions.expectedSha256 ?? ""}`;
    const existing = this.inFlight.get(key);
    if (existing) {
      const stopCancellation = scheduleDownloadCancellation(
        existing.controller,
        resolvedOptions.signal,
        resolveDownloadTimeoutMs(resolvedOptions.timeoutMs ?? this.options.downloadTimeoutMs),
      );
      try {
        const modelPath = await existing.promise;
        emitCachedProgress(modelPath, resolvedOptions.onProgress);
        return modelPath;
      } finally {
        stopCancellation();
      }
    }

    const controller = new AbortController();
    const stopCancellation = scheduleDownloadCancellation(
      controller,
      resolvedOptions.signal,
      resolveDownloadTimeoutMs(resolvedOptions.timeoutMs ?? this.options.downloadTimeoutMs),
    );
    const download = this.downloadModel(trimmed, { ...resolvedOptions, signal: controller.signal });
    const entry = { controller, promise: download };
    this.inFlight.set(key, entry);
    this.downloadControllers.add(controller);
    try {
      return await download;
    } finally {
      stopCancellation();
      this.downloadControllers.delete(controller);
      if (this.inFlight.get(key) === entry) {
        this.inFlight.delete(key);
      }
    }
  }

  /**
   * Cancels every active download while preserving resumable partial files.
   *
   * @returns Nothing; active ensureModel calls reject asynchronously.
   */
  cancelDownloads(): void {
    for (const controller of this.downloadControllers) {
      if (!controller.signal.aborted) {
        controller.abort(new Error("模型下载已取消。"));
      }
    }
  }

  /** Removes retired artifacts and stale partials while no transfer is active. */
  async pruneCache(
    allowedModelIds: string[],
    options: { maxPartialAgeMs?: number } = {},
  ): Promise<number> {
    if (this.inFlight.size > 0) {
      return 0;
    }
    const cacheDir = path.join(this.options.cacheDir, "downloads");
    if (!existsSync(cacheDir)) {
      return 0;
    }
    const allowedFiles = new Set(
      allowedModelIds.filter(isRemoteModel).map(modelFileName),
    );
    const maxPartialAgeMs = Math.max(0, options.maxPartialAgeMs ?? 24 * 60 * 60 * 1_000);
    const now = Date.now();
    let deleted = 0;
    for (const entry of await readdir(cacheDir, { withFileTypes: true })) {
      const candidate = path.join(cacheDir, entry.name);
      const isPartial = entry.name.endsWith(".part");
      const baseName = isPartial ? entry.name.slice(0, -".part".length) : entry.name;
      const retired = !allowedFiles.has(baseName);
      let stalePartial = false;
      try {
        stalePartial = isPartial && (maxPartialAgeMs === 0 || now - statSync(candidate).mtimeMs >= maxPartialAgeMs);
      } catch {
        stalePartial = true;
      }
      if (entry.isDirectory() || retired || stalePartial || entry.name.endsWith(".bad")) {
        await rm(candidate, { recursive: entry.isDirectory(), force: true });
        deleted += 1;
      }
    }
    return deleted;
  }

  /** Downloads and verifies one remote model after the single-flight guard. */
  private async downloadModel(modelId: string, options: ActiveEnsureModelOptions): Promise<string> {
    const trimmed = modelId.trim();
    throwIfDownloadAborted(options.signal);

    const cacheDir = path.join(this.options.cacheDir, "downloads");
    await mkdir(cacheDir, { recursive: true });
    throwIfDownloadAborted(options.signal);

    const filePath = path.join(cacheDir, modelFileName(trimmed));
    if (existsSync(filePath)) {
      const cachedValid = await verifyExistingModelFile(filePath, options.expectedSha256);
      throwIfDownloadAborted(options.signal);
      if (cachedValid) {
        emitCachedProgress(filePath, options.onProgress);
        return filePath;
      }
      await rm(filePath, { force: true });
    }

    const partialPath = `${filePath}.part`;
    const partialBytes = existingFileSize(partialPath);
    const response = await raceWithAbort(fetch(trimmed, {
      ...(partialBytes > 0 ? { headers: { Range: `bytes=${partialBytes}-` } } : {}),
      signal: options.signal,
    }), options.signal);
    throwIfDownloadAborted(options.signal);
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
    throwIfDownloadAborted(options.signal);
    await writeResponseBodyWithProgress(response, partialPath, options.signal, options.onProgress, startingBytes, totalBytes, canAppend);
    throwIfDownloadAborted(options.signal);
    try {
      await verifyFileChecksum(partialPath, options.expectedSha256);
    } catch (error) {
      if (options.signal.aborted) {
        throw downloadAbortError(options.signal);
      }
      await rm(partialPath, { force: true });
      throw error;
    }
    throwIfDownloadAborted(options.signal);
    await rename(partialPath, filePath);
    return filePath;
  }

  /** Deletes an app-cached remote model and its resumable partial file. */
  async deleteModel(modelId: string): Promise<boolean> {
    const trimmed = modelId.trim();
    if (!trimmed || !isRemoteModel(trimmed)) {
      return false;
    }

    const cacheDir = path.join(this.options.cacheDir, "downloads");
    const filePath = path.join(cacheDir, modelFileName(trimmed));
    const partialPath = `${filePath}.part`;
    const existed = isExistingFile(filePath) || isExistingFile(partialPath);
    await Promise.all([
      rm(filePath, { force: true }),
      rm(partialPath, { force: true }),
    ]);
    return existed;
  }
}

/** One shared remote-model transfer and its cancellation controller. */
interface InFlightDownload {
  controller: AbortController;
  promise: Promise<string>;
}

/** Internal options after a shared transfer receives its controller signal. */
type ActiveEnsureModelOptions = EnsureModelOptions & { signal: AbortSignal };

/** Byte-level model-download progress reported to desktop callers. */
export interface ModelDownloadProgress {
  receivedBytes: number;
  totalBytes?: number;
  percent?: number;
}

/** Verification, progress, cancellation, and deadline options for one model request. */
export interface EnsureModelOptions {
  expectedSha256?: string;
  onProgress?: (progress: ModelDownloadProgress) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Streams a response into a resumable file and closes the writer before returning. */
async function writeResponseBodyWithProgress(
  response: Response,
  filePath: string,
  signal: AbortSignal,
  onProgress?: (progress: ModelDownloadProgress) => void,
  startingBytes = 0,
  totalBytes = parseContentLength(response.headers.get("content-length")),
  append = false,
): Promise<void> {
  let receivedBytes = startingBytes;
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error(`模型下载失败：响应体不可读取`);
  }
  const destination = createWriteStream(filePath, { flags: append ? "a" : "w" });
  const destinationFinished = finished(destination).then(() => undefined, (error: unknown) => error);
  const cancelReader = () => {
    void reader.cancel(signal.reason).catch(() => undefined);
  };
  signal.addEventListener("abort", cancelReader, { once: true });
  let failure: unknown;

  try {
    throwIfDownloadAborted(signal);
    onProgress?.(buildProgress(receivedBytes, totalBytes));
    while (true) {
      const { done, value } = await raceWithAbort(reader.read(), signal);
      if (done) {
        break;
      }
      const chunk = Buffer.from(value);
      receivedBytes += chunk.byteLength;
      if (!destination.write(chunk)) {
        await raceWithAbort(new Promise<void>((resolve) => destination.once("drain", resolve)), signal);
      }
      onProgress?.(buildProgress(receivedBytes, totalBytes));
    }
  } catch (error) {
    failure = signal.aborted ? downloadAbortError(signal) : error;
  } finally {
    signal.removeEventListener("abort", cancelReader);
    destination.end();
    const destinationError = await destinationFinished;
    if (destinationError) {
      failure ??= destinationError;
    }
  }

  if (failure) {
    throw failure;
  }
  throwIfDownloadAborted(signal);
}

/** Connects caller cancellation and a finite deadline to one shared transfer. */
function scheduleDownloadCancellation(
  controller: AbortController,
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): () => void {
  const cancelFromCaller = () => {
    if (!controller.signal.aborted) {
      controller.abort(new Error("模型下载已取消。"));
    }
  };
  if (callerSignal?.aborted) {
    cancelFromCaller();
  } else {
    callerSignal?.addEventListener("abort", cancelFromCaller, { once: true });
  }
  const timeout = setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort(new Error(`模型下载超时（${timeoutMs}ms）。`));
    }
  }, timeoutMs);
  timeout.unref?.();
  return () => {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", cancelFromCaller);
  };
}

/** Normalizes caller configuration to a positive finite download deadline. */
function resolveDownloadTimeoutMs(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_DOWNLOAD_TIMEOUT_MS;
}

/** Awaits an operation while guaranteeing prompt rejection after cancellation. */
function raceWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  try {
    throwIfDownloadAborted(signal);
  } catch (error) {
    return Promise.reject(error);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(downloadAbortError(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(signal.aborted ? downloadAbortError(signal) : error);
      },
    );
  });
}

/** Throws the stable cancellation or timeout reason carried by a download signal. */
function throwIfDownloadAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw downloadAbortError(signal);
  }
}

/** Converts an AbortSignal reason into the stable Error contract used by callers. */
function downloadAbortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("模型下载已取消。");
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
