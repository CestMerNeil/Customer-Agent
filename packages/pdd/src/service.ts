import path from "node:path";
import WebSocketRuntime from "ws";
import { canTransitionMessageState } from "@customer-agent/core";
import type {
  AccountLoginRequest,
  AccountLoginResult,
  AccountRecord,
  MessageRecord,
  ReplyDraftRecord
} from "@customer-agent/core";
import { PddApi } from "./api.js";
import { PddHttpClient } from "./client.js";
import { pddWsBaseUrl } from "./endpoints.js";
import { cookieListToJar, parseCookieJar, type BrowserCookie } from "./cookies.js";
import { normalizePddMessage } from "./normalizer.js";

interface PddRuntimeConnection {
  accountId: string;
  socket: WebSocket;
  stopped: boolean;
}

type DraftAction = "sent" | "ignored" | "escalated";

interface PddServiceOptions {
  dataDir?: string;
  getAccount?: (accountId: string) => Promise<AccountRecord | undefined>;
  saveAccount?: (account: Omit<AccountRecord, "id" | "createdAt" | "updatedAt"> & { id?: string }) => Promise<AccountRecord>;
  saveMessage?: (message: Omit<MessageRecord, "updatedAt">) => Promise<MessageRecord>;
  onMessageReceived?: (message: MessageRecord) => Promise<void>;
  getMessage?: (messageId: string) => Promise<MessageRecord | undefined>;
  saveDraft?: (draft: ReplyDraftRecord) => Promise<ReplyDraftRecord>;
  getDraft?: (draftId: string) => Promise<ReplyDraftRecord | undefined>;
  log?: (level: "info" | "warning" | "error", message: string) => Promise<void>;
  fetchImpl?: typeof fetch;
  WebSocketCtor?: typeof WebSocket;
  playwright?: PlaywrightModule;
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
  waitForURL(pattern: string, options?: { timeout?: number }): Promise<void>;
  waitForLoadState(state?: "load" | "domcontentloaded" | "networkidle", options?: { timeout?: number }): Promise<void>;
  waitForTimeout(timeout: number): Promise<void>;
  title(): Promise<string>;
  url(): string;
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
      const playwright = this.options.playwright ?? await loadPlaywright();
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
        const refreshed = await this.refreshExistingSession(page);
        if (!refreshed) {
          await this.performPasswordLogin(page, request);
        }
        const account = await this.finalizeLogin(page, context, request.username);
        await this.log("info", `拼多多账号登录成功：${request.username}`);
        return { ok: true, accountId: account.id, shopId: account.shopId };
      } finally {
        await context.close();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.logDiagnostic("pdd", "session_expiry", {
        account: request.username,
        error: message,
      });
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
      let token: string;
      try {
        token = await api.getChatToken();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.logDiagnostic("pdd", "token_retrieval_failure", {
          accountId,
          shopId: account.shopId,
          username: account.username,
          error: message,
        });
        throw error;
      }
      try {
        await api.setOnlineStatus("1");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.logDiagnostic("pdd", "token_retrieval_failure", {
          accountId,
          shopId: account.shopId,
          username: account.username,
          error: message,
          step: "set-online-status",
        });
        throw error;
      }
      const SocketCtor = this.options.WebSocketCtor ?? resolveWebSocketCtor();
      if (!SocketCtor) {
        throw new Error("当前 Node/Electron 运行时没有 WebSocket 构造器。");
      }
      const params = new URLSearchParams({
        access_token: token,
        role: "mall_cs",
        client: "web",
        version: "202506091557",
      });
      const socket = new SocketCtor(`${pddWsBaseUrl()}/?${params.toString()}`);
      const connection: PddRuntimeConnection = { accountId, socket, stopped: false };
      this.connections.set(accountId, connection);
      socket.onmessage = (event) => {
        void this.handleSocketMessage(account, event.data);
      };
      socket.onclose = () => {
        this.connections.delete(accountId);
        if (!connection.stopped) {
          void this.logDiagnostic("pdd", "websocket_unexpected_close", {
            accountId,
            shopId: account.shopId,
            username: account.username,
          });
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
      await this.logDiagnostic("pdd", "send_message_failure", {
        accountId: account.id,
        shopId: account.shopId,
        messageId,
        buyerId: message.buyerId,
        error: result.error ?? "未知错误",
      });
      await this.log("error", `拼多多消息发送失败：${result.error ?? "未知错误"}`);
      return result;
    }
    await this.options.saveMessage?.(withoutMessageRuntimeFields({ ...message, state: "sent", replyText: text }));
    return { ok: true };
  }

  async sendDraft(draftId: string, overrideText?: string): Promise<{ ok: boolean; error?: string }> {
    const draft = await this.options.getDraft?.(draftId);
    if (!draft) {
      return { ok: false, error: "找不到要发送的草稿。" };
    }
    const message = await this.options.getMessage?.(draft.messageId);
    if (!message) {
      return { ok: false, error: "找不到草稿对应的消息。" };
    }
    const transitionError = this.validateDraftAction({ draft, message, targetState: "sent" });
    if (transitionError) {
      return transitionError;
    }
    // When the operator edited the draft in the review workspace, persist the
    // edited text into the draft before sending so the stored record matches
    // what was actually sent.
    const edited = overrideText?.trim();
    const outgoing = edited && edited.length > 0 ? edited : draft.reply.text;
    const draftToSend =
      edited && edited.length > 0 && edited !== draft.reply.text
        ? { ...draft, reply: { ...draft.reply, text: edited } }
        : draft;
    const result = await this.sendMessage(draftToSend.messageId, outgoing);
    if (!result.ok) {
      await this.options.saveDraft?.({ ...draftToSend, state: "failed", updatedAt: new Date().toISOString() });
      return result;
    }
    await this.options.saveDraft?.({ ...draftToSend, state: "sent", updatedAt: new Date().toISOString() });
    return { ok: true };
  }

  async ignoreDraft(draftId: string): Promise<{ ok: boolean; error?: string }> {
    const draft = await this.options.getDraft?.(draftId);
    if (!draft) {
      return { ok: false, error: "找不到要忽略的草稿。" };
    }
    const message = await this.options.getMessage?.(draft.messageId);
    if (!message) {
      return { ok: false, error: "找不到草稿对应的消息。" };
    }
    const transitionError = this.validateDraftAction({ draft, message, targetState: "ignored" });
    if (transitionError) {
      return transitionError;
    }
    const now = new Date().toISOString();
    await this.options.saveMessage?.({ ...message, state: "ignored" });
    await this.options.saveDraft?.({ ...draft, state: "ignored", updatedAt: now });
    return { ok: true };
  }

  async escalateDraft(draftId: string): Promise<{ ok: boolean; error?: string }> {
    const draft = await this.options.getDraft?.(draftId);
    if (!draft) {
      return { ok: false, error: "找不到要升级的草稿。" };
    }
    const message = await this.options.getMessage?.(draft.messageId);
    if (!message) {
      return { ok: false, error: "找不到草稿对应的消息。" };
    }
    const transitionError = this.validateDraftAction({ draft, message, targetState: "escalated" });
    if (transitionError) {
      return transitionError;
    }
    const now = new Date().toISOString();
    await this.options.saveMessage?.({ ...message, state: "escalated" });
    await this.options.saveDraft?.({ ...draft, state: "escalated", updatedAt: now });
    await this.log("info", `草稿已升级至人工介入：draftId=${draft.id}, messageId=${message.id}`);
    return { ok: true };
  }

  private validateDraftAction(
    input: {
      draft: ReplyDraftRecord;
      message: Omit<MessageRecord, "updatedAt">;
      targetState: DraftAction;
    },
  ): { ok: boolean; error?: string } | undefined {
    if (!this.options.saveMessage || !this.options.saveDraft) {
      return { ok: false, error: "草稿操作缺少持久化回调。" };
    }
    if (isTerminalDraftState(input.draft.state)) {
      return { ok: false, error: `草稿当前已为${input.draft.state}，不允许重复操作。` };
    }
    if (!canTransitionMessageState(input.message.state, input.targetState)) {
      return { ok: false, error: `当前消息状态 ${input.message.state} 不允许标记为 ${input.targetState}。` };
    }
    return undefined;
  }

  private async handleSocketMessage(account: AccountRecord, data: unknown): Promise<void> {
    const payload = typeof data === "string" ? JSON.parse(data) as Record<string, unknown> : JSON.parse(String(data)) as Record<string, unknown>;
    const context = normalizePddMessage(payload, { accountId: account.id, shopId: account.shopId });
    const saved = await this.options.saveMessage?.({ ...context, state: "received" });
    if (saved) {
      await this.options.onMessageReceived?.(saved);
    }
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

  private async logDiagnostic(
    subsystem: "pdd",
    code: "session_expiry" | "token_retrieval_failure" | "websocket_unexpected_close" | "send_message_failure",
    context: Record<string, string>,
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const parts = Object.entries(context).map(([key, value]) => `${key}=${sanitizeContextValue(value)}`);
    await this.log("error", `诊断[${subsystem}/${code}] ${timestamp} ${parts.join(" ")}`.trim());
  }

  private async refreshExistingSession(page: PlaywrightPage): Promise<boolean> {
    await page.goto("https://mms.pinduoduo.com/home/");
    try {
      await page.waitForURL("**/login**", { timeout: 5_000 });
      const title = await page.title();
      const url = page.url();
      void this.logDiagnostic("pdd", "session_expiry", {
        stage: "refresh-existing-session",
        title,
        url,
      });
      await this.log("info", "拼多多持久化会话已失效，进入账号密码登录。");
      return false;
    } catch {
      const title = await page.title();
      const url = page.url();
      if (isLoginUrl(url)) {
        void this.logDiagnostic("pdd", "session_expiry", {
          stage: "refresh-existing-session",
          title,
          url,
        });
        await this.log("info", "拼多多持久化会话已失效，当前仍在登录页。");
        return false;
      }
      await this.log("info", `拼多多持久化会话可用：title=${title} url=${url}`);
      return true;
    }
  }

  private async performPasswordLogin(page: PlaywrightPage, request: AccountLoginRequest): Promise<void> {
    await page.goto("https://mms.pinduoduo.com/login");
    await tryClick(page, "div.Common_item__3diIn:has-text('账号登录')");
    await tryFill(page, "input[type='text']", request.username);
    if (request.password) {
      await tryFill(page, "input[type='password']", request.password);
      await tryClick(page, "button:has-text('登录')");
    }
    try {
      await waitForLoginCompletion(page, this.options.loginTimeoutMs ?? 120_000);
    } catch {
      throw new Error(`未完成拼多多商家后台登录或仍在风控校验：title=${await page.title()} url=${page.url()}`);
    }
  }

  private async finalizeLogin(
    page: PlaywrightPage,
    context: { cookies(): Promise<BrowserCookie[]> },
    username: string,
  ): Promise<AccountRecord> {
    await tryWaitForSettledPage(page);
    const currentTitle = await page.title();
    const currentUrl = page.url();
    if (new URL(currentUrl).pathname.includes("/login")) {
      void this.logDiagnostic("pdd", "session_expiry", {
        stage: "finalize-login",
        title: currentTitle,
        url: currentUrl,
      });
      throw new Error(`未完成拼多多商家后台登录，当前仍在登录页：title=${currentTitle} url=${currentUrl}`);
    }
    const cookies = cookieListToJar(await context.cookies());
    await this.log("info", `拼多多登录页状态：title=${currentTitle} url=${currentUrl} cookies=${Object.keys(cookies).length}`);
    const api = this.createApi(cookies);
    const userInfo = await api.getUserInfo();
    const shopInfo = await api.getShopInfo();
    if (!this.options.saveAccount) {
      throw new Error("PDD 登录服务缺少账号保存回调。");
    }
    return this.options.saveAccount({
      channel: "pinduoduo",
      username,
      userId: userInfo.userId,
      shopId: shopInfo.shopId,
      shopName: shopInfo.shopName,
      status: "online",
      cookies: JSON.stringify(cookies),
    });
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

async function tryWaitForSettledPage(page: PlaywrightPage): Promise<void> {
  try {
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
  } catch {
    await page.waitForTimeout(1_500);
  }
}

async function waitForLoginCompletion(page: PlaywrightPage, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isLoginUrl(page.url())) {
      return;
    }
    await page.waitForTimeout(1_000);
  }
  throw new Error("login timeout");
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isLoginUrl(value: string): boolean {
  try {
    return new URL(value).pathname.includes("/login");
  } catch {
    return value.includes("/login");
  }
}

function sanitizeContextValue(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 300);
}

function resolveWebSocketCtor(): typeof WebSocket | undefined {
  return globalThis.WebSocket ?? (WebSocketRuntime as unknown as typeof WebSocket);
}

function isTerminalDraftState(state: ReplyDraftRecord["state"]): boolean {
  return state === "sent" || state === "ignored" || state === "escalated";
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
