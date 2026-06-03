import { app, BrowserWindow, ipcMain } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LangChainReplyWorkflow } from "@customer-agent/agents";
import type { IpcChannel, IpcRequest, IpcResponse, ReplyDraftRecord } from "@customer-agent/core";
import { SqliteAppStore } from "@customer-agent/db";
import { OpenAICompatibleClient } from "@customer-agent/inference";
import { LanceKnowledgeService } from "@customer-agent/knowledge";
import { PddService } from "@customer-agent/pdd";

const dirname = path.dirname(fileURLToPath(import.meta.url));

let storePromise: Promise<SqliteAppStore> | undefined;
let pddService: PddService | undefined;

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

function getPddService(): PddService {
  pddService ??= new PddService({
    dataDir: app.getPath("userData"),
    getAccount: async (accountId) => (await getStore()).getAccount(accountId),
    saveAccount: async (account) => (await getStore()).upsertAccount(account),
    saveMessage: async (message) => (await getStore()).upsertMessage(message),
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
    try {
      const store = await getStore();
      const settings = await store.getSettings();
      const client = await createInferenceClient();
      const knowledge = await createKnowledgeService();
      const workflow = new LangChainReplyWorkflow({
        invokeModel: (prompt) => client.chat(prompt),
        searchKnowledge: (input) => knowledge.search({ ...input, topK: settings.knowledge.topK }),
      });
      const reply = await workflow.generate(request);
      if (request.mode === "human_review") {
        const draft: ReplyDraftRecord = {
          id: crypto.randomUUID(),
          messageId: request.context.id,
          accountId: request.context.accountId,
          shopId: request.context.shopId,
          mode: request.mode,
          reply,
          state: "draft_ready",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await store.saveDraft(draft);
      }
      return { ok: true, reply };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const store = await getStore();
      await appendDiagnostic(store, "inference", "reply_generation_failure", {
        accountId: request.context.accountId,
        shopId: request.context.shopId,
        messageId: request.context.id,
        error: message,
      });
      return { ok: false, error: sanitizeUserFacingError(message) };
    }
  });

  handle("reply.draft.list", async (request) => {
    const store = await getStore();
    return { drafts: await store.listDrafts(request ?? {}) };
  });

  handle("reply.draft.send", async (request) => getPddService().sendDraft(request.draftId));
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

async function appendDiagnostic(
  store: SqliteAppStore,
  subsystem: "pdd" | "inference" | "knowledge",
  code: string,
  context: Record<string, string>,
): Promise<void> {
  const timestamp = new Date().toISOString();
  const fields = Object.entries(context)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key, value]) => `${key}=${sanitizeLogValue(value)}`)
    .join(" ");
  await store.appendLog("error", `诊断[${subsystem}/${code}] ${timestamp} ${fields}`.trim());
}

function sanitizeLogValue(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").slice(0, 300);
}

function sanitizeUserFacingError(value: string): string {
  return value
    .replace(/diagnosis?\[[^\]]+\]\s*/gi, "")
    .replace(/https?:\/\/\S+/g, "")
    .trim();
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 720,
    title: "拼多多 AI 客服助手",
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
