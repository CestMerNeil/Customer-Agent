import { app, BrowserWindow, dialog, ipcMain, safeStorage } from "electron";
import { createHash } from "node:crypto";
import { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createReadStream, createWriteStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  AccountRecord,
  IpcChannel,
  IpcRequest,
  IpcResponse,
  InferenceRuntimeConfig,
  AppSettings,
  DependencyId,
  ProductSyncProgress,
} from "@customer-agent/core";
import {
  createReleaseCapabilityMatrix,
  DependencyGovernor,
  getLocalModelProfileForRuntime,
  localModelProfiles,
  normalizeLocalRuntimeConfig,
  validateAcceptanceRecordSet,
} from "@customer-agent/core";
import type { AcceptanceRecord } from "@customer-agent/core";
import { SqliteAppStore } from "@customer-agent/db";
import { ModelScopeManager, RuntimeProcessManager, OpenAICompatibleClient } from "@customer-agent/inference";
import type { ModelDownloadProgress, MultimodalChatRequest, ResponseModelRequest, ResponseModelResult } from "@customer-agent/inference";
import { PddApi, PddBrowserHttpClient, PddHttpClient, PddProductSyncService, PddService, parseCookieJar, resolvePddProfileDir, withPddBrowserProfileLock } from "@customer-agent/pdd";
import type { ProductKnowledgeExtractionInput, ProductKnowledgeExtractionResult } from "@customer-agent/pdd";
import { appendDiagnostic, generateAndPersistReply, recordPddSendSuccess, runInboundHandlerChain, sanitizeUserFacingError } from "./reply.js";
import { extractKnowledgeEntries } from "./knowledge-extract.js";
import { readDocumentText } from "./document-ingestion.js";
import { DocumentHandles } from "./document-handles.js";
import { checkForAppUpdates, getAppUpdateStatus, installDownloadedAppUpdate, setupAppUpdater } from "./updater.js";
import { applyWindowSecurity, isTrustedRendererUrl, resolveDevServerUrl } from "./window-security.js";
import { resolveModelProvider, resolveModelProviderConfig, type ModelProviderCapability } from "./model-provider.js";
import {
  sanitizeRendererSettingsUpdate,
  toRendererAccount,
  toRendererModelDownloadResult,
  toRendererRuntimePrepareResult,
  toRendererRuntimeStatus,
  toRendererSettings,
} from "./renderer-boundary.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
const windowIconPath = app.isPackaged
  ? path.join(process.resourcesPath, "icon.png")
  : path.join(dirname, "../../build/icon.png");

let storePromise: Promise<SqliteAppStore> | undefined;
let pddService: PddService | undefined;
let runtimeProcessManager: RuntimeProcessManager | undefined;
let modelScopeManager: ModelScopeManager | undefined;
let modelScopeManagerCommand: string | undefined;
let inboundQueueTask: Promise<void> | undefined;
let inboundQueueWakeup: NodeJS.Timeout | undefined;
let isShuttingDown = false;
let shutdownComplete = false;
let shutdownPromise: Promise<void> | undefined;
let runtimeStartGeneration = 0;
let runtimeProvisionController = new AbortController();
const dependencyGovernor = new DependencyGovernor();
const productSyncRuns = new Map<string, ProductSyncProgress>();
const productSyncControllers = new Map<string, AbortController>();
const productSyncTasks = new Map<string, Promise<void>>();
const productSyncAccountRuns = new Map<string, string>();
const pddBrowserContexts = new Set<{ close(): Promise<void> }>();
const activeIpcTasks = new Set<Promise<unknown>>();
const documentHandles = new DocumentHandles();
let mainWindow: BrowserWindow | undefined;
const MAX_PRODUCT_SYNC_HISTORY = 20;
const rendererEntryUrl = pathToFileURL(path.join(dirname, "../renderer/index.html"));
const hasSingleInstanceLock = app.requestSingleInstanceLock();

const DEFAULT_RUNTIME: InferenceRuntimeConfig = {
  runtimeKind: "managed_llama_server",
  modelId: "",
  modelPath: "",
  command: "llama-server",
  host: "127.0.0.1",
  port: 8000,
};
const RUNTIME_BINARY_NAME = "llama-server";
const RUNTIME_DOWNLOAD_TIMEOUT_MS = 30 * 60_000;
const RUNTIME_DOWNLOAD_ENV_PREFIX = "CUSTOMER_AGENT_LLAMA_RUNTIME_URL";
const RUNTIME_DOWNLOAD_CHECKSUM_ENV = "CUSTOMER_AGENT_LLAMA_RUNTIME_SHA256";
const DEFAULT_LLAMA_RUNTIME_DOWNLOADS: Record<string, { url: string; sha256: string }> = {
  "darwin-arm64": {
    url: "https://github.com/ggml-org/llama.cpp/releases/download/b9787/llama-b9787-bin-macos-arm64.tar.gz",
    sha256: "13c859a0c02cd6b24d3d274cf55d81606ef10ba54054c63de91c7df8148902bd",
  },
  "darwin-x64": {
    url: "https://github.com/ggml-org/llama.cpp/releases/download/b9787/llama-b9787-bin-macos-x64.tar.gz",
    sha256: "f55ef24cda5e5a6b0a3f9125279b921706e06c92d0fc1c8dc6598ec72bac5476",
  },
  "win32-x64": {
    url: "https://github.com/ggml-org/llama.cpp/releases/download/b9787/llama-b9787-bin-win-cpu-x64.zip",
    sha256: "4803a35f6bafb2f56fec4280942e14c09c1881129ebb093a46d120523af1c893",
  },
};

function configureBundledPlaywright() {
  const browsersPath = app.isPackaged
    ? path.join(process.resourcesPath, "playwright-browsers")
    : path.join(dirname, "../../build/playwright-browsers");
  if (app.isPackaged && !existsSync(browsersPath)) {
    throw new Error(`RELEASE_BLOCKING_DIAGNOSTIC: packaged Playwright browser runtime missing at ${browsersPath}`);
  }
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
}

/** Opens the application store with Electron's OS-backed protection for its encryption master key. */
function getStore(): Promise<SqliteAppStore> {
  storePromise ??= SqliteAppStore.open(path.join(app.getPath("userData"), "data"), {
    protector: {
      isAvailable: () => safeStorage.isEncryptionAvailable(),
      protect: (value) => safeStorage.encryptString(value),
      unprotect: (value) => safeStorage.decryptString(value),
    },
  });
  return storePromise;
}

function getRuntimeProcessManager(): RuntimeProcessManager {
  runtimeProcessManager ??= new RuntimeProcessManager();
  return runtimeProcessManager;
}

/** Invalidates and aborts every in-flight managed-runtime provisioning request. */
function cancelRuntimeProvisioning(): void {
  runtimeStartGeneration += 1;
  runtimeProvisionController.abort();
  runtimeProvisionController = new AbortController();
  modelScopeManager?.cancelDownloads();
}

/** Captures the current provisioning generation for one runtime-start attempt. */
function captureRuntimeStart(): { generation: number; signal: AbortSignal } {
  if (isShuttingDown) {
    throw new Error("应用正在退出，已取消本地 AI 启动。");
  }
  return {
    generation: runtimeStartGeneration,
    signal: runtimeProvisionController.signal,
  };
}

/** Starts a new user-requested provisioning generation and cancels the previous one. */
function replaceRuntimeProvisioning(): { generation: number; signal: AbortSignal } {
  cancelRuntimeProvisioning();
  return captureRuntimeStart();
}

/** Rejects stale runtime-start work before it can spawn or persist state. */
function assertRuntimeStartCurrent(start: { generation: number; signal: AbortSignal }): void {
  if (isShuttingDown || start.signal.aborted || start.generation !== runtimeStartGeneration) {
    throw new Error("本地 AI 启动已取消。");
  }
}

function getRuntimeDataDir(): string {
  return path.join(app.getPath("userData"), "runtime-models");
}

function getRuntimeCachePath(binary: string): string {
  const binaryName = getRuntimeBinaryName(binary);
  const platformDir = `${process.platform}-${process.arch}`;
  return path.join(getRuntimeDataDir(), "binaries", platformDir, `${binaryName}.dist`, binaryName);
}

function getRuntimeInstallDir(binary: string): string {
  const binaryName = getRuntimeBinaryName(binary);
  const platformDir = `${process.platform}-${process.arch}`;
  return path.join(getRuntimeDataDir(), "binaries", platformDir, `${binaryName}.dist`);
}

function getBundledRuntimePath(binary: string): string | undefined {
  const binaryName = getRuntimeBinaryName(binary);
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, "runtime", binaryName)]
    : [path.join(dirname, "../../runtime", binaryName), path.join(app.getPath("userData"), "runtime", binaryName)];

  return candidates.find((candidate) => existsSync(candidate));
}

function getRuntimeBinaryName(command: string): string {
  const fileName = path.basename(command);
  if (process.platform === "win32" && !fileName.toLowerCase().endsWith(".exe")) {
    return `${fileName}.exe`;
  }
  return fileName;
}

function getRuntimeDownloadCandidate(requestedUrl?: string, requestedArch?: string): string | undefined {
  if (requestedUrl?.trim()) {
    return requestedUrl.trim();
  }

  const platformSuffix = requestedArch
    ? `${process.platform.toUpperCase()}_${requestedArch.toUpperCase()}`
    : `${process.platform.toUpperCase()}_${process.arch.toUpperCase()}`;
  const envKey = `${RUNTIME_DOWNLOAD_ENV_PREFIX}_${platformSuffix}`;
  return process.env[envKey]?.trim()
    || process.env[RUNTIME_DOWNLOAD_ENV_PREFIX]?.trim()
    || DEFAULT_LLAMA_RUNTIME_DOWNLOADS[`${process.platform}-${requestedArch ?? process.arch}`]?.url;
}

