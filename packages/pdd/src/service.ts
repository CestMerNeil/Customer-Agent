import path from "node:path";
import { rm } from "node:fs/promises";
import WebSocketRuntime from "ws";
import { canTransitionMessageState, redactSensitiveText } from "@customer-agent/core";
import type {
  AccountLoginRequest,
  AccountLoginResult,
  AccountRecord,
  MessageRecord,
  ReplyDraftRecord
} from "@customer-agent/core";
import { PddApi } from "./api.js";
import type { PddCustomerServiceAvailability } from "./api.js";
import { PddHttpClient } from "./client.js";
import { pddWsBaseUrl } from "./endpoints.js";
import { cookieListToJar, parseCookieJar, type BrowserCookie } from "./cookies.js";
import { isQueueablePddMessage, normalizePddMessage } from "./normalizer.js";

type PddFailureCategory = "network" | "pdd-token" | "cookie" | "session-expiry" | "account-offline" | "risk-control" | "manual-relogin" | "unknown";

interface PddRuntimeConnection {
  accountId: string;
  socket: WebSocket;
  state: "connecting" | "running" | "error" | "reconnecting" | "stopped";
  stopped: boolean;
  startedAt: string;
  reconnectCount: number;
  failureCategory?: "network" | "pdd-token" | "cookie" | "session-expiry" | "account-offline" | "risk-control" | "manual-relogin" | "unknown";
  heartbeatTimer?: ReturnType<typeof setInterval> | undefined;
  reconnectTimer?: ReturnType<typeof setTimeout> | undefined;
  lastHeartbeatAt?: string;
  lastError?: string | undefined;
  requiresRelogin?: boolean | undefined;
  reconnectCooldownUntil?: number | undefined;
}

export interface PddAccountRuntimeState {
  accountId: string;
  state: "running" | "stopped" | "error";
  startedAt?: string;
  reconnectCount: number;
  failureCategory?: "network" | "pdd-token" | "cookie" | "session-expiry" | "account-offline" | "risk-control" | "manual-relogin" | "unknown";
  lastHeartbeatAt?: string;
  lastError?: string;
  websocketConnected?: boolean;
  requiresRelogin?: boolean;
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
  playwright?: PlaywrightModule;
  loginTimeoutMs?: number;
}

interface ConnectionFailure {
  category: PddFailureCategory;
  summary: string;
  requiresRelogin: boolean;
}

interface FailureContext {
  accountId: string;
  shopId: string;
  username: string;
  operation: "token" | "online" | "session-health";
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

interface PlaywrightRequest {
  headers(): Record<string, string>;
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
  on?(event: "request", handler: (request: PlaywrightRequest) => void): void;
  off?(event: "request", handler: (request: PlaywrightRequest) => void): void;
}

interface AntiContentCapture {
  value(): string | undefined;
  dispose(): void;
}

/** Chromium flags used for PDD browser sessions while preserving the browser sandbox. */
const pddBrowserArgs = [
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--disable-blink-features=AutomationControlled",
  "--disable-notifications",
] as const;

/** Coordinates PDD browser sessions, account persistence, and WebSocket runtime state. */
export class PddService {
  private readonly connections = new Map<string, PddRuntimeConnection>();
  private readonly startLocks = new Map<string, Promise<void>>();

  constructor(private readonly options: PddServiceOptions = {}) {}

