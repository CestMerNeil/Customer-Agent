import path from "node:path";
import type {
  AccountLoginRequest,
  AccountLoginResult,
  AccountRecord,
  MessageRecord,
  ReplyDraftRecord
} from "@customer-agent/core";
import { PddApi } from "./api.js";
import { PddHttpClient } from "./client.js";
import { cookieListToJar, parseCookieJar, type BrowserCookie } from "./cookies.js";
import { normalizePddMessage } from "./normalizer.js";

interface PddRuntimeConnection {
  accountId: string;
  socket: WebSocket;
  stopped: boolean;
}

interface PddServiceOptions {
  dataDir?: string;
  getAccount?: (accountId: string) => Promise<AccountRecord | undefined>;
  saveAccount?: (account: Omit<AccountRecord, "id" | "createdAt" | "updatedAt"> & { id?: string }) => Promise<AccountRecord>;
  saveMessage?: (message: Omit<MessageRecord, "updatedAt">) => Promise<MessageRecord>;
  getMessage?: (messageId: string) => Promise<MessageRecord | undefined>;
  saveDraft?: (draft: ReplyDraftRecord) => Promise<ReplyDraftRecord>;
  getDraft?: (draftId: string) => Promise<ReplyDraftRecord | undefined>;
  log?: (level: "info" | "warning" | "error", message: string) => Promise<void>;
  fetchImpl?: typeof fetch;
  WebSocketCtor?: typeof WebSocket;
  loginTimeoutMs?: number;
}

interface PlaywrightModule {
  chromium: {
    launchPersistentContext: (
      userDataDir: string,
      options: {
        headless: boolean;
        args: string[];
      },
    ) => Promise<{
      pages(): Array<PlaywrightPage>;
      newPage(): Promise<PlaywrightPage>;
      cookies(): Promise<BrowserCookie[]>;
      close(): Promise<void>;
    }>;
  };
}

interface PlaywrightPage {
  goto(url: string): Promise<void>;
  click(selector: string, options?: { timeout?: number }): Promise<void>;
  fill(selector: string, value: string, options?: { timeout?: number }): Promise<void>;
  waitForFunction(fn: string, arg?: unknown, options?: { timeout?: number }): Promise<void>;
}

export class PddService {
  private readonly connections = new Map<string, PddRuntimeConnection>();

  constructor(private readonly options: PddServiceOptions = {}) {}