function getRuntimeDownloadChecksumCandidate(requestedChecksum?: string, requestedArch?: string): string | undefined {
  if (requestedChecksum?.trim()) {
    return requestedChecksum.trim().toLowerCase();
  }
  return process.env[RUNTIME_DOWNLOAD_CHECKSUM_ENV]?.trim()?.toLowerCase()
    || DEFAULT_LLAMA_RUNTIME_DOWNLOADS[`${process.platform}-${requestedArch ?? process.arch}`]?.sha256;
}

async function isExistingExecutable(filePath: string): Promise<boolean> {
  try {
    return existsSync(filePath) && statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function fileNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const base = path.basename(parsed.pathname);
    return base || getRuntimeBinaryName(RUNTIME_BINARY_NAME);
  } catch {
    return getRuntimeBinaryName(RUNTIME_BINARY_NAME);
  }
}

async function ensureBinaryExecutable(filePath: string): Promise<void> {
  if (process.platform === "win32") {
    return;
  }

  await chmod(filePath, 0o755);
}

async function verifyDownloadChecksum(filePath: string, expectedSha256?: string): Promise<void> {
  if (!expectedSha256) {
    return;
  }

  const hasher = createHash("sha256");
  const source = createReadStream(filePath);
  for await (const chunk of source) {
    hasher.update(chunk as Buffer);
  }
  const digest = hasher.digest("hex");
  if (digest !== expectedSha256.toLowerCase()) {
    throw new Error("下载的运行时文件校验失败，请检查 SHA256 值是否正确。");
  }
}

async function downloadRuntimeBinary(
  url: string,
  filePath: string,
  expectedSha256?: string,
  signal?: AbortSignal,
): Promise<void> {
  const fileName = fileNameFromUrl(url);
  const binaryName = getRuntimeBinaryName(fileName);
  const isArchive = isRuntimeArchive(fileName);
  if (!isArchive && (binaryName !== path.basename(filePath) || !binaryName.toLowerCase().includes("llama"))) {
    throw new Error(`下载链接返回文件“${binaryName}”，不是可执行的 llama.cpp 运行时文件或运行时归档包。`);
  }

  const installDir = getRuntimeInstallDir(RUNTIME_BINARY_NAME);
  const tempDir = `${installDir}.tmp-${Date.now()}-${crypto.randomUUID()}`;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) {
    cancel();
  } else {
    signal?.addEventListener("abort", cancel, { once: true });
  }
  const timeout = setTimeout(cancel, RUNTIME_DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`下载运行时失败（${url}）：HTTP ${response.status}`);
    }
    if (!response.body) {
      throw new Error(`下载运行时失败（${url}）：响应体为空。`);
    }

    await mkdir(tempDir, { recursive: true });
    const downloadPath = path.join(tempDir, fileName);
    const destination = createWriteStream(downloadPath);
    await pipeline(response.body as unknown as NodeJS.ReadableStream, destination);
    await verifyDownloadChecksum(downloadPath, expectedSha256);
    if (!isArchive) {
      await mkdir(path.dirname(filePath), { recursive: true });
      await rename(downloadPath, filePath);
      await ensureBinaryExecutable(filePath);
      return;
    }

    await extractRuntimeArchive(downloadPath, tempDir);
    const extractedCommand = await findRuntimeCommand(tempDir, getRuntimeBinaryName(RUNTIME_BINARY_NAME));
    if (!extractedCommand) {
      throw new Error("运行时归档包中未找到 llama-server。");
    }
    await ensureBinaryExecutable(extractedCommand);
    await rm(installDir, { recursive: true, force: true });
    await rename(tempDir, installDir);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(signal?.aborted ? "运行时下载已取消。" : "运行时下载超时。");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
    await rm(tempDir, { recursive: true, force: true });
  }
}

function isRuntimeArchive(fileName: string): boolean {
  const normalized = fileName.toLowerCase();
  return normalized.endsWith(".tar.gz") || normalized.endsWith(".tgz") || normalized.endsWith(".zip");
}

async function extractRuntimeArchive(archivePath: string, destinationDir: string): Promise<void> {
  const normalized = archivePath.toLowerCase();
  if (normalized.endsWith(".tar.gz") || normalized.endsWith(".tgz")) {
    await execFileAsync("tar", ["-xzf", archivePath, "-C", destinationDir]);
    return;
  }
  if (normalized.endsWith(".zip")) {
    if (process.platform === "win32") {
      await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force",
        archivePath,
        destinationDir,
      ]);
      return;
    }
    await execFileAsync("ditto", ["-x", "-k", archivePath, destinationDir]);
    return;
  }
  throw new Error("不支持的运行时归档格式。");
}

async function findCachedRuntimeCommand(command: string): Promise<string | undefined> {
  const directPath = getRuntimeCachePath(command);
  if (await isExistingExecutable(directPath)) {
    return directPath;
  }
  return findRuntimeCommand(getRuntimeInstallDir(command), getRuntimeBinaryName(command));
}