  /** Opens an interactive, sandboxed browser session and persists its verified account state. */
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
        args: [...pddBrowserArgs],
      });
      try {
        const page = context.pages()[0] ?? await context.newPage();
        const antiContentCapture = createAntiContentCapture(page);
        try {
          const refreshed = await this.refreshExistingSession(page);
          if (!refreshed) {
            await this.performPasswordLogin(page, request);
          }
          const account = await this.finalizeLogin(page, context, request.username, antiContentCapture);
          await this.log("info", `拼多多账号登录成功：${request.username}`);
          return { ok: true, accountId: account.id, shopId: account.shopId };
        } finally {
          antiContentCapture.dispose();
        }
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

  /** Refreshes a saved account through a sandboxed persistent browser profile without password entry. */
  async refreshAccountSession(accountId: string): Promise<{ ok: boolean; account?: AccountRecord; error?: string }> {
    const account = await this.options.getAccount?.(accountId);
    if (!account) {
      return { ok: false, error: "找不到要刷新的拼多多账号。" };
    }
    if (!this.options.dataDir || !this.options.saveAccount) {
      return { ok: false, error: "PDD 会话刷新服务缺少 dataDir 或账号保存回调。" };
    }

    try {
      const playwright = this.options.playwright ?? await loadPlaywright();
      const userDataDir = path.join(this.options.dataDir, "pdd-profiles", safePathSegment(account.username));
      const context = await playwright.chromium.launchPersistentContext(userDataDir, {
        headless: true,
        args: [...pddBrowserArgs],
      });
      try {
        const page = context.pages()[0] ?? await context.newPage();
        const antiContentCapture = createAntiContentCapture(page);
        try {
          const refreshed = await this.refreshExistingSession(page);
          if (!refreshed) {
            return { ok: false, error: "PDD 持久化会话已失效，请在账号页重新登录。" };
          }
          const refreshedAccount = await this.finalizeLogin(page, context, account.username, antiContentCapture, account.id);
          await this.log("info", `拼多多账号会话已刷新：${account.username}`);
          return { ok: true, account: refreshedAccount };
        } finally {
          antiContentCapture.dispose();
        }
      } finally {
        await context.close();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.log("warning", `拼多多账号会话刷新失败：${message}`);
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
      await this.startConnection(account);
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
    this.startLocks.delete(accountId);
    if (connection) {
      connection.stopped = true;
      connection.state = "stopped";
      this.clearConnectionTimers(connection);
      connection.requiresRelogin = false;
      connection.lastError = undefined;
      try {
        connection.socket.close();
      } catch {
        // ignore close failures
      }
      this.connections.delete(accountId);
    }
    const account = await this.options.getAccount?.(accountId);
    if (account) {
      await this.options.saveAccount?.(withoutRuntimeAccountFields({ ...account, status: "offline" }));
      await this.log("info", `拼多多账号已停止：${account.username}`);
    }
    return { ok: true };
  }

  async setAccountAvailability(
    accountId: string,
    status: Extract<AccountRecord["status"], "online" | "busy" | "offline">,
  ): Promise<{ ok: boolean; error?: string }> {
    const account = await this.options.getAccount?.(accountId);
    if (!account?.cookies) {
      return { ok: false, error: "账号缺少可用会话，请先完成真实拼多多登录。" };
    }

    const api = this.createApi(account.cookies);
    await api.setOnlineStatus(status satisfies PddCustomerServiceAvailability);
    await this.options.saveAccount?.(withoutRuntimeAccountFields({ ...account, status, error: "" }));
    await this.log("info", `拼多多账号接待状态已更新：${account.username} ${status}`);
    return { ok: true };
  }

  async logoutAccount(accountId: string): Promise<{ ok: boolean; error?: string }> {
    const account = await this.options.getAccount?.(accountId);
    if (!account) {
      return { ok: false, error: "找不到要退出登录的拼多多账号。" };
    }
    if (!this.options.saveAccount) {
      return { ok: false, error: "PDD 退出登录服务缺少账号保存回调。" };
    }

    await this.stopAccount(accountId);

    const loggedOutAccount: AccountRecord = { ...account, status: "offline" };
    delete loggedOutAccount.cookies;
    delete loggedOutAccount.error;
    await this.options.saveAccount(withoutRuntimeAccountFields(loggedOutAccount));

    if (this.options.dataDir) {
      const profileDir = path.join(this.options.dataDir, "pdd-profiles", safePathSegment(account.username));
      await rm(profileDir, { recursive: true, force: true });
    }
    await this.log("info", `拼多多账号已退出登录：${account.username}`);
    return { ok: true };
  }

  getAccountRuntimeState(accountId: string): {
    state: "running" | "stopped" | "error";
    startedAt?: string;
    reconnectCount: number;
    failureCategory?: PddFailureCategory;
    lastHeartbeatAt?: string;
    lastError?: string;
    websocketConnected?: boolean;
    requiresRelogin?: boolean;
  } {
    const connection = this.connections.get(accountId);
    if (!connection) {
      return {
        state: "stopped",
        reconnectCount: 0,
      };
    }
    return this.buildRuntimeState(connection);
  }

  getAllAccountRuntimeStates(): PddAccountRuntimeState[] {
    const states: PddAccountRuntimeState[] = [];
    for (const connection of this.connections.values()) {
      states.push(this.buildRuntimeState(connection));
    }
    return states;
  }

  private async startConnection(account: AccountRecord, isReconnect = false): Promise<void> {
    const existingLock = this.startLocks.get(account.id);
    if (existingLock) {
      await existingLock;
      return;
    }
    const operation = this.internalStartConnection(account, isReconnect);
    this.startLocks.set(account.id, operation);
    try {
      await operation;
    } finally {
      if (this.startLocks.get(account.id) === operation) {
        this.startLocks.delete(account.id);
      }
    }
  }

  private async internalStartConnection(account: AccountRecord, isReconnect = false): Promise<void> {
    const existing = this.connections.get(account.id);
    if (existing) {
      if (existing.stopped) {
        this.connections.delete(account.id);
      } else {
        this.clearConnectionTimers(existing);
        if (existing.socket.readyState === existing.socket.OPEN || existing.socket.readyState === existing.socket.CONNECTING) {
          existing.socket.close();
        }
      }
    }

    const api = this.createApi(account.cookies);
    if (isReconnect) {
      const health = await this.checkSessionHealth(account, api);
      if (health.requiresRelogin || health.category === "session-expiry") {
        const connection = this.connections.get(account.id);
        if (connection) {
          connection.failureCategory = health.category;
          connection.lastError = health.message;
          connection.requiresRelogin = true;
        }
        await this.logDiagnostic("pdd", "session_expiry", {
          accountId: account.id,
          shopId: account.shopId,
          username: account.username,
          error: health.message,
        });
        throw new Error(health.message);
      }
    }

    const token = await this.executeWithFailureCategory(account, isReconnect, "start-token", () => api.getChatToken());
    await this.executeWithFailureCategory(account, isReconnect, "start-online", () => api.setOnlineStatus("online"));

    const SocketCtor = resolveWebSocketCtor();
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
    const connection: PddRuntimeConnection = {
      accountId: account.id,
      socket,
      state: "connecting",
      stopped: false,
      startedAt: existing?.startedAt ?? new Date().toISOString(),
      reconnectCount: isReconnect ? (existing?.reconnectCount ?? 0) + 1 : 0,
      requiresRelogin: false,
    };
    if (existing?.lastHeartbeatAt) {
      connection.lastHeartbeatAt = existing.lastHeartbeatAt;
    }
    this.connections.set(account.id, connection);

    socket.onopen = () => {
      connection.state = "running";
      connection.lastHeartbeatAt = new Date().toISOString();
      connection.lastError = undefined;
      this.scheduleHeartbeatProbe(account, connection);
      void this.log("info", `拼多多账号 WebSocket 已连接：${account.username}`);
    };
    socket.onmessage = (event) => {
      connection.lastHeartbeatAt = new Date().toISOString();
      void this.handleSocketMessage(account, event.data);
    };
    socket.onclose = (event) => {
      this.handleSocketClose(account, connection, event);
    };
    socket.onerror = () => {
      void this.handleSocketError(account, connection);
    };

    await this.options.saveAccount?.(withoutRuntimeAccountFields({ ...account, status: "online", error: "" }));
    await this.log("info", `拼多多账号已启动：${account.username}`);
  }

  private async checkSessionHealth(account: AccountRecord, api: PddApi): Promise<{ message: string; category: PddFailureCategory; requiresRelogin: boolean }> {
    try {
      await api.getUserInfo();
      await api.getShopInfo();
      return { message: "ok", category: "unknown", requiresRelogin: false };
    } catch (error) {
      const failure = classifyConnectionError(error, {
        accountId: account.id,
        shopId: account.shopId,
        username: account.username,
        operation: "session-health",
      });
      return {
        message: failure.summary,
        category: failure.category,
        requiresRelogin: failure.requiresRelogin,
      };
    }
  }

  private async executeWithFailureCategory<T>(
    account: AccountRecord,
    isReconnect: boolean,
    stage: "start-token" | "start-online" | "reconnect-token" | "reconnect-online",
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const failure = classifyConnectionError(error, {
        accountId: account.id,
        shopId: account.shopId,
        username: account.username,
        operation: stage.includes("token") ? "token" : "online",
      });
      this.recordFailureState(account.id, {
        ...failure,
      });
      await this.logDiagnostic("pdd", "token_retrieval_failure", {
        accountId: account.id,
        shopId: account.shopId,
        username: account.username,
        error: failure.summary,
        reason: isReconnect ? `reconnect-${stage.includes("token") ? "token" : "online"}` : `start-${stage.includes("token") ? "token" : "online"}`,
      });
      throw new Error(failure.summary);
    }
  }

  private recordFailureState(accountId: string, failure?: ConnectionFailure): void {
    const connection = this.connections.get(accountId);
    if (!connection) {
      return;
    }
    connection.lastError = failure?.summary;
    if (failure?.category) {
      connection.failureCategory = failure.category;
    }
    connection.requiresRelogin = failure?.requiresRelogin;
  }

  private async handleSocketClose(
    account: AccountRecord,
    connection: PddRuntimeConnection,
    event?: { code?: number; reason?: string },
  ): Promise<void> {
    this.clearConnectionTimers(connection);
    if (connection.stopped) {
      connection.state = "stopped";
      return;
    }
    connection.state = "error";
    const reason = `${event?.code ?? "unknown"}:${event?.reason ?? "websocket_closed"}`;
    connection.lastError = reason;
    connection.failureCategory = "network";
    if (typeof event?.code === "number" && [4001, 4003, 4004, 4010].includes(event.code)) {
      connection.failureCategory = "session-expiry";
      connection.requiresRelogin = true;
      connection.reconnectCooldownUntil = Date.now() + PddService.RECONNECT_COOLDOWN_MS;
    }
    await this.logDiagnostic("pdd", "websocket_unexpected_close", {
      accountId: account.id,
      shopId: account.shopId,
      username: account.username,
      reason: reason,
    });
    await this.log("warning", `拼多多 WebSocket 已断开：${account.username}`);
    if (connection.requiresRelogin) {
      connection.state = "error";
      connection.lastError = connection.lastError ?? "reconnect_retries_exhausted";
      await this.options.saveAccount?.(withoutRuntimeAccountFields({ ...account, status: "error", error: connection.lastError }));
      return;
    }
    this.scheduleReconnect(account, connection);
  }

  private async handleSocketError(account: AccountRecord, connection: PddRuntimeConnection): Promise<void> {
    connection.state = "error";
    connection.lastError = "websocket_error";
    connection.failureCategory = "network";
    await this.log("error", `拼多多 WebSocket 连接错误：${account.username}`);
    if (!connection.stopped) {
      this.scheduleReconnect(account, connection);
    }
  }

  private scheduleReconnect(account: AccountRecord, connection: PddRuntimeConnection): void {
    if (connection.stopped) {
      return;
    }
    if (connection.reconnectCooldownUntil && connection.reconnectCooldownUntil > Date.now()) {
      const delay = connection.reconnectCooldownUntil - Date.now();
      if (connection.reconnectTimer) {
        clearTimeout(connection.reconnectTimer);
      }
      connection.reconnectTimer = setTimeout(() => {
        this.scheduleReconnect(account, connection);
      }, delay);
      return;
    }
    if (connection.reconnectTimer) {
      clearTimeout(connection.reconnectTimer);
    }
    connection.state = "reconnecting";
    const delay = this.computeReconnectDelay(connection.reconnectCount + 1);
    connection.reconnectCooldownUntil = Date.now() + delay + PddService.RECONNECT_COOLDOWN_MS;
    connection.reconnectTimer = setTimeout(() => {
      void this.startConnection(account, true).catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);
        connection.lastError = message;
        connection.state = "error";
        await this.options.saveAccount?.(withoutRuntimeAccountFields({ ...account, status: "error", error: message }));
      });
    }, delay);
  }

  private scheduleHeartbeatProbe(account: AccountRecord, connection: PddRuntimeConnection): void {
    this.clearHeartbeatTimer(connection);
    connection.heartbeatTimer = setInterval(() => {
      if (connection.stopped) {
        return;
      }
      if (!connection.lastHeartbeatAt) {
        connection.lastHeartbeatAt = new Date().toISOString();
        return;
      }
      const elapsed = Date.now() - Date.parse(connection.lastHeartbeatAt);
      if (Number.isNaN(elapsed)) {
        connection.lastHeartbeatAt = new Date().toISOString();
        return;
      }
      if (elapsed > PddService.HEARTBEAT_MISS_TIMEOUT_MS) {
        void this.handleSocketClose(account, connection);
      }
    }, PddService.HEARTBEAT_INTERVAL_MS);
  }

  private clearConnectionTimers(connection: PddRuntimeConnection): void {
    this.clearHeartbeatTimer(connection);
    if (connection.reconnectTimer) {
      clearTimeout(connection.reconnectTimer);
      connection.reconnectTimer = undefined;
    }
  }

  private clearHeartbeatTimer(connection: PddRuntimeConnection): void {
    if (connection.heartbeatTimer) {
      clearInterval(connection.heartbeatTimer);
      connection.heartbeatTimer = undefined;
    }
  }

  private buildRuntimeState(connection: PddRuntimeConnection): PddAccountRuntimeState {
    const isConnected = connection.socket.readyState === connection.socket.OPEN;
    const runtimeState: PddAccountRuntimeState = {
      accountId: connection.accountId,
      state: this.mapConnectionState(connection),
      startedAt: connection.startedAt,
      reconnectCount: connection.reconnectCount,
    };
    if (connection.lastHeartbeatAt !== undefined) {
      runtimeState.lastHeartbeatAt = connection.lastHeartbeatAt;
    }
    if (connection.lastError !== undefined) {
      runtimeState.lastError = connection.lastError;
    }
    if (connection.failureCategory !== undefined) {
      runtimeState.failureCategory = connection.failureCategory;
    }
    runtimeState.websocketConnected = isConnected;
    if (connection.requiresRelogin !== undefined) {
      runtimeState.requiresRelogin = connection.requiresRelogin;
    }
    return runtimeState;
  }

  private computeReconnectDelay(retryCount: number): number {
    const attempt = Math.max(1, retryCount);
    const capped = Math.min(attempt, 6);
    const exponential = Math.min(1_000 * 2 ** capped, PddService.RECONNECT_MAX_DELAY_MS);
    return exponential + Math.floor(Math.random() * PddService.RECONNECT_JITTER_MS);
  }

  static HEARTBEAT_INTERVAL_MS = 15_000;
  static HEARTBEAT_MISS_TIMEOUT_MS = 45_000;
  static RECONNECT_MAX_ATTEMPTS = 5;
  static RECONNECT_JITTER_MS = 750;
  static RECONNECT_MAX_DELAY_MS = 20_000;
  static RECONNECT_COOLDOWN_MS = 10_000;

  private mapConnectionState(connection: PddRuntimeConnection): "running" | "stopped" | "error" {
    if (connection.state === "connecting" || connection.state === "reconnecting" || connection.state === "running") {
      return "running";
    }
    const isConnected = connection.socket.readyState === connection.socket.OPEN;
    if (connection.lastError || connection.state === "error") {
      return "error";
    }
    return isConnected ? "running" : "error";
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

  async sendImage(messageId: string, imageUrl: string): Promise<{ ok: boolean; error?: string }> {
    const message = await this.options.getMessage?.(messageId);
    if (!message) {
      return { ok: false, error: "找不到要回复的消息。" };
    }
    const account = await this.options.getAccount?.(message.accountId);
    if (!account) {
      return { ok: false, error: "找不到消息对应的账号。" };
    }
    const result = await this.createApi(account.cookies).sendImage(message.buyerId, imageUrl);
    if (!result.ok) {
      await this.options.saveMessage?.(withoutMessageRuntimeFields({ ...message, state: "failed", ...(result.error ? { error: result.error } : {}) }));
      await this.logDiagnostic("pdd", "send_message_failure", {
        accountId: account.id,
        shopId: account.shopId,
        messageId,
        buyerId: message.buyerId,
        error: result.error ?? "未知错误",
      });
      await this.log("error", `拼多多图片发送失败：${result.error ?? "未知错误"}`);
      return result;
    }
    await this.options.saveMessage?.(withoutMessageRuntimeFields({ ...message, state: "sent", replyText: `[image] ${imageUrl}` }));
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
    let payload: Record<string, unknown>;
    try {
      payload = typeof data === "string" ? (JSON.parse(data) as Record<string, unknown>) : (JSON.parse(String(data)) as Record<string, unknown>);
    } catch {
      await this.logDiagnostic("pdd", "websocket_unexpected_close", {
        accountId: account.id,
        shopId: account.shopId,
        username: account.username,
        reason: "invalid-message-json",
      });
      return;
    }
    if (isHeartbeatMessage(payload)) {
      return;
    }
    const context = normalizePddMessage(payload, { accountId: account.id, shopId: account.shopId });
    if (!isQueueablePddMessage(context)) {
      await this.log("info", `拼多多控制消息已处理：type=${context.type}, accountId=${account.id}, shopId=${account.shopId}`);
      return;
    }
    const saved = await this.options.saveMessage?.({ ...context, state: "received" });
    if (saved) {
      await this.options.onMessageReceived?.(saved);
    }
  }

  private createApi(cookies: string | Record<string, string> | undefined): PddApi {
    const clientOptions = {
      cookies: parseCookieJar(cookies),
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
    antiContentCapture: AntiContentCapture,
    accountId?: string,
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
    const antiContent = await collectAntiContent(page, antiContentCapture)
      ?? cookies.anti_content
      ?? cookies["anti-content"];
    if (antiContent) {
      cookies["anti-content"] = antiContent;
    }
    await this.log("info", `拼多多登录页状态：title=${currentTitle} url=${currentUrl} cookies=${Object.keys(cookies).length} antiContent=${antiContent ? "present" : "missing"}`);
    const api = this.createApi(cookies);
    const userInfo = await api.getUserInfo();
    const shopInfo = await api.getShopInfo();
    if (!this.options.saveAccount) {
      throw new Error("PDD 登录服务缺少账号保存回调。");
    }
    return this.options.saveAccount({
      ...(accountId ? { id: accountId } : {}),
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

export function classifyConnectionError(error: unknown, context: FailureContext): ConnectionFailure {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const contains = (value: string): boolean => lower.includes(value);

  if (contains("会话") && (contains("过期") || contains("失效") || contains("43001") || contains("1001"))) {
    return { category: "session-expiry", summary: message, requiresRelogin: true };
  }
  if (contains("manual_relogin_required") || (contains("请") && contains("重新登录")) || contains("need login") || contains("login required")) {
    return { category: "manual-relogin", summary: message, requiresRelogin: true };
  }
  if (contains("cookie") || contains("cookies")) {
    return { category: "cookie", summary: message, requiresRelogin: true };
  }
  if (contains("风控") || contains("risk") || contains("riskcontrol") || contains("risk-control")) {
    return { category: "risk-control", summary: message, requiresRelogin: false };
  }
  if (contains("offline") || contains("离线")) {
    return { category: "account-offline", summary: message, requiresRelogin: false };
  }
  if (contains("enotfound") || contains("econn") || contains("socket") || contains("timeout") || contains("network")) {
    return { category: "network", summary: message, requiresRelogin: false };
  }

  if (context.operation === "token") {
    return { category: "pdd-token", summary: message, requiresRelogin: contains("token") || contains("credential") || contains("授权") };
  }
  if (contains("400") || contains("403") || contains("401")) {
    return { category: context.operation === "session-health" ? "session-expiry" : "unknown", summary: message, requiresRelogin: true };
  }
  return { category: "unknown", summary: message, requiresRelogin: false };
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

function createAntiContentCapture(page: PlaywrightPage): AntiContentCapture {
  let antiContent: string | undefined;
  const handler = (request: PlaywrightRequest) => {
    const value = headerValue(request.headers(), "anti-content") ?? headerValue(request.headers(), "anti_content");
    if (value?.trim()) {
      antiContent = value.trim();
    }
  };
  page.on?.("request", handler);
  return {
    value: () => antiContent,
    dispose: () => page.off?.("request", handler),
  };
}

async function collectAntiContent(page: PlaywrightPage, capture: AntiContentCapture): Promise<string | undefined> {
  if (capture.value()) {
    return capture.value();
  }
  try {
    await page.goto("https://mms.pinduoduo.com/chat-merchant/index.html");
    await tryWaitForSettledPage(page);
  } catch {
    // Capturing anti-content is best-effort. Product sync will block with a clear
    // action if the session still lacks it.
  }
  return capture.value();
}

function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const direct = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  if (direct) {
    return direct;
  }
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }
  return undefined;
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
  return redactSensitiveText(value)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 300);
}

function isHeartbeatMessage(payload: Record<string, unknown>): boolean {
  const payloadType = payload.type ?? payload.message_type ?? payload.event;
  const payloadCode = payload.code ?? payload.cmd;
  const ping = payload.ping;
  const pong = payload.pong;
  const heartbeatFlag = payload.heartbeat ?? payload.isHeartbeat;

  return (
    payloadType === "heartbeat" ||
    payloadType === "pong" ||
    payloadCode === "heartbeat" ||
    payloadCode === "ping" ||
    ping === "pong" ||
    ping === true ||
    pong === "pong" ||
    pong === true ||
    heartbeatFlag === true
  );
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