  async login(request: AccountLoginRequest): Promise<AccountLoginResult> {
    if (!request.username.trim()) {
      return { ok: false, error: "请输入拼多多账号" };
    }
    if (!this.options.dataDir || !this.options.saveAccount) {
      return { ok: false, error: "PDD 登录服务缺少 dataDir 或账号保存回调。" };
    }

    try {
      const playwright = await loadPlaywright();
      const userDataDir = path.join(this.options.dataDir, "pdd-profiles", safePathSegment(request.username));
      const context = await playwright.chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
          "--disable-gpu",
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--disable-blink-features=AutomationControlled",
          "--disable-notifications",
        ],
      });
      try {
        const page = context.pages()[0] ?? await context.newPage();
        await page.goto("https://mms.pinduoduo.com/login");
        await tryClick(page, "div.Common_item__3diIn:has-text('账号登录')");
        await tryFill(page, "input[type='text']", request.username);
        if (request.password) {
          await tryFill(page, "input[type='password']", request.password);
          await tryClick(page, "button:has-text('登录')");
        }
        await page.waitForFunction(
          "() => document.title === '拼多多 商家后台' || document.title === '首页' || document.title === '订单查询' || location.href.includes('/home')",
          undefined,
          { timeout: this.options.loginTimeoutMs ?? 120_000 },
        );
        const cookies = cookieListToJar(await context.cookies());
        const api = this.createApi(cookies);
        const [userInfo, shopInfo] = await Promise.all([api.getUserInfo(), api.getShopInfo()]);
        const account = await this.options.saveAccount({
          channel: "pinduoduo",
          username: request.username,
          userId: userInfo.userId,
          shopId: shopInfo.shopId,
          shopName: shopInfo.shopName,
          status: "online",
          cookies: JSON.stringify(cookies),
        });
        await this.log("info", `拼多多账号登录成功：${request.username}`);
        return { ok: true, accountId: account.id, shopId: account.shopId };
      } finally {
        await context.close();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.log("error", `拼多多登录失败：${message}`);
      return { ok: false, error: message };
    }
  }

  async startAccount(accountId: string): Promise<{ ok: boolean; error?: string }> {
    const account = await this.options.getAccount?.(accountId);
    if (!account) {
      return { ok: false, error: "找不到要启动的拼多多账号。" };
    }
    if (this.connections.has(accountId)) {
      return { ok: true };
    }
    try {
      const api = this.createApi(account.cookies);
      const token = await api.getChatToken();
      await api.setOnlineStatus("1");
      const SocketCtor = this.options.WebSocketCtor ?? globalThis.WebSocket;
      if (!SocketCtor) {
        throw new Error("当前 Node/Electron 运行时没有 WebSocket 构造器。");
      }
      const params = new URLSearchParams({
        access_token: token,
        role: "mall_cs",
        client: "web",
        version: "202506091557",
      });
      const socket = new SocketCtor(`wss://m-ws.pinduoduo.com/?${params.toString()}`);
      const connection: PddRuntimeConnection = { accountId, socket, stopped: false };
      this.connections.set(accountId, connection);
      socket.onmessage = (event) => {
        void this.handleSocketMessage(account, event.data);
      };
      socket.onclose = () => {
        this.connections.delete(accountId);
        if (!connection.stopped) {
          void this.log("warning", `拼多多 WebSocket 已断开：${account.username}`);
        }
      };
      socket.onerror = () => {
        void this.log("error", `拼多多 WebSocket 连接错误：${account.username}`);
      };
      await this.options.saveAccount?.(withoutRuntimeAccountFields({ ...account, status: "online" }));
      await this.log("info", `拼多多账号已启动：${account.username}`);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.options.saveAccount?.(withoutRuntimeAccountFields({ ...account, status: "error", error: message }));
      await this.log("error", `启动拼多多账号失败：${message}`);
      return { ok: false, error: message };
    }
  }

  async stopAccount(accountId: string): Promise<{ ok: boolean; error?: string }> {
    const connection = this.connections.get(accountId);
    if (connection) {
      connection.stopped = true;
      connection.socket.close();
      this.connections.delete(accountId);
    }
    const account = await this.options.getAccount?.(accountId);
    if (account) {
      await this.options.saveAccount?.(withoutRuntimeAccountFields({ ...account, status: "offline" }));
      await this.log("info", `拼多多账号已停止：${account.username}`);
    }
    return { ok: true };
  }

  async sendMessage(messageId: string, text: string): Promise<{ ok: boolean; error?: string }> {
    const message = await this.options.getMessage?.(messageId);
    if (!message) {
      return { ok: false, error: "找不到要回复的消息。" };
    }
    const account = await this.options.getAccount?.(message.accountId);
    if (!account) {
      return { ok: false, error: "找不到消息对应的账号。" };
    }
    const result = await this.createApi(account.cookies).sendText(message.buyerId, text);
    if (!result.ok) {
      await this.options.saveMessage?.(withoutMessageRuntimeFields({ ...message, state: "failed", ...(result.error ? { error: result.error } : {}) }));
      await this.log("error", `拼多多消息发送失败：${result.error ?? "未知错误"}`);
      return result;
    }
    await this.options.saveMessage?.(withoutMessageRuntimeFields({ ...message, state: "sent", replyText: text }));
    return { ok: true };
  }

  async sendDraft(draftId: string): Promise<{ ok: boolean; error?: string }> {
    const draft = await this.options.getDraft?.(draftId);
    if (!draft) {
      return { ok: false, error: "找不到要发送的草稿。" };
    }
    const result = await this.sendMessage(draft.messageId, draft.reply.text);
    if (!result.ok) {
      await this.options.saveDraft?.({ ...draft, state: "failed", updatedAt: new Date().toISOString() });
      return result;
    }
    await this.options.saveDraft?.({ ...draft, state: "sent", updatedAt: new Date().toISOString() });
    return { ok: true };
  }

  private async handleSocketMessage(account: AccountRecord, data: unknown): Promise<void> {
    const payload = typeof data === "string" ? JSON.parse(data) as Record<string, unknown> : JSON.parse(String(data)) as Record<string, unknown>;
    const context = normalizePddMessage(payload, { accountId: account.id, shopId: account.shopId });
    await this.options.saveMessage?.({ ...context, state: "received" });
  }

  private createApi(cookies: string | Record<string, string> | undefined): PddApi {
    const clientOptions = {
      cookies: parseCookieJar(cookies),
      ...(this.options.fetchImpl ? { fetchImpl: this.options.fetchImpl } : {}),
    };
    return new PddApi({ http: new PddHttpClient(clientOptions) });
  }

  private async log(level: "info" | "warning" | "error", message: string): Promise<void> {
    await this.options.log?.(level, message);
  }
}

async function loadPlaywright(): Promise<PlaywrightModule> {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;
    return await dynamicImport("playwright") as PlaywrightModule;
  } catch {
    throw new Error("缺少 Node Playwright 依赖，请安装 playwright 后再使用拼多多真实登录。");
  }
}

async function tryClick(page: PlaywrightPage, selector: string): Promise<void> {
  try {
    await page.click(selector, { timeout: 5_000 });
  } catch {
    // Some PDD sessions may already be past the login method selection.
  }
}

async function tryFill(page: PlaywrightPage, selector: string, value: string): Promise<void> {
  try {
    await page.fill(selector, value, { timeout: 5_000 });
  } catch {
    // Manual login remains supported when the field is absent or hidden.
  }
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function withoutRuntimeAccountFields(
  account: AccountRecord,
): Omit<AccountRecord, "id" | "createdAt" | "updatedAt"> & { id?: string } {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = account;
  return rest;
}

function withoutMessageRuntimeFields(message: MessageRecord): Omit<MessageRecord, "updatedAt"> {
  const { updatedAt: _updatedAt, ...rest } = message;
  return rest;
}