async function findRuntimeCommand(rootDir: string, binaryName: string): Promise<string | undefined> {
  if (!existsSync(rootDir)) {
    return undefined;
  }
  const entries = await readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(rootDir, entry.name);
    if (entry.isFile() && entry.name === binaryName) {
      return candidate;
    }
    if (entry.isDirectory()) {
      const nested = await findRuntimeCommand(candidate, binaryName);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}

async function resolveRuntimeCommandWithDownload(
  command: string,
  runtimeDownloadUrl?: string,
  runtimeDownloadSha256?: string,
  allowDownload = true,
  signal?: AbortSignal,
): Promise<string> {
  let trimmed = command.trim();
  if (!trimmed) {
    throw new Error("推理运行命令不能为空。");
  }

  if (trimmed.includes(path.sep) || trimmed.includes("/")) {
    const directCommand = path.normalize(trimmed);
    if (existsSync(directCommand)) {
      return directCommand;
    }
    if (isManagedRuntimeCachePath(directCommand)) {
      trimmed = RUNTIME_BINARY_NAME;
    } else {
      throw new Error(`未找到指定运行时命令：${directCommand}`);
    }
  }

  const localCommand = localExecutablePath(trimmed);
  if (localCommand) {
    return localCommand;
  }

  if (!isLlamaRuntimeCommand(trimmed)) {
    throw new Error(`未检测到命令 ${trimmed}，请先在系统中安装该命令。`);
  }

  const bundled = getBundledRuntimePath(trimmed);
  if (bundled) {
    await ensureBinaryExecutable(bundled);
    return bundled;
  }

  const cached = await findCachedRuntimeCommand(trimmed);
  if (cached) {
    await ensureBinaryExecutable(cached);
    return cached;
  }

  if (!allowDownload) {
    throw new Error(`未检测到命令 ${trimmed}。请在设置中配置运行时下载链接，或将 llama-server 运行时放入 ${process.resourcesPath}/runtime。`);
  }

  const downloadUrl = getRuntimeDownloadCandidate(runtimeDownloadUrl);
  if (!downloadUrl) {
    throw new Error(`未检测到 llama-server 运行时，也没有可用的默认下载源。`);
  }

  const runtimeDownloadSha256Value = getRuntimeDownloadChecksumCandidate(runtimeDownloadSha256);
  const target = getRuntimeCachePath(trimmed);
  await downloadRuntimeBinary(downloadUrl, target, runtimeDownloadSha256Value, signal);
  const installed = await findCachedRuntimeCommand(trimmed);
  if (!installed) {
    throw new Error("运行时下载完成，但未找到可执行的 llama-server。");
  }
  return installed;
}

async function checkRuntimeCommandAvailability(
  runtime: InferenceRuntimeConfig,
): Promise<{ ready: boolean; command?: string; error?: string }> {
  if (!runtime.command?.trim()) {
    return { ready: false, error: "推理运行命令不能为空。" };
  }

  try {
    const command = await resolveRuntimeCommandWithDownload(
      runtime.command,
      runtime.runtimeDownloadUrl,
      runtime.runtimeDownloadSha256,
      false,
    );
    return { ready: true, command };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const missingRuntime =
      message.includes("未检测到命令")
      || message.includes("未检测到 llama-server")
      || message.includes("未找到可执行的 llama-server");
    return {
      ready: false,
      ...(missingRuntime ? {} : { error: sanitizeUserFacingError(message) }),
    };
  }
}

function isLlamaRuntimeCommand(command: string): boolean {
  return getRuntimeBinaryName(command).toLowerCase().startsWith(RUNTIME_BINARY_NAME) || command.toLowerCase().includes("llama");
}

function isManagedRuntimeCachePath(command: string): boolean {
  const normalizedCommand = path.normalize(command);
  const normalizedRuntimeDir = path.normalize(path.join(getRuntimeDataDir(), "binaries"));
  return normalizedCommand.startsWith(`${normalizedRuntimeDir}${path.sep}`)
    && isLlamaRuntimeCommand(path.basename(normalizedCommand));
}

function localExecutablePath(command: string): string | undefined {
  if (command.includes(path.sep) || command.includes("/")) {
    return existsSync(command) ? command : undefined;
  }
  const pathVar = process.env.PATH ?? "";
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of pathVar.split(path.delimiter)) {
    const base = path.join(dir, command);
    for (const extension of extensions) {
      const candidate = extension ? `${base}${extension}` : base;
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

function getModelScopeManager(command: string): ModelScopeManager {
  if (!modelScopeManager || modelScopeManagerCommand !== command) {
    modelScopeManager = createModelScopeManager();
    modelScopeManagerCommand = command;
  }
  return modelScopeManager;
}

function createModelScopeManager(): ModelScopeManager {
  return new ModelScopeManager({
    cacheDir: getRuntimeDataDir(),
  });
}

/** Removes retired model revisions and abandoned partials before background work starts. */
async function pruneRetiredModelCache(): Promise<void> {
  const allowedModelIds = localModelProfiles.flatMap((profile) => [
    profile.model.url,
    ...(profile.auxiliaryModels?.map((model) => model.url) ?? []),
  ]);
  const deleted = await getModelScopeManager("local").pruneCache(allowedModelIds);
  if (deleted > 0) {
    console.info(`Removed ${deleted} retired or stale model cache artifact(s).`);
  }
}

function sendModelScopeDownloadProgress(
  requestId: string,
  modelId: string,
  progress: ModelDownloadProgress,
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("inference.modelscope.download.progress", {
      requestId,
      modelId,
      ...progress,
    });
  }
}

function getPddService(): PddService {
  pddService ??= new PddService({
    dataDir: app.getPath("userData"),
    getAccount: async (accountId) => (await getStore()).getAccount(accountId),
    saveAccount: async (account) => (await getStore()).upsertAccount(account),
    saveMessage: async (message) => (await getStore()).upsertMessage(message),
    onMessageReceived: async (message) => {
      const store = await getStore();
      await store.enqueueInboundMessage(message);
      void processInboundQueue();
    },
    getMessage: async (messageId) => (await getStore()).getMessage(messageId),
    saveDraft: async (draft) => (await getStore()).saveDraft(draft),
    getDraft: async (draftId) => (await getStore()).getDraft(draftId),
    log: async (level, message) => { await (await getStore()).appendLog(level, message); },
  });
  return pddService;
}

function processInboundQueue(): Promise<void> {
  if (inboundQueueTask || isShuttingDown) {
    return inboundQueueTask ?? Promise.resolve();
  }
  const task = drainInboundQueue()
    .catch((error) => {
      console.error("Inbound queue processing failed", sanitizeUserFacingError(error instanceof Error ? error.message : String(error)));
    })
    .finally(() => {
      if (inboundQueueTask === task) {
        inboundQueueTask = undefined;
      }
    });
  inboundQueueTask = task;
  return task;
}

/** Drains one shared inbound-queue worker until no ready work remains. */
async function drainInboundQueue(): Promise<void> {
  try {
    const store = await getStore();
    while (!isShuttingDown) {
      const settings = await store.getSettings();
      const limit = Math.max(1, settings.queue?.maxConcurrentConversations ?? 2);
      const claimed = await store.claimNextInboundMessages({ limit });
      if (claimed.length === 0) {
        break;
      }
      await Promise.all(
        claimed.map((item) => (async () => {
          try {
            const message = await store.getMessage(item.messageId);
            if (!message) {
              await store.completeInboundQueueItem(item.id, "failed", "message_not_found");
              await appendDiagnostic(store, "pdd", "inbound_queue_message_missing", {
                accountId: item.accountId,
                shopId: item.shopId,
                messageId: item.messageId,
              });
              return;
            }
            const result = await runInboundHandlerChain(
              { context: message },
              {
                store,
                createInferenceClient,
                sendGoodsLink: sendGoodsLinkTool,
                transferConversation: transferConversationTool,
                sendReply: async (context, text) => {
                  const result = await sendPddMessageGoverned(context.id, text);
                  if (!result.ok) {
                    throw new Error(result.error ?? "PDD text reply failed.");
                  }
                },
              },
            );
            if (!result.ok) {
              await store.failInboundQueueItem(item.id, {
                error: result.error,
                ...buildQueueFailurePolicy(settings),
              });
              return;
            }
            await store.completeInboundQueueItem(item.id, "completed");
          } catch (error) {
            const messageText = error instanceof Error ? error.message : String(error);
            await store.failInboundQueueItem(item.id, {
              error: sanitizeUserFacingError(messageText),
              ...buildQueueFailurePolicy(settings),
            });
            await appendDiagnostic(store, "pdd", "send_message_failure", {
              accountId: item.accountId,
              shopId: item.shopId,
              messageId: item.messageId,
              error: messageText,
            });
          }
        })()),
      );
    }
  } finally {
    if (!isShuttingDown) {
      void scheduleInboundQueueWakeup();
    }
  }
}

async function runGoverned<T>(dependencyId: DependencyId, operation: () => Promise<T>): Promise<T> {
  const decision = dependencyGovernor.beforeRequest(dependencyId);
  if (!decision.ok) {
    throw new Error(`dependency_${dependencyId}_${decision.reason}_retry_at_${new Date(decision.retryAt).toISOString()}`);
  }
  try {
    const result = await operation();
    dependencyGovernor.recordSuccess(dependencyId);
    return result;
  } catch (error) {
    dependencyGovernor.recordFailure(dependencyId, Date.now(), error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/** Applies dependency governance consistently to every Model Provider operation. */
function governChatClient(client: ChatInferenceClient): ChatInferenceClient {
  return {
    chat: (prompt, options) => runGoverned("llm", () => client.chat(prompt, options)),
    chatMultimodal: (request, options) => runGoverned("llm", () => client.chatMultimodal(request, options)),
    respond: (request, options) => runGoverned("llm", () => client.respond(request, options)),
    healthCheck: () => runGoverned("llm", () => client.healthCheck()),
    quickCheck: () => runGoverned("llm", () => client.quickCheck()),
  };
}

async function sendPddMessageGoverned(messageId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  return runGoverned("pdd", () => getPddService().sendMessage(messageId, text));
}

async function sendGoodsLinkTool(
  context: { accountId: string; shopId: string; buyerId: string },
  goodsId: string,
): Promise<{ ok: boolean; content: string; error?: string; citations?: Array<{ scope: "shop"; documentId: string; chunkId: string; score: number }> }> {
  return runGoverned("pdd", async () => {
    const store = await getStore();
    const citationId = `product:${context.shopId}:${goodsId}`;
    const [product] = await store.listGovernedKnowledge({
      kind: "product",
      shopId: context.shopId,
      citationId,
      eligibleOnly: true,
    });
    if (!product) {
      return { ok: false, content: "", error: "goods_id 不属于当前店铺的已审核可用商品知识，已阻止发送。" };
    }
    let account = await store.getAccount(context.accountId);
    if (!account) {
      return { ok: false, content: "", error: "未找到当前店铺账号，无法发送商品卡片。" };
    }
    let cookies = parseCookieJar(account.cookies);
    let antiContent = cookies.anti_content ?? cookies["anti-content"];
    if (!antiContent?.trim()) {
      await store.appendLog("info", "商品卡发送缺少 anti-content，正在自动刷新拼多多浏览器会话。");
      const refreshed = await getPddService().refreshAccountSession(account.id);
      if (!refreshed.ok || !refreshed.account?.cookies) {
        return { ok: false, content: "", error: refreshed.error ?? "自动刷新 PDD 会话失败，请在账号页重新登录后再发送商品卡片。" };
      }
      account = refreshed.account;
      cookies = parseCookieJar(account.cookies);
      antiContent = cookies.anti_content ?? cookies["anti-content"];
    }
    if (!antiContent?.trim()) {
      return { ok: false, content: "", error: "刷新后仍缺少 anti-content，请在账号页重新登录后再发送商品卡片。" };
    }
    // Reuse the proven product-sync transport: issue the send from inside the
    // live, logged-in PDD page so PDD attaches a valid anti-content and the full
    // cookie set. The plain Node-fetch path is rejected by risk control (-12).
    // ponytail: launches a browser context per send; pool/reuse per account if send throughput matters.
    const result = await withBrowserBackedPddApiForAccount(
      account,
      antiContent,
      (api) => api.sendGoodsCard(context.buyerId, goodsId, { antiContent }),
    );
    if (!result.ok) {
      return { ok: false, content: "", error: result.error ?? "商品卡片发送失败。" };
    }
    return {
      ok: true,
      content: `商品卡片已发送：goods_id=${goodsId}`,
      citations: [{ scope: "shop", documentId: product.citationId, chunkId: `v${product.version}`, score: 1 }],
    };
  });
}

async function transferConversationTool(
  context: { accountId: string; shopId: string; buyerId: string },
): Promise<{ ok: boolean; content: string; error?: string }> {
  return runGoverned("pdd", async () => {
    const store = await getStore();
    const account = (await store.listAccounts()).find((item) => item.id === context.accountId && item.shopId === context.shopId);
    if (!account) {
      return { ok: false, content: "", error: "未找到当前店铺账号，无法转接。" };
    }
    const api = await createPddApiForAccount(account.id);
    const services = await api.getAssignedCustomerServices();
    const currentCsUid = `cs_${account.shopId}_${account.userId}`;
    const target = services.find((service) => service.uid !== currentCsUid);
    if (!target) {
      return { ok: false, content: "", error: "没有可用的其他客服账号，无法转接。" };
    }
    const result = await api.moveConversation(context.buyerId, target.uid);
    if (!result.ok) {
      return { ok: false, content: "", error: result.error ?? "会话转接失败。" };
    }
    return { ok: true, content: `会话已转接给 ${target.username ?? target.uid}` };
  });
}

async function createPddApiForAccount(accountId: string): Promise<PddApi> {
  const store = await getStore();
  const account = (await store.listAccounts()).find((item) => item.id === accountId);
  if (!account?.cookies) {
    throw new Error("账户缺少可用会话，请先完成真实拼多多登录。");
  }
  return new PddApi({ http: new PddHttpClient({ cookies: parseCookieJar(account.cookies) }) });
}

function buildQueueFailurePolicy(settings: AppSettings): { maxAttempts?: number; baseBackoffMs?: number } {
  return {
    ...(settings.queue?.maxAttempts === undefined ? {} : { maxAttempts: settings.queue.maxAttempts }),
    ...(settings.queue?.baseBackoffMs === undefined ? {} : { baseBackoffMs: settings.queue.baseBackoffMs }),
  };
}

async function scheduleInboundQueueWakeup(): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  if (inboundQueueWakeup) {
    clearTimeout(inboundQueueWakeup);
    inboundQueueWakeup = undefined;
  }
  const store = await getStore();
  const settings = await store.getSettings();
  if (settings.queue?.paused) {
    return;
  }
  const [nextRetry] = await store.listInboundQueue({ state: "retry_waiting" });
  if (!nextRetry) {
    return;
  }
  const delay = Math.max(0, new Date(nextRetry.availableAt).getTime() - Date.now());
  inboundQueueWakeup = setTimeout(() => {
    inboundQueueWakeup = undefined;
    void processInboundQueue();
  }, delay);
}

/** Registers an IPC handler that only accepts calls from the application's trusted renderer. */
function handle<TChannel extends IpcChannel>(
  channel: TChannel,
  listener: (request: IpcRequest<TChannel>) => Promise<IpcResponse<TChannel>> | IpcResponse<TChannel>,
) {
  ipcMain.handle(channel, async (event, request: IpcRequest<TChannel>) => {
    if (!isTrustedRendererUrl(
      event.senderFrame?.url ?? event.sender.getURL(),
      resolveDevServerUrl(app.isPackaged, process.env.VITE_DEV_SERVER_URL),
      rendererEntryUrl.href,
    )) {
      throw new Error("Rejected IPC request from an untrusted renderer origin.");
    }
    if (isShuttingDown) {
      throw new Error("Application is shutting down.");
    }
    const operation = Promise.resolve().then(() => listener(request));
    activeIpcTasks.add(operation);
    try {
      return await operation;
    } finally {
      activeIpcTasks.delete(operation);
    }
  });
}

/** Provider-independent model operations exposed to desktop business workflows. */
interface ChatInferenceClient {
  chat(prompt: string, options?: { signal?: AbortSignal }): Promise<string>;
  chatMultimodal(request: MultimodalChatRequest, options?: { signal?: AbortSignal }): Promise<string>;
  respond(request: ResponseModelRequest, options?: { signal?: AbortSignal }): Promise<ResponseModelResult>;
  healthCheck(): Promise<void>;
  quickCheck(): Promise<void>;
}

/** Creates a governed client for the selected Model Provider and requested capability. */
async function createInferenceClient(
  capability: ModelProviderCapability = "chat",
  requestId = `model-provider-${Date.now()}`,
  maxTokens?: number,
): Promise<ChatInferenceClient> {
  const runtimeStart = captureRuntimeStart();
  const store = await getStore();
  const settings = await store.getSettings();
  try {
    const provider = resolveModelProviderConfig(settings, capability);
    if (provider.kind === "local") {
      const runtime = await getRuntimeConfigFromRequest({ modelId: provider.runtime.modelId });
      await ensureManagedRuntimeReady(runtime, requestId, runtimeStart);
    }
    return governChatClient(new OpenAICompatibleClient(maxTokens ? { ...provider.config, maxTokens } : provider.config));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendDiagnostic(store, "inference", "provider_config_mismatch", {
      provider: resolveModelProvider(settings),
      capability,
      error: sanitizeUserFacingError(message),
    });
    throw error;
  }
}

/** Creates a side-effect-free health client without downloading or starting a local runtime. */
async function createInferenceHealthClient(): Promise<ChatInferenceClient> {
  const settings = await (await getStore()).getSettings();
  const provider = resolveModelProviderConfig(settings, "chat");
  if (provider.kind === "local") {
    if (!getRuntimeProcessManager().status().running) {
      throw new Error("本地 AI 尚未启动。");
    }
    const runtime = await getRuntimeConfigFromRequest({ modelId: provider.runtime.modelId });
    return new OpenAICompatibleClient({
      ...provider.config,
      baseUrl: getRuntimeBaseUrl(runtime),
      chatModel: runtime.modelId,
    });
  }
  return new OpenAICompatibleClient(provider.config);
}

/** Creates product extraction through the currently selected Model Provider. */
async function createProductKnowledgeExtractor(
  requestId: string,
  signal?: AbortSignal,
): Promise<(input: ProductKnowledgeExtractionInput) => Promise<ProductKnowledgeExtractionResult>> {
  const store = await getStore();
  const settings = await store.getSettings();
  const provider = resolveModelProviderConfig(settings, "multimodal");
  const client = await createInferenceClient("multimodal", requestId);

  return async (input) => {
    if (signal?.aborted) {
      throw new Error("商品同步已取消。");
    }
    const imageUrls = collectProductImageUrls(input);
    const raw = await client.chatMultimodal({
      system: PRODUCT_KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT,
      text: buildProductExtractionPrompt(input),
      imageUrls,
      responseFormat: "json_object",
    }, signal ? { signal } : undefined);
    return {
      content: formatProductExtractionContent(input.baseContent, raw),
      tags: buildProductExtractionTags(raw),
      sourceMetadata: {
        extractionModel: provider.config.chatModel,
        modelProvider: provider.kind,
        multimodal: true,
        imageCount: imageUrls.length,
      },
    };
  };
}

/** Runs a PDD API operation inside the account's serialized persistent browser profile. */
async function withBrowserBackedPddApiForAccount<T>(
  account: AccountRecord,
  antiContent: string,
  operation: (api: PddApi) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (isShuttingDown || signal?.aborted) {
    throw new Error("应用正在退出，已取消拼多多浏览器操作。");
  }
  const playwright = await import("playwright");
  const profileDir = await resolvePddProfileDir(app.getPath("userData"), account.username);
  return withPddBrowserProfileLock(profileDir, async () => {
    if (isShuttingDown || signal?.aborted) {
      throw new Error("应用正在退出，已取消拼多多浏览器操作。");
    }
    const context = await playwright.chromium.launchPersistentContext(profileDir, {
      headless: true,
      args: [
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--disable-notifications",
      ],
    });
    pddBrowserContexts.add(context);
    const closeOnAbort = () => {
      void context.close().catch(() => undefined);
    };
    signal?.addEventListener("abort", closeOnAbort, { once: true });
    try {
      if (isShuttingDown || signal?.aborted) {
        throw new Error("应用正在退出，已取消拼多多浏览器操作。");
      }
      const page = context.pages()[0] ?? await context.newPage();
      await page.goto("https://mms.pinduoduo.com/home/", { waitUntil: "domcontentloaded" });
      return await operation(new PddApi({
        http: new PddBrowserHttpClient({
          page,
          antiContent,
        }),
      }));
    } finally {
      signal?.removeEventListener("abort", closeOnAbort);
      pddBrowserContexts.delete(context);
      await context.close().catch(() => undefined);
    }
  });
}

async function ensureManagedRuntimeReady(
  runtimeConfig: InferenceRuntimeConfig,
  requestId: string,
  start = captureRuntimeStart(),
): Promise<void> {
  assertRuntimeStartCurrent(start);
  const baseUrl = getRuntimeBaseUrl(runtimeConfig);
  const probe = new OpenAICompatibleClient({
    baseUrl,
    chatModel: runtimeConfig.modelId,
    temperature: 0,
    maxTokens: 16,
  });
  if (!runtimeConfig.command) {
    throw new Error("推理运行命令不能为空。");
  }
  const runtimeCommand = await resolveRuntimeCommandWithDownload(
    runtimeConfig.command,
    runtimeConfig.runtimeDownloadUrl,
    runtimeConfig.runtimeDownloadSha256,
    true,
    start.signal,
  );
  assertRuntimeStartCurrent(start);
  runtimeConfig.command = runtimeCommand;

  let modelPath = runtimeConfig.modelPath;
  let mmprojPath = runtimeConfig.mmprojPath;
  const profile = getLocalModelProfileForRuntime(runtimeConfig);
  const mmproj = profile?.auxiliaryModels?.find((item) => item.purpose === "mmproj");
  if (!modelPath || !existsSync(modelPath)) {
    modelPath = await getModelScopeManager("local").ensureModel(runtimeConfig.modelId, {
      ...(profile?.model.sha256 ? { expectedSha256: profile.model.sha256 } : {}),
      signal: start.signal,
      onProgress: (progress) => sendModelScopeDownloadProgress(requestId, runtimeConfig.modelId, progress),
    });
    assertRuntimeStartCurrent(start);
  }
  if (mmproj && (!mmprojPath || !existsSync(mmprojPath))) {
    mmprojPath = await getModelScopeManager("local").ensureModel(mmproj.url, {
      ...(mmproj.sha256 ? { expectedSha256: mmproj.sha256 } : {}),
      signal: start.signal,
      onProgress: (progress) => sendModelScopeDownloadProgress(requestId, mmproj.url, progress),
    });
    assertRuntimeStartCurrent(start);
    runtimeConfig.mmprojModelId = mmproj.url;
  }
  if (!modelPath) {
    throw new Error("本地模型文件未准备完成。");
  }

  const runtimeArgs = inferRuntimeArgs(
    runtimeConfig.command,
    runtimeConfig.host ?? "127.0.0.1",
    runtimeConfig.port ?? 8000,
    modelPath,
    runtimeConfig.commandArgs,
    mmprojPath,
  );
  assertRuntimeStartCurrent(start);
  await getRuntimeProcessManager().start({
    command: runtimeConfig.command,
    modelPath,
    port: runtimeConfig.port ?? 8000,
    host: runtimeConfig.host ?? "127.0.0.1",
    ...(runtimeArgs ? { args: runtimeArgs } : {}),
  });
  try {
    assertRuntimeStartCurrent(start);
    await waitForRuntimeHealth(probe, 90_000, start);
    assertRuntimeStartCurrent(start);
    const store = await getStore();
    await store.saveSettings({
      inference: {
        ...(await store.getSettings()).inference,
        baseUrl,
        chatModel: runtimeConfig.modelId,
      },
      inferenceRuntime: {
        ...runtimeConfig,
        modelPath,
        ...(mmprojPath ? { mmprojPath } : {}),
      },
    });
  } catch (error) {
    if (start.generation === runtimeStartGeneration) {
      await getRuntimeProcessManager().stop();
    }
    throw error;
  }
}

async function waitForRuntimeHealth(
  client: OpenAICompatibleClient,
  timeoutMs = 90_000,
  start?: { generation: number; signal: AbortSignal },
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (start) {
      assertRuntimeStartCurrent(start);
    }
    try {
      await client.healthCheck();
      if (start) {
        assertRuntimeStartCurrent(start);
      }
      return;
    } catch (error) {
      lastError = error;
      const manager = getRuntimeProcessManager();
      if (!manager.status().running) {
        const stderr = manager.lastError();
        throw new Error(`本地运行时进程已退出，启动失败。${stderr ? `运行时输出：${stderr}` : ""}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  throw new Error(`本地多模态运行时启动后未通过健康检查：${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

const PRODUCT_KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT = [
  "你是电商商品知识提取助手，只能基于给定商品文本、规格和图片提取事实。",
  "输出 JSON 对象，不要输出 Markdown。",
  "字段：brand, origin, ingredients_or_material, specification, suitable_users, shelf_life, selling_points, usage, faq。",
  "selling_points 必须是字符串数组，faq 必须是 {question, answer} 数组。",
  "无法从资料确认的字段填空字符串或空数组，不要猜测。",
].join("\n");

function buildProductExtractionPrompt(input: ProductKnowledgeExtractionInput): string {
  return [
    input.baseContent,
    "",
    `商品详情图片数量：${collectProductImageUrls(input).length}`,
    "请提取客服可审核的结构化商品知识。",
  ].join("\n");
}

function collectProductImageUrls(input: ProductKnowledgeExtractionInput): string[] {
  return Array.from(new Set([
    input.product.thumbUrl,
    ...(input.detail?.images ?? []),
  ].filter((url): url is string => Boolean(url?.trim()))));
}

function formatProductExtractionContent(baseContent: string, raw: string): string {
  const parsed = parseJsonObject(raw);
  if (!parsed) {
    return `${baseContent}\n\n多模态提取：\n${raw}`;
  }
  const lines = [baseContent, "", "多模态提取："];
  addField(lines, "品牌", parsed.brand);
  addField(lines, "产地", parsed.origin);
  addField(lines, "成分/材质", parsed.ingredients_or_material);
  addField(lines, "规格", parsed.specification);
  addField(lines, "适用人群", parsed.suitable_users);
  addField(lines, "保质期", parsed.shelf_life);
  const sellingPoints = stringArray(parsed.selling_points);
  if (sellingPoints.length) {
    lines.push("卖点：");
    for (const point of sellingPoints) {
      lines.push(`- ${point}`);
    }
  }
  addField(lines, "使用方法/注意事项", parsed.usage);
  const faq = faqArray(parsed.faq);
  if (faq.length) {
    lines.push("FAQ：");
    for (const item of faq) {
      lines.push(`- Q: ${item.question}`);
      lines.push(`  A: ${item.answer}`);
    }
  }
  return lines.join("\n");
}

function buildProductExtractionTags(raw: string): string[] {
  const parsed = parseJsonObject(raw);
  if (!parsed) {
    return ["multimodal_extracted"];
  }
  return [
    "multimodal_extracted",
    stringValue(parsed.brand),
    stringValue(parsed.origin),
  ].filter((value): value is string => Boolean(value?.trim()));
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    const match = /\{[\s\S]*\}/u.exec(value);
    if (!match) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(match[0]) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
    } catch {
      return undefined;
    }
  }
}

function addField(lines: string[], label: string, value: unknown): void {
  const text = stringValue(value);
  if (text) {
    lines.push(`${label}：${text}`);
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
}

function faqArray(value: unknown): Array<{ question: string; answer: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const record = item as Record<string, unknown>;
    const question = stringValue(record.question);
    const answer = stringValue(record.answer);
    return question && answer ? [{ question, answer }] : [];
  });
}

async function getRuntimeConfigFromRequest(
  request: Pick<Partial<InferenceRuntimeConfig>, "modelId" | "modelPath" | "mmprojModelId" | "mmprojPath"> = {},
): Promise<InferenceRuntimeConfig> {
  const store = await getStore();
  const settings = await store.getSettings();
  const requestedProfile = localModelProfiles.find((profile) => (
    profile.id === request.modelId
    || profile.model.id === request.modelId
    || profile.model.url === request.modelId
  ));
  if (request.modelId && !requestedProfile) {
    throw new Error("只能启动应用审核过的本地模型档案。");
  }
  const normalizedProfile = normalizeLocalRuntimeConfig({
    ...DEFAULT_RUNTIME,
    ...(settings.inferenceRuntime ?? {}),
    ...(requestedProfile ? { modelId: requestedProfile.model.url } : {}),
  });
  const profile = getLocalModelProfileForRuntime(normalizedProfile);
  if (!profile) {
    throw new Error("只能启动应用审核过的本地模型档案。");
  }
  const mmproj = profile.auxiliaryModels?.find((item) => item.purpose === "mmproj");
  const requestedModelPath = request.modelPath ?? normalizedProfile.modelPath;
  const requestedMmprojPath = request.mmprojPath ?? normalizedProfile.mmprojPath;
  const normalized: InferenceRuntimeConfig = {
    runtimeKind: "managed_llama_server",
    modelId: profile.model.url,
    modelPath: isManagedModelCachePath(requestedModelPath) ? requestedModelPath : "",
    command: RUNTIME_BINARY_NAME,
    host: "127.0.0.1",
    port: 8000,
    ...(mmproj ? {
      mmprojModelId: mmproj.url,
      mmprojPath: isManagedModelCachePath(requestedMmprojPath) ? requestedMmprojPath ?? "" : "",
    } : {}),
  };
  if (JSON.stringify(settings.inferenceRuntime) !== JSON.stringify(normalized)) {
    await store.saveSettings({ inferenceRuntime: normalized });
  }
  return normalized;
}

/** Checks that a model artifact belongs to the app-managed download cache. */
function isManagedModelCachePath(candidate: string | undefined): candidate is string {
  if (!candidate) {
    return false;
  }
  const cacheRoot = path.resolve(getRuntimeDataDir(), "downloads");
  const relative = path.relative(cacheRoot, path.resolve(candidate));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function getRuntimeBaseUrl(runtimeConfig: InferenceRuntimeConfig): string {
  return `http://${runtimeConfig.host ?? "127.0.0.1"}:${runtimeConfig.port ?? 8000}/v1`;
}

function inferRuntimeArgs(
  command: string,
  host: string,
  port: number,
  modelPath: string,
  commandArgs?: string[],
  mmprojPath?: string,
): string[] | undefined {
  if (commandArgs?.length) {
    return commandArgs;
  }
  const binary = path.basename(command).toLowerCase();
  if (binary.includes("llama")) {
    return [
      "-m",
      modelPath,
      "--host",
      host ?? "127.0.0.1",
      "--port",
      String(port),
      "--jinja",
      ...(mmprojPath ? ["--mmproj", mmprojPath] : []),
    ];
  }
  throw new Error(`启动参数未配置，请在命令参数中填写适配 ${binary} 的参数。`);
}

function toSafeRuntimeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function setupIpc() {
  handle("app.health", async () => {
    return { ok: true, worker: "ready" };
  });

  handle("app.update.status", () => getAppUpdateStatus());
  handle("app.update.check", () => checkForAppUpdates());
  handle("app.update.install", () => installDownloadedAppUpdate());

  handle("account.login", async (request) => {
    const store = await getStore();
    const result = await getPddService().login(request);
    if (!result.ok) {
      return result;
    }
    await appendDiagnostic(store, "pdd", "session_refresh", {
      accountId: result.accountId ?? "",
      shopId: result.shopId ?? "",
      username: request.username,
    });
    return result;
  });

  handle("account.list", async () => {
    const store = await getStore();
    return { accounts: (await store.listAccounts()).map(toRendererAccount) };
  });

  handle("account.start", async (request) => {
    return runGoverned("pdd", () => getPddService().startAccount(request.accountId));
  });

  handle("account.stop", async (request) => {
    return getPddService().stopAccount(request.accountId);
  });

  handle("account.availability.set", async (request) => {
    return runGoverned("pdd", () => getPddService().setAccountAvailability(request.accountId, request.status));
  });

  handle("account.logout", async (request) => {
    return getPddService().logoutAccount(request.accountId);
  });

  handle("account.runtime.state", async (request) => {
    const state = getPddService().getAccountRuntimeState(request.accountId);
    return { accountId: request.accountId, ...state };
  });

  handle("account.runtime.list", async () => {
    return { states: getPddService().getAllAccountRuntimeStates() };
  });

  handle("message.list", async (request) => {
    const store = await getStore();
    return { messages: await store.listMessages(request ?? {}) };
  });

  handle("message.send", async (request) => {
    const result = await sendPddMessageGoverned(request.messageId, request.text);
    if (result.ok) {
      const store = await getStore();
      const message = await store.getMessage(request.messageId);
      if (message) {
        await recordPddSendSuccess(message, store);
      }
    }
    return result;
  });

  handle("message.sendImage", async (request) => {
    return runGoverned("pdd", () => getPddService().sendImage(request.messageId, request.imageUrl));
  });

  handle("reply.generate", async (request) => {
    const store = await getStore();
    const result = await generateAndPersistReply(request, {
      store,
      createInferenceClient,
      sendGoodsLink: sendGoodsLinkTool,
      transferConversation: transferConversationTool,
    });
    return result.ok ? { ok: true, reply: result.reply } : { ok: false, error: result.error };
  });

  handle("reply.draft.list", async (request) => {
    const store = await getStore();
    return { drafts: await store.listDrafts(request ?? {}) };
  });

  handle("reply.draft.ignore", async (request) => getPddService().ignoreDraft(request.draftId));
  handle("reply.draft.note", async (request) => {
    const store = await getStore();
    const draft = await store.getDraft(request.draftId);
    if (!draft) return { ok: false, error: "找不到人工处理草稿。" };
    await store.saveDraft({ ...draft, operatorNote: request.note, updatedAt: new Date().toISOString() });
    return { ok: true };
  });

  handle("knowledge.governed.list", async (request) => {
    const store = await getStore();
    return { records: await store.listGovernedKnowledge(request ?? {}) };
  });

  handle("knowledge.governed.save", async (request) => {
    try {
      const store = await getStore();
      const record = await store.saveGovernedKnowledge(request);
      return { ok: true, record };
    } catch (error) {
      return { ok: false, error: sanitizeUserFacingError(error instanceof Error ? error.message : String(error)) };
    }
  });

  handle("knowledge.governed.rollback", async (request) => {
    const store = await getStore();
    const record = await store.rollbackGovernedKnowledge(request.citationId, request.version);
    return record ? { ok: true, record } : { ok: false, error: "未找到可回滚的知识版本。" };
  });

  handle("knowledge.governed.state", async (request) => {
    const store = await getStore();
    const record = await store.setGovernedKnowledgeState(request.citationId, request);
    return record ? { ok: true, record } : { ok: false, error: "未找到知识记录。" };
  });

  handle("knowledge.governed.delete", async (request) => {
    const store = await getStore();
    const ok = await store.deleteGovernedKnowledge(request.citationId);
    return ok ? { ok } : { ok: false, error: "未找到知识记录。" };
  });

  handle("knowledge.customer_service.import", async (request) => {
    try {
      const store = await getStore();
      const result = await store.importCustomerServiceKnowledgeRows(request);
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, created: 0, skippedDuplicates: 0, failed: request.rows.length, error: sanitizeUserFacingError(error instanceof Error ? error.message : String(error)) };
    }
  });

  handle("knowledge.document.pick", async () => {
    try {
      const win = mainWindow ?? BrowserWindow.getAllWindows()[0];
      const options = {
        title: "选择要解析的文档",
        properties: ["openFile" as const],
        filters: [{ name: "文档", extensions: ["docx", "xlsx", "pptx", "txt", "md", "markdown", "json"] }],
      };
      const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
      if (result.canceled || !result.filePaths[0]) {
        return { ok: true, canceled: true };
      }
      return { ok: true, ...documentHandles.issue(result.filePaths[0]) };
    } catch (error) {
      return { ok: false, error: sanitizeUserFacingError(error instanceof Error ? error.message : String(error)) };
    }
  });

  handle("knowledge.document.import", async (request) => {
    const document = documentHandles.consume(request.documentId);
    if (!document) {
      return { ok: false, entries: [], segmentsTotal: 0, segmentsCompleted: 0, failures: [], error: "文档选择已失效，请重新选择文件。" };
    }
    let text: string;
    try {
      text = await readDocumentText(document.filePath);
      if (!text.trim()) {
        return { ok: false, entries: [], segmentsTotal: 0, segmentsCompleted: 0, failures: [], error: "文件读取失败：文档中没有可提取的文本。" };
      }
    } catch {
      return { ok: false, entries: [], segmentsTotal: 0, segmentsCompleted: 0, failures: [], error: "文件读取失败：请确认文件仍可访问且格式有效。" };
    }
    try {
      // 提取输出体量约等于片段原文，默认 1000 token 会截断 JSON
      const client = await createInferenceClient("chat", `knowledge-extract-${Date.now()}`, 3000);
      const fileName = document.basename;
      const result = await extractKnowledgeEntries(text, client, (progress) => {
        mainWindow?.webContents.send("knowledge.document.progress", { ...progress, requestId: request.requestId, fileName });
      });
      if (!result.entries.length) {
        const details = result.failures.slice(0, 3).map((failure) => `第 ${failure.segment} 段：${failure.error}`).join("；");
        return {
          ok: false,
          entries: [],
          segmentsTotal: result.total,
          segmentsCompleted: result.completed,
          failures: result.failures,
          error: details ? `AI 知识提取失败：${details}` : "未从文档中提取到有效知识条目（文档内容可能不含客服知识）。",
        };
      }
      return {
        ok: true,
        fileName,
        fileType: path.extname(document.basename).slice(1).toLowerCase(),
        entries: result.entries,
        segmentsTotal: result.total,
        segmentsCompleted: result.completed,
        failures: result.failures,
      };
    } catch (error) {
      return { ok: false, entries: [], segmentsTotal: 0, segmentsCompleted: 0, failures: [], error: `AI 知识提取失败：${sanitizeUserFacingError(error instanceof Error ? error.message : String(error))}` };
    }
  });

  handle("product.sync.start", async (request) => {
    try {
      const store = await getStore();
      const account = (await store.listAccounts()).find((item) => item.id === request.accountId);
      if (!account) {
        return { ok: false, error: "未找到账户。" };
      }
      if (!account.cookies) {
        return { ok: false, error: "账户缺少可用会话，请先完成真实拼多多登录。" };
      }

      const activeRunId = productSyncAccountRuns.get(request.accountId);
      if (activeRunId && productSyncTasks.has(activeRunId)) {
        return { ok: false, error: "该账号已有商品同步任务在运行。" };
      }
      const runId = `product-sync-${request.accountId}-${crypto.randomUUID()}`;
      const controller = new AbortController();
      productSyncControllers.set(runId, controller);
      productSyncAccountRuns.set(request.accountId, runId);

      const initial: ProductSyncProgress = {
        runId,
        shopId: account.shopId,
        mode: request.mode,
        phase: "fetching",
        total: 0,
        current: 0,
        added: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        failures: [],
      };
      updateProductSyncProgress(initial);
      const task = runGoverned("product_sync", async () => {
        let syncAccount = account;
        let cookies = parseCookieJar(syncAccount.cookies);
        let antiContent = cookies.anti_content ?? cookies["anti-content"];
        if (!antiContent?.trim()) {
          await store.appendLog("info", "商品同步缺少 anti-content，正在自动刷新拼多多浏览器会话。");
          const refreshed = await getPddService().refreshAccountSession(syncAccount.id);
          if (!refreshed.ok || !refreshed.account?.cookies) {
            throw new Error(refreshed.error ?? "自动刷新 PDD 会话失败，请在账号页重新登录后再同步商品。");
          }
          syncAccount = refreshed.account;
          cookies = parseCookieJar(syncAccount.cookies);
          antiContent = cookies.anti_content ?? cookies["anti-content"];
          await store.appendLog("info", `商品同步会话刷新完成：antiContent=${antiContent ? "present" : "missing"}`);
          if (!antiContent?.trim()) {
            throw new Error("自动刷新 PDD 会话后仍缺少商品接口所需的 anti-content，请在账号页重新登录后再同步商品。");
          }
        }
        await withBrowserBackedPddApiForAccount(syncAccount, antiContent, async (api) => {
          const extractProductKnowledge = await createProductKnowledgeExtractor(runId, controller.signal);
          const service = new PddProductSyncService({
            api,
            shopId: syncAccount.shopId,
            ...optionalString("antiContent", antiContent),
            extractProductKnowledge,
            isKnownProduct: async (goodsId) => {
              const records = await store.listGovernedKnowledge({
                kind: "product",
                shopId: syncAccount.shopId,
                citationId: `product:${syncAccount.shopId}:${goodsId}`,
              });
              return records.length > 0;
            },
            saveProductKnowledge: async ({ product, content, tags, sourceMetadata }) => store.saveGovernedKnowledge({
              kind: "product",
              shopId: syncAccount.shopId,
              title: product.goodsName || product.goodsId,
              content,
              tags,
              sourceType: "pdd_product",
              sourceId: product.goodsId,
              sourceMetadata,
              reviewState: "draft",
              enabled: false,
              stale: false,
              conflict: false,
            }),
            onProgress: (progress) => updateProductSyncProgress(progress),
          });
          const run = await service.sync({
            mode: request.mode,
            runId,
            signal: controller.signal,
            ...optionalNumber("pageSize", request.pageSize),
            ...optionalNumber("maxPages", request.maxPages),
          });
          const sanitizedRun = sanitizeProductSyncProgress(run);
          updateProductSyncProgress(sanitizedRun);
          if (sanitizedRun.failures.length) {
            await appendDiagnostic(store, "knowledge", "product_sync_failure", {
              shopId: syncAccount.shopId,
              runId,
              provider: resolveModelProvider(await store.getSettings()),
              failures: String(sanitizedRun.failures.length),
              error: sanitizedRun.failures[0]?.error ?? "商品同步失败",
            });
          }
          await store.appendLog("info", `商品同步结束：${run.phase}，新增 ${run.added}，更新 ${run.updated}，跳过 ${run.skipped}，失败 ${run.failed}`);
          return run;
        }, controller.signal);
      })
        .then(() => undefined)
        .catch((error) => {
          const cancelled = controller.signal.aborted;
          updateProductSyncProgress({
            ...initial,
            phase: cancelled ? "cancelled" : "failed",
            failed: cancelled ? 0 : 1,
            failures: cancelled ? [] : [{
              error: sanitizeUserFacingError(error instanceof Error ? error.message : String(error)),
              retryable: true,
            }],
          });
        })
        .finally(() => {
          productSyncControllers.delete(runId);
          productSyncTasks.delete(runId);
          if (productSyncAccountRuns.get(request.accountId) === runId) {
            productSyncAccountRuns.delete(request.accountId);
          }
        });
      productSyncTasks.set(runId, task);
      return { ok: true, run: initial };
    } catch (error) {
      return { ok: false, error: sanitizeUserFacingError(error instanceof Error ? error.message : String(error)) };
    }
  });

  handle("product.sync.status", async (request) => {
    const run = productSyncRuns.get(request.runId);
    return run ? { ok: true, run } : { ok: false, error: "未找到商品同步任务。" };
  });

  handle("product.sync.cancel", async (request) => {
    const controller = productSyncControllers.get(request.runId);
    const run = productSyncRuns.get(request.runId);
    if (!controller || !run) {
      return { ok: false, error: "未找到可取消的商品同步任务。" };
    }
    controller.abort();
    const cancelled = { ...run, phase: "cancelled" as const };
    updateProductSyncProgress(cancelled);
    return { ok: true, run: cancelled };
  });

  handle("agent.audit.list", async (request) => {
    const store = await getStore();
    return { records: await store.listAgentAudit(request ?? {}) };
  });

  handle("inference.modelscope.download", async (request) => {
    try {
      const start = replaceRuntimeProvisioning();
      const requestId = request.requestId ?? crypto.randomUUID();
      const profile = getLocalModelProfileForRuntime({ modelId: request.modelId });
      if (!profile) {
        throw new Error("只能下载应用提供的 ModelScope 多模态模型。");
      }
      const modelPath = await getModelScopeManager("local").ensureModel(profile.model.url, {
        ...(profile.model.sha256 ? { expectedSha256: profile.model.sha256 } : {}),
        signal: start.signal,
        onProgress: (progress) => sendModelScopeDownloadProgress(requestId, profile.model.url, progress),
      });
      assertRuntimeStartCurrent(start);
      const mmproj = profile?.auxiliaryModels?.find((item) => item.purpose === "mmproj");
      const mmprojPath = mmproj
        ? await getModelScopeManager("local").ensureModel(mmproj.url, {
            ...(mmproj.sha256 ? { expectedSha256: mmproj.sha256 } : {}),
            signal: start.signal,
            onProgress: (progress) => sendModelScopeDownloadProgress(requestId, mmproj.url, progress),
          })
        : undefined;
      assertRuntimeStartCurrent(start);
      const store = await getStore();
      const config = await getRuntimeConfigFromRequest({
        modelId: request.modelId,
        modelPath,
        ...(mmproj ? { mmprojModelId: mmproj.url } : {}),
        ...(mmprojPath ? { mmprojPath } : {}),
      });
      await store.saveSettings({ inferenceRuntime: config });
      return toRendererModelDownloadResult({ ok: true, modelPath, ...(mmprojPath ? { mmprojPath } : {}) });
    } catch (error) {
      const message = toSafeRuntimeError(error);
      const store = await getStore();
      await appendDiagnostic(store, "inference", "modelscope_download_failure", {
        modelId: request.modelId,
        error: message,
      });
      return toRendererModelDownloadResult({ ok: false, error: sanitizeUserFacingError(message) });
    }
  });

  handle("inference.model.delete", async (request) => {
    try {
      const profile = localModelProfiles.find((item) => (
        item.id === request.modelId
        || item.model.id === request.modelId
        || item.model.url === request.modelId
      ));
      if (!profile) {
        throw new Error("只能删除应用审核过的本地模型档案。");
      }
      const auxiliaryModels = profile.auxiliaryModels ?? [];
      const requestedAuxiliaryIds = request.auxiliaryModelIds ?? [];
      if (requestedAuxiliaryIds.some((modelId) => !auxiliaryModels.some((item) => item.id === modelId || item.url === modelId))) {
        throw new Error("只能删除当前审核模型档案的辅助模型。");
      }
      const requestedAuxiliaryUrls = requestedAuxiliaryIds.map((modelId) => (
        auxiliaryModels.find((item) => item.id === modelId || item.url === modelId)!.url
      ));
      const modelIds = [...new Set([profile.model.url, ...requestedAuxiliaryUrls])];
      cancelRuntimeProvisioning();
      const store = await getStore();
      const runtime = await getRuntimeConfigFromRequest();
      const shouldClearModelPath = runtime.modelId === profile.model.url;
      const shouldClearMmprojPath = Boolean(runtime.mmprojModelId && requestedAuxiliaryUrls.includes(runtime.mmprojModelId));
      if ((shouldClearModelPath || shouldClearMmprojPath) && getRuntimeProcessManager().status().running) {
        await getRuntimeProcessManager().stop();
      }
      const manager = getModelScopeManager("local");
      const deleteResults = await Promise.all(modelIds.map((modelId) => manager.deleteModel(modelId)));
      const deleted = deleteResults.filter(Boolean).length;

      if (shouldClearModelPath || shouldClearMmprojPath) {
        await store.saveSettings({
          inferenceRuntime: {
            ...runtime,
            ...(shouldClearModelPath ? { modelPath: "" } : {}),
            ...(shouldClearMmprojPath ? { mmprojPath: "" } : {}),
          },
        });
      }
      return { ok: true, deleted };
    } catch (error) {
      const message = toSafeRuntimeError(error);
      const store = await getStore();
      await appendDiagnostic(store, "inference", "model_delete_failure", {
        modelId: request.modelId,
        error: message,
      });
      return { ok: false, deleted: 0, error: sanitizeUserFacingError(message) };
    }
  });

  handle("inference.runtime.prepare", async () => {
    try {
      const start = replaceRuntimeProvisioning();
      const runtimeConfig = await getRuntimeConfigFromRequest();
      if (!runtimeConfig.command) {
        throw new Error("推理运行命令不能为空。");
      }
      const runtimeCommand = await resolveRuntimeCommandWithDownload(
        runtimeConfig.command,
        runtimeConfig.runtimeDownloadUrl,
        runtimeConfig.runtimeDownloadSha256,
        true,
        start.signal,
      );
      assertRuntimeStartCurrent(start);
      const store = await getStore();
      const nextRuntime = {
        ...runtimeConfig,
        command: runtimeCommand,
      };
      await store.saveSettings({ inferenceRuntime: nextRuntime });
      return toRendererRuntimePrepareResult({ ok: true, runtimeCommand });
    } catch (error) {
      const message = toSafeRuntimeError(error);
      const store = await getStore();
      await appendDiagnostic(store, "inference", "runtime_prepare_failure", {
        error: message,
      });
      return toRendererRuntimePrepareResult({ ok: false, error: sanitizeUserFacingError(message) });
    }
  });

  handle("inference.runtime.start", async (request) => {
    try {
      const start = replaceRuntimeProvisioning();
      const runtimeConfig = await getRuntimeConfigFromRequest(
        request?.modelId ? { modelId: request.modelId } : {},
      );
      await ensureManagedRuntimeReady(runtimeConfig, request?.requestId ?? crypto.randomUUID(), start);
      const status = getRuntimeProcessManager().status();
      const baseUrl = getRuntimeBaseUrl(runtimeConfig);
      return {
        ok: true,
        running: status.running,
        ...(status.pid === undefined ? {} : { pid: status.pid }),
        baseUrl,
      };
    } catch (error) {
      const message = toSafeRuntimeError(error);
      const store = await getStore();
      await appendDiagnostic(store, "inference", "runtime_start_failure", {
        modelId: request?.modelId ?? "",
        error: message,
      });
      return { ok: false, running: false, error: sanitizeUserFacingError(message) };
    }
  });

  handle("inference.runtime.stop", async () => {
    try {
      const status = getRuntimeProcessManager().status();
      cancelRuntimeProvisioning();
      await getRuntimeProcessManager().stop();
      return { ok: true, running: false, ...status.running ? { pid: status.pid } : {} };
    } catch (error) {
      const message = toSafeRuntimeError(error);
      const store = await getStore();
      await appendDiagnostic(store, "inference", "runtime_stop_failure", {
        error: message,
      });
      return { ok: false, running: true, error: sanitizeUserFacingError(message) };
    }
  });

  handle("inference.runtime.status", async () => {
    const runtime = await getRuntimeConfigFromRequest();
    const profile = localModelProfiles.find(
      (item) => item.model.url === runtime.modelId || item.model.id === runtime.modelId,
    );
    const needsMmproj = Boolean(profile?.auxiliaryModels?.some((item) => item.purpose === "mmproj"));
    const modelReady = Boolean(
      runtime.modelPath
      && existsSync(runtime.modelPath)
      && (!needsMmproj || (runtime.mmprojPath && existsSync(runtime.mmprojPath))),
    );
    const runtimeAvailability = await checkRuntimeCommandAvailability(runtime);
    const processStatus = getRuntimeProcessManager().status();
    return toRendererRuntimeStatus({
      running: processStatus.running,
      ...(processStatus.pid === undefined ? {} : { pid: processStatus.pid }),
      baseUrl: getRuntimeBaseUrl(runtime),
      runtimeKind: "managed_llama_server",
      runtimeName: "应用托管 llama-server",
      modelId: runtime.modelId,
      modelReady,
      runtimeReady: runtimeAvailability.ready,
      modelPath: runtime.modelPath,
      ...(runtimeAvailability.command ? { runtimeCommand: runtimeAvailability.command } : {}),
      ...(runtimeAvailability.error ? { runtimeError: runtimeAvailability.error } : {}),
    });
  });

  handle("inference.local.profiles", async () => {
    return { profiles: [...localModelProfiles] };
  });

  handle("inference.config.get", async () => {
    const store = await getStore();
    const config = (await store.getSettings()).inference;
    if (!config) {
      return {};
    }
    const { apiKey, ...safeConfig } = config;
    return { config: { ...safeConfig, hasApiKey: Boolean(apiKey) } };
  });

  handle("inference.config.save", async (request) => {
    const store = await getStore();
    const previous = (await store.getSettings()).inference;
    const next = {
      ...request,
      ...(request.apiKey ? { apiKey: request.apiKey } : previous?.apiKey ? { apiKey: previous.apiKey } : {}),
    };
    await store.saveSettings({ inference: next });
    dependencyGovernor.reset("llm");
    if (request.apiKey && request.apiKey !== previous?.apiKey) {
      await appendDiagnostic(store, "inference", "api_key_rotated", {
        baseUrl: request.baseUrl,
        chatModel: request.chatModel,
      });
    } else {
      await store.appendLog("info", "模型 endpoint 配置已保存");
    }
    return { ok: true };
  });

  handle("inference.config.clearApiKey", async () => {
    const store = await getStore();
    const current = (await store.getSettings()).inference;
    if (!current) {
      return { ok: true };
    }
    const next = { ...current };
    delete next.apiKey;
    await store.saveSettings({ inference: next });
    await appendDiagnostic(store, "inference", "api_key_cleared", {
      baseUrl: current.baseUrl,
      chatModel: current.chatModel,
    });
    return { ok: true };
  });

  handle("inference.health", async (request) => {
    try {
      if (request?.thorough) {
        dependencyGovernor.reset("llm");
      }
      const client = await createInferenceHealthClient();
      if (request?.thorough) {
        await client.healthCheck();
      } else {
        await client.quickCheck();
      }
      if (request?.thorough) {
        dependencyGovernor.reset("llm");
        void processInboundQueue();
      }
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (request?.thorough) {
        await appendDiagnostic(await getStore(), "inference", "unhealthy_endpoint", {
          error: sanitizeUserFacingError(message),
        });
      }
      return { ok: false, error: sanitizeUserFacingError(message) };
    }
  });

  handle("settings.get", async () => {
    const store = await getStore();
    const settings = await store.getSettings();
    const runtime = await getRuntimeConfigFromRequest();
    const modelProvider = resolveModelProvider(settings);
    const defaultChatProfile = localModelProfiles.find((profile) => profile.defaultFor === "chat");
    const shouldNormalizeChatModel = Boolean(
      modelProvider === "local"
      &&
      settings.inference
      && defaultChatProfile
      && settings.inference.chatModel === runtime.modelId,
    );
    if (
      settings.modelProvider !== modelProvider
      ||
      settings.inferenceRuntime?.runtimeKind !== runtime.runtimeKind
      || settings.inferenceRuntime?.modelId !== runtime.modelId
      || settings.inferenceRuntime?.modelPath !== runtime.modelPath
      || shouldNormalizeChatModel
    ) {
      return {
        settings: toRendererSettings(await store.saveSettings({
          modelProvider,
          inferenceRuntime: runtime,
          ...(shouldNormalizeChatModel && settings.inference && defaultChatProfile
            ? { inference: { ...settings.inference, chatModel: defaultChatProfile.model.id } }
            : {}),
        })),
      };
    }
    return { settings: toRendererSettings(settings) };
  });

  handle("settings.save", async (request) => {
    const store = await getStore();
    const settings = await store.saveSettings(sanitizeRendererSettingsUpdate(request));
    return { ok: true, settings: toRendererSettings(settings) };
  });

  handle("queue.list", async (request) => {
    const store = await getStore();
    return { items: await store.listInboundQueue(request ?? {}) };
  });

  handle("queue.pause", async () => {
    const store = await getStore();
    const settings = await store.setInboundQueuePaused(true);
    return { ok: true, settings: toRendererSettings(settings) };
  });

  handle("queue.resume", async () => {
    const store = await getStore();
    const settings = await store.setInboundQueuePaused(false);
    void processInboundQueue();
    return { ok: true, settings: toRendererSettings(settings) };
  });

  handle("queue.retryDeadLetters", async (request) => {
    try {
      const store = await getStore();
      const items = await store.retryDeadLetterInboundQueueItems(request ?? {});
      void processInboundQueue();
      return { ok: true, retried: items.length, items };
    } catch (error) {
      return { ok: false, retried: 0, items: [], error: sanitizeUserFacingError(error instanceof Error ? error.message : String(error)) };
    }
  });

  handle("queue.metrics", async () => {
    const store = await getStore();
    return { metrics: await store.getInboundQueueMetrics() };
  });

  handle("dependency.health", async () => {
    return { dependencies: dependencyGovernor.snapshots() };
  });

  handle("acceptance.status", async (request) => {
    const commitSha = request?.commitSha ?? await resolveCurrentCommitSha();
    const platform = request?.platform ?? `${process.platform}-${process.arch}`;
    const tag = request?.tag;
    const records = await readAcceptanceRecords();
    const scopedRecords = tag ? records.filter((record) => !record.tag || record.tag === tag) : records;
    const result = validateAcceptanceRecordSet({ commitSha, platform, records: scopedRecords });
    return {
      ok: result.ok,
      commitSha,
      platform,
      ...(tag ? { tag } : {}),
      records: scopedRecords.length,
      errors: result.errors,
      matrix: createReleaseCapabilityMatrix(),
    };
  });

  handle("log.list", async (request) => {
    const store = await getStore();
    return { logs: await store.listLogs(request ?? {}) };
  });
}

async function resolveCurrentCommitSha(): Promise<string> {
  const envCommit = process.env.CUSTOMER_AGENT_COMMIT_SHA ?? process.env.GITHUB_SHA;
  if (envCommit?.trim()) {
    return envCommit.trim();
  }
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: path.join(dirname, "../../..") });
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

async function readAcceptanceRecords(): Promise<AcceptanceRecord[]> {
  const acceptanceDir = path.join(dirname, "../../../openspec/changes/implement-reference-feature-parity/acceptance");
  if (!existsSync(acceptanceDir)) {
    return [];
  }
  const files = await collectJsonFiles(acceptanceDir);
  const records: AcceptanceRecord[] = [];
  for (const file of files) {
    const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
    if (Array.isArray(parsed)) {
      records.push(...parsed as AcceptanceRecord[]);
    }
  }
  return records;
}

async function collectJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return files;
}

/** Stores and broadcasts product-sync progress with provider errors sanitized for UI display. */
function updateProductSyncProgress(progress: ProductSyncProgress): void {
  const snapshot = sanitizeProductSyncProgress(progress);
  productSyncRuns.set(progress.runId, snapshot);
  if (["completed", "cancelled", "failed"].includes(snapshot.phase)) {
    productSyncControllers.delete(snapshot.runId);
    const terminalRunIds = [...productSyncRuns.values()]
      .filter((run) => ["completed", "cancelled", "failed"].includes(run.phase))
      .map((run) => run.runId);
    for (const runId of terminalRunIds.slice(0, -MAX_PRODUCT_SYNC_HISTORY)) {
      productSyncRuns.delete(runId);
    }
  }
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("product.sync.progress", snapshot);
  }
}

/** Redacts every product-sync failure while preserving progress counters and retry metadata. */
function sanitizeProductSyncProgress(progress: ProductSyncProgress): ProductSyncProgress {
  return {
    ...progress,
    failures: progress.failures.map((failure) => ({
      ...failure,
      error: sanitizeUserFacingError(failure.error),
    })),
  };
}

function optionalNumber<TKey extends string>(key: TKey, value: number | undefined): { [K in TKey]?: number } {
  return value === undefined ? {} : { [key]: value } as { [K in TKey]?: number };
}

function optionalString<TKey extends string>(key: TKey, value: string | undefined): { [K in TKey]?: string } {
  return value === undefined ? {} : { [key]: value } as { [K in TKey]?: string };
}

/** Creates the isolated application window and installs its navigation security policy. */
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    title: "拼多多 AI 客服助手",
    icon: windowIconPath,
    // Keep native Windows controls, but reserve inset chrome only for macOS.
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hiddenInset" as const }
      : { autoHideMenuBar: true }),
    webPreferences: {
      preload: path.join(dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (process.platform === "win32") {
    mainWindow.removeMenu();
  }
  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });

  const devServerUrl = resolveDevServerUrl(app.isPackaged, process.env.VITE_DEV_SERVER_URL);
  applyWindowSecurity(mainWindow.webContents, devServerUrl, rendererEntryUrl.href);
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadFile(fileURLToPath(rendererEntryUrl));
  }
  mainWindow.show();
  mainWindow.focus();
}

