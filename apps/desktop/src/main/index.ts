import { app, BrowserWindow, ipcMain } from "electron";
import { createHash } from "node:crypto";
import { chmod, mkdir } from "node:fs/promises";
import { createReadStream, createWriteStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import type {
  IpcChannel,
  IpcRequest,
  IpcResponse,
  InferenceRuntimeConfig,
} from "@customer-agent/core";
import { SqliteAppStore } from "@customer-agent/db";
import { ModelScopeManager, RuntimeProcessManager, OpenAICompatibleClient } from "@customer-agent/inference";
import { LanceKnowledgeService } from "@customer-agent/knowledge";
import { PddService } from "@customer-agent/pdd";
import { appendDiagnostic, generateAndPersistReply, sanitizeUserFacingError } from "./reply.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

let storePromise: Promise<SqliteAppStore> | undefined;
let pddService: PddService | undefined;
let runtimeProcessManager: RuntimeProcessManager | undefined;
let modelScopeManager: ModelScopeManager | undefined;
let modelScopeManagerCommand: string | undefined;

const DEFAULT_RUNTIME: InferenceRuntimeConfig = {
  provider: "llama_cpp",
  modelId: "",
  modelPath: "",
  command: "llama-server",
  host: "127.0.0.1",
  port: 8000,
};
const RUNTIME_BINARY_NAME = "llama-server";
const RUNTIME_DOWNLOAD_ENV_PREFIX = "CUSTOMER_AGENT_LLAMA_RUNTIME_URL";
const RUNTIME_DOWNLOAD_CHECKSUM_ENV = "CUSTOMER_AGENT_LLAMA_RUNTIME_SHA256";

function configureBundledPlaywright() {
  const browsersPath = app.isPackaged
    ? path.join(process.resourcesPath, "playwright-browsers")
    : path.join(dirname, "../../build/playwright-browsers");
  if (app.isPackaged && !existsSync(browsersPath)) {
    throw new Error(`RELEASE_BLOCKING_DIAGNOSTIC: packaged Playwright browser runtime missing at ${browsersPath}`);
  }
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
}

function getStore(): Promise<SqliteAppStore> {
  storePromise ??= SqliteAppStore.open(path.join(app.getPath("userData"), "data"));
  return storePromise;
}

function getRuntimeProcessManager(): RuntimeProcessManager {
  runtimeProcessManager ??= new RuntimeProcessManager();
  return runtimeProcessManager;
}

function getRuntimeDataDir(): string {
  return path.join(app.getPath("userData"), "runtime-models");
}

function getRuntimeCachePath(binary: string): string {
  const binaryName = getRuntimeBinaryName(binary);
  const platformDir = `${process.platform}-${process.arch}`;
  return path.join(getRuntimeDataDir(), "binaries", platformDir, binaryName);
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
  return process.env[envKey]?.trim() || process.env[RUNTIME_DOWNLOAD_ENV_PREFIX]?.trim();
}

function getRuntimeDownloadChecksumCandidate(requestedChecksum?: string): string | undefined {
  if (requestedChecksum?.trim()) {
    return requestedChecksum.trim().toLowerCase();
  }
  return process.env[RUNTIME_DOWNLOAD_CHECKSUM_ENV]?.trim()?.toLowerCase();
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

async function downloadRuntimeBinary(url: string, filePath: string, expectedSha256?: string): Promise<void> {
  const fileName = fileNameFromUrl(url);
  const binaryName = getRuntimeBinaryName(fileName);
  if (binaryName !== path.basename(filePath) || !binaryName.toLowerCase().includes("llama")) {
    throw new Error(`下载链接返回文件“${binaryName}”，不是可执行的 llama.cpp 运行时文件。建议链接直接指向单文件二进制。`);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载运行时失败（${url}）：HTTP ${response.status}`);
  }

  if (!response.body) {
    throw new Error(`下载运行时失败（${url}）：响应体为空。`);
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  const destination = createWriteStream(filePath);
  await pipeline(response.body as unknown as NodeJS.ReadableStream, destination);

  await verifyDownloadChecksum(filePath, expectedSha256);
  await ensureBinaryExecutable(filePath);
}

async function resolveRuntimeCommandWithDownload(
  command: string,
  runtimeDownloadUrl?: string,
  runtimeDownloadSha256?: string,
  allowDownload = true,
): Promise<string> {
  const trimmed = command.trim();
  if (!trimmed) {
    throw new Error("推理运行命令不能为空。");
  }

  if (trimmed.includes(path.sep) || trimmed.includes("/")) {
    const directCommand = path.normalize(trimmed);
    if (!existsSync(directCommand)) {
      throw new Error(`未找到指定运行时命令：${directCommand}`);
    }
    return directCommand;
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

  const cached = getRuntimeCachePath(trimmed);
  if (await isExistingExecutable(cached)) {
    await ensureBinaryExecutable(cached);
    return cached;
  }

  if (!allowDownload) {
    throw new Error(`未检测到命令 ${trimmed}。请在设置中配置运行时下载链接，或将 llama-server 运行时放入 ${process.resourcesPath}/runtime。`);
  }

  const downloadUrl = getRuntimeDownloadCandidate(runtimeDownloadUrl);
  if (!downloadUrl) {
    throw new Error(`未检测到 llama-server 运行时。请先在系统 PATH 设置命令，或在“运行时下载链接”配置可下载的单文件二进制。`);
  }

  const runtimeDownloadSha256Value = getRuntimeDownloadChecksumCandidate(runtimeDownloadSha256);
  await downloadRuntimeBinary(downloadUrl, cached, runtimeDownloadSha256Value);
  return cached;
}

function isLlamaRuntimeCommand(command: string): boolean {
  return getRuntimeBinaryName(command).toLowerCase().startsWith(RUNTIME_BINARY_NAME) || command.toLowerCase().includes("llama");
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

function getPddService(): PddService {
  pddService ??= new PddService({
    dataDir: app.getPath("userData"),
    getAccount: async (accountId) => (await getStore()).getAccount(accountId),
    saveAccount: async (account) => (await getStore()).upsertAccount(account),
    saveMessage: async (message) => (await getStore()).upsertMessage(message),
    onMessageReceived: async (message) => {
      const store = await getStore();
      const { replyMode } = await store.getSettings();
      const result = await generateAndPersistReply(
        { context: message, mode: replyMode },
        { store, createInferenceClient, createKnowledgeService },
      );
      if (result.ok && replyMode === "automatic") {
        await getPddService().sendMessage(message.id, result.reply.text);
      }
    },
    getMessage: async (messageId) => (await getStore()).getMessage(messageId),
    saveDraft: async (draft) => (await getStore()).saveDraft(draft),
    getDraft: async (draftId) => (await getStore()).getDraft(draftId),
    log: async (level, message) => { await (await getStore()).appendLog(level, message); },
  });
  return pddService;
}

function handle<TChannel extends IpcChannel>(
  channel: TChannel,
  listener: (request: IpcRequest<TChannel>) => Promise<IpcResponse<TChannel>> | IpcResponse<TChannel>,
) {
  ipcMain.handle(channel, async (_event, request: IpcRequest<TChannel>) => listener(request));
}

async function createInferenceClient(): Promise<OpenAICompatibleClient> {
  const store = await getStore();
  const settings = await store.getSettings();
  if (!settings.inference) {
    const error = new Error("请先在模型设置中配置 OpenAI 兼容 endpoint。");
    await appendDiagnostic(store, "inference", "missing_endpoint_config", {
      error: error.message,
    });
    throw error;
  }
  if (!settings.inference.baseUrl.trim() || !settings.inference.chatModel.trim() || !settings.inference.embeddingModel.trim()) {
    const error = new Error("OpenAI 兼容 endpoint 配置不完整。");
    await appendDiagnostic(store, "inference", "missing_endpoint_config", {
      baseUrl: settings.inference.baseUrl,
      chatModel: settings.inference.chatModel,
      embeddingModel: settings.inference.embeddingModel,
      error: error.message,
    });
    throw error;
  }
  return new OpenAICompatibleClient(settings.inference);
}

async function createKnowledgeService(): Promise<LanceKnowledgeService> {
  const store = await getStore();
  const settings = await store.getSettings();
  const client = await createInferenceClient();
  return new LanceKnowledgeService({
    dataDir: path.join(app.getPath("userData"), "knowledge"),
    chunkSize: settings.knowledge.chunkSize,
    chunkOverlap: settings.knowledge.chunkOverlap,
    embed: (text) => client.embed(text),
  });
}

async function getRuntimeConfigFromRequest(
  request: Partial<InferenceRuntimeConfig> = {},
): Promise<InferenceRuntimeConfig> {
  const store = await getStore();
  const settings = await store.getSettings();
  return {
    ...DEFAULT_RUNTIME,
    ...(settings.inferenceRuntime ?? {}),
    ...request,
    modelPath: request.modelPath ?? settings.inferenceRuntime?.modelPath ?? "",
  };
}

function getRuntimeBaseUrl(runtimeConfig: InferenceRuntimeConfig): string {
  return `http://${runtimeConfig.host}:${runtimeConfig.port}/v1`;
}

function inferRuntimeArgs(command: string, host: string, port: number, modelPath: string, commandArgs?: string[]): string[] | undefined {
  if (commandArgs?.length) {
    return commandArgs;
  }
  const binary = path.basename(command).toLowerCase();
  if (binary.includes("llama")) {
    return ["-m", modelPath, "--host", host ?? "127.0.0.1", "--port", String(port)];
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

  handle("account.login", async (request) => {
    const store = await getStore();
    const result = await getPddService().login(request);
    if (!result.ok) {
      await appendDiagnostic(store, "pdd", "session_expiry", {
        username: request.username,
        error: result.error ?? "拼多多登录失败",
      });
      return result;
    }
    return result;
  });

  handle("account.list", async () => {
    const store = await getStore();
    return { accounts: await store.listAccounts() };
  });

  handle("account.start", async (request) => {
    return getPddService().startAccount(request.accountId);
  });

  handle("account.stop", async (request) => {
    return getPddService().stopAccount(request.accountId);
  });

  handle("message.list", async (request) => {
    const store = await getStore();
    return { messages: await store.listMessages(request ?? {}) };
  });

  handle("message.send", async (request) => {
    return getPddService().sendMessage(request.messageId, request.text);
  });

  handle("reply.generate", async (request) => {
    const store = await getStore();
    const result = await generateAndPersistReply(request, {
      store,
      createInferenceClient,
      createKnowledgeService,
    });
    return result.ok ? { ok: true, reply: result.reply } : { ok: false, error: result.error };
  });

  handle("reply.draft.list", async (request) => {
    const store = await getStore();
    return { drafts: await store.listDrafts(request ?? {}) };
  });

  handle("reply.draft.send", async (request) => getPddService().sendDraft(request.draftId, request.text));
  handle("reply.draft.ignore", async (request) => getPddService().ignoreDraft(request.draftId));
  handle("reply.draft.escalate", async (request) => getPddService().escalateDraft(request.draftId));

  handle("knowledge.import", async (request) => {
    try {
      const store = await getStore();
      const knowledge = await createKnowledgeService();
      const document = await knowledge.importFile(request);
      await store.saveKnowledgeDocument(document);
      await store.appendLog("info", `知识库文件已导入：${document.fileName}`);
      return { ok: true, document };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const store = await getStore();
      await appendDiagnostic(store, "knowledge", "import_failure", {
        filePath: request.filePath,
        scope: request.scope,
        shopId: request.shopId ?? "",
        error: message,
      });
      return { ok: false, error: sanitizeUserFacingError(message) };
    }
  });

  handle("knowledge.list", async (request) => {
    const store = await getStore();
    return { documents: await store.listKnowledgeDocuments(request ?? {}) };
  });

  handle("knowledge.search", async (request) => {
    try {
      const knowledge = await createKnowledgeService();
      return { results: await knowledge.search(request) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const store = await getStore();
      await appendDiagnostic(store, "knowledge", "search_failure", {
        shopId: request.shopId ?? "",
        query: request.query,
        error: message,
      });
      return { results: [] };
    }
  });

  handle("inference.modelscope.download", async (request) => {
    try {
      const modelPath = await getModelScopeManager("local").ensureModel(request.modelId);
      const store = await getStore();
      const config = await getRuntimeConfigFromRequest({ modelId: request.modelId, modelPath });
      await store.saveSettings({ inferenceRuntime: config });
      return { ok: true, modelPath };
    } catch (error) {
      const message = toSafeRuntimeError(error);
      const store = await getStore();
      await appendDiagnostic(store, "inference", "modelscope_download_failure", {
        modelId: request.modelId,
        error: message,
      });
      return { ok: false, modelPath: "", error: sanitizeUserFacingError(message) };
    }
  });

  handle("inference.runtime.prepare", async () => {
    try {
      const runtimeConfig = await getRuntimeConfigFromRequest();
      const runtimeCommand = await resolveRuntimeCommandWithDownload(
        runtimeConfig.command,
        runtimeConfig.runtimeDownloadUrl,
        runtimeConfig.runtimeDownloadSha256,
      );
      const store = await getStore();
      const nextRuntime = {
        ...runtimeConfig,
        command: runtimeCommand,
      };
      await store.saveSettings({ inferenceRuntime: nextRuntime });
      return { ok: true, runtimeCommand };
    } catch (error) {
      const message = toSafeRuntimeError(error);
      const store = await getStore();
      await appendDiagnostic(store, "inference", "runtime_prepare_failure", {
        error: message,
      });
      return { ok: false, error: sanitizeUserFacingError(message) };
    }
  });

  handle("inference.runtime.start", async (request) => {
    try {
      const requestConfig = request === undefined ? {} : request;
      const runtimeConfig = await getRuntimeConfigFromRequest(requestConfig);
      const runtimeCommand = await resolveRuntimeCommandWithDownload(
        runtimeConfig.command,
        runtimeConfig.runtimeDownloadUrl,
        runtimeConfig.runtimeDownloadSha256,
      );
      runtimeConfig.command = runtimeCommand;
      let modelPath = runtimeConfig.modelPath;
      if (!modelPath) {
        modelPath = await getModelScopeManager("local").ensureModel(runtimeConfig.modelId);
      }

      const store = await getStore();
      const needsPersistRuntime =
        runtimeConfig.modelPath !== modelPath || runtimeConfig.command !== runtimeCommand;
      if (needsPersistRuntime) {
        runtimeConfig.modelPath = modelPath;
        runtimeConfig.command = runtimeCommand;
        await store.saveSettings({ inferenceRuntime: runtimeConfig });
      }

      const runtimeArgs = inferRuntimeArgs(runtimeConfig.command, runtimeConfig.host, runtimeConfig.port, modelPath, runtimeConfig.commandArgs);

      const status = await getRuntimeProcessManager().start({
        command: runtimeConfig.command,
        modelPath,
        port: runtimeConfig.port,
        host: runtimeConfig.host,
        ...(runtimeArgs ? { args: runtimeArgs } : {}),
      });

      const baseUrl = getRuntimeBaseUrl(runtimeConfig);
      const inference = (await store.getSettings()).inference;
      const nextInference = inference
        ? {
            ...inference,
            baseUrl,
            ...((typeof inference.chatModel === "string" && inference.chatModel.trim() !== "") ? {} : { chatModel: runtimeConfig.modelId }),
            ...((typeof inference.embeddingModel === "string" && inference.embeddingModel.trim() !== "") ? {} : { embeddingModel: runtimeConfig.modelId }),
          }
        : {
            baseUrl,
            chatModel: runtimeConfig.modelId,
            embeddingModel: runtimeConfig.modelId,
          };
      await store.saveSettings({ inference: nextInference, inferenceRuntime: { ...runtimeConfig, modelPath } });
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
        modelId: (request as Partial<InferenceRuntimeConfig> | undefined)?.modelId ?? "",
        command: (request as Partial<InferenceRuntimeConfig> | undefined)?.command ?? "",
        error: message,
      });
      return { ok: false, running: false, error: sanitizeUserFacingError(message) };
    }
  });

  handle("inference.runtime.stop", async () => {
    try {
      const status = getRuntimeProcessManager().status();
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
    const store = await getStore();
    const settings = await store.getSettings();
    const status = getRuntimeProcessManager().status();
    const runtime = settings.inferenceRuntime;
    const runtimeCommand = runtime?.command;
    let runtimeReady = false;
    let runtimeError: string | undefined;
    if (runtimeCommand) {
      try {
        const resolved = await resolveRuntimeCommandWithDownload(
          runtimeCommand,
          runtime.runtimeDownloadUrl,
          runtime.runtimeDownloadSha256,
          false,
        );
        runtimeReady = true;
        runtime.command = resolved;
      } catch (error) {
        runtimeReady = false;
        runtimeError = sanitizeUserFacingError(toSafeRuntimeError(error));
      }
    }
    return {
      ...status,
      ...(runtime
        ? {
            baseUrl: getRuntimeBaseUrl(runtime),
            host: runtime.host,
            port: runtime.port,
            modelPath: runtime.modelPath,
            modelId: runtime.modelId,
            runtimeCommand: runtime.command,
            runtimeReady,
            ...(runtimeError ? { runtimeError } : {}),
          }
        : { runtimeReady: false, runtimeError: "未配置推理运行时。" }),
    };
  });

  handle("inference.config.get", async () => {
    const store = await getStore();
    const config = (await store.getSettings()).inference;
    return config ? { config } : {};
  });

  handle("inference.config.save", async (request) => {
    const store = await getStore();
    await store.saveSettings({ inference: request });
    await store.appendLog("info", "模型 endpoint 配置已保存");
    return { ok: true };
  });

  handle("inference.health", async () => {
    try {
      const client = await createInferenceClient();
      await client.healthCheck();
      return { ok: true };
    } catch (error) {
      const store = await getStore();
      const message = error instanceof Error ? error.message : String(error);
      await appendDiagnostic(store, "inference", "unhealthy_endpoint", {
        error: message,
      });
      return { ok: false, error: sanitizeUserFacingError(message) };
    }
  });

  handle("settings.get", async () => {
    const store = await getStore();
    return { settings: await store.getSettings() };
  });

  handle("settings.save", async (request) => {
    const store = await getStore();
    const settings = await store.saveSettings(request);
    return { ok: true, settings };
  });

  handle("log.list", async (request) => {
    const store = await getStore();
    return { logs: await store.listLogs(request ?? {}) };
  });
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 720,
    title: "拼多多 AI 客服助手",
    // macOS: let the sidebar run edge-to-edge under inset traffic lights.
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await window.loadURL(devServerUrl);
  } else {
    await window.loadFile(path.join(dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  configureBundledPlaywright();
  setupIpc();
  void createWindow();
});

app.on("before-quit", () => {
  void getRuntimeProcessManager().stop();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