/** Emits the packaged-smoke ready signal and requests a clean exit without starting business workers. */
async function completePackagedSmokeIfRequested(): Promise<boolean> {
  const readyFile = process.env.CUSTOMER_AGENT_PACKAGED_SMOKE_READY_FILE;
  if (!readyFile) {
    return false;
  }
  await getStore();
  await writeFile(readyFile, JSON.stringify({ ready: true, version: app.getVersion() }), "utf8");
  setImmediate(() => app.quit());
  return true;
}

/** Waits for teardown work without allowing a stuck child/browser/network task to block exit forever. */
async function settleForShutdown(operation: Promise<unknown> | undefined, label: string, timeoutMs: number): Promise<void> {
  if (!operation) {
    return;
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(() => {
      console.warn(`Shutdown timed out waiting for ${label}.`);
      finish();
    }, timeoutMs);
    operation.then(finish, (error) => {
      console.error(`Shutdown operation failed for ${label}.`, sanitizeUserFacingError(error instanceof Error ? error.message : String(error)));
      finish();
    });
  });
}

/** Stops background work and flushes owned resources before Electron exits. */
async function shutdownApplicationResources(): Promise<void> {
  isShuttingDown = true;
  cancelRuntimeProvisioning();
  if (inboundQueueWakeup) {
    clearTimeout(inboundQueueWakeup);
    inboundQueueWakeup = undefined;
  }
  for (const controller of productSyncControllers.values()) {
    controller.abort();
  }
  const browserContexts = [...pddBrowserContexts];
  const backgroundTasks = [
    inboundQueueTask,
    ...productSyncTasks.values(),
    ...activeIpcTasks,
  ];
  await Promise.all([
    settleForShutdown(pddService?.dispose(), "PDD service", 8_000),
    settleForShutdown(runtimeProcessManager?.stop(), "local runtime", 8_000),
    ...browserContexts.map((context, index) => settleForShutdown(context.close(), `PDD browser context ${index + 1}`, 8_000)),
    ...backgroundTasks.map((task, index) => settleForShutdown(task, `background task ${index + 1}`, 15_000)),
  ]);
  productSyncControllers.clear();
  productSyncTasks.clear();
  productSyncAccountRuns.clear();
  pddBrowserContexts.clear();
  documentHandles.clear();
  if (storePromise) {
    await (await storePromise).close();
  }
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  });
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) {
    return;
  }
  try {
    configureBundledPlaywright();
    await pruneRetiredModelCache();
    await createWindow();
    setupIpc();
    setupAppUpdater();
    if (await completePackagedSmokeIfRequested()) {
      return;
    }
    if (app.isPackaged) {
      setTimeout(() => {
        void checkForAppUpdates();
      }, 5_000);
    }
    void processInboundQueue();
  } catch (error) {
    console.error("Customer Agent startup failed", error);
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow().catch((windowError) => {
        console.error("Customer Agent fallback window creation failed", windowError);
      });
    }
  }
});

app.on("before-quit", (event) => {
  if (shutdownComplete) {
    return;
  }
  event.preventDefault();
  shutdownPromise ??= shutdownApplicationResources()
    .catch((error) => {
      console.error("Customer Agent shutdown failed", error);
    })
    .finally(() => {
      shutdownComplete = true;
    });
  void shutdownPromise.then(() => app.quit());
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (!isShuttingDown && !mainWindow && BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
