import path from "node:path";
import { createHash } from "node:crypto";
import { access, mkdir, rename, rm } from "node:fs/promises";
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
import { withPddBrowserProfileLock } from "./profile-lock.js";

type PddFailureCategory = "network" | "pdd-token" | "cookie" | "session-expiry" | "account-offline" | "risk-control" | "manual-relogin" | "unknown";

/** Mutable resources and retry metadata owned by one account generation. */
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
  generation: number;
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
  browserCloseTimeoutMs?: number;
  /** Overrides contained profile deletion for deterministic failure-path tests. */
  removeProfileDir?: (profileDir: string) => Promise<void>;
}

const DEFAULT_BROWSER_CLOSE_TIMEOUT_MS = 5_000;

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

/** Minimal persistent Playwright context surface used by PDD login flows. */
interface PlaywrightBrowserContext {
  pages(): Array<PlaywrightPage>;
  newPage(): Promise<PlaywrightPage>;
  cookies(): Promise<BrowserCookie[]>;
  close(): Promise<void>;
}

interface PlaywrightModule {
  chromium: {
    launchPersistentContext: (
      userDataDir: string,
      options: {
        headless: boolean;
        args: string[];
      },
    ) => Promise<PlaywrightBrowserContext>;
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

/** Stable error returned when stop or dispose invalidates an in-flight start. */
const START_CANCELLED_MESSAGE = "拼多多账号启动已取消。";

/** Coordinates PDD browser sessions, account persistence, and WebSocket runtime state. */
export class PddService {
  private readonly connections = new Map<string, PddRuntimeConnection>();
  private readonly startLocks = new Map<string, Promise<void>>();
  private readonly generations = new Map<string, number>();
  private readonly browserContexts = new Set<PlaywrightBrowserContext>();
  private readonly backgroundTasks = new Set<Promise<void>>();
  private readonly loggingOut = new Set<string>();
  private disposed = false;

  /**
   * Creates a PDD coordinator with optional persistence and browser dependencies.
   *
   * @param options Persistence, logging, and browser dependencies.
   */
  constructor(private readonly options: PddServiceOptions = {}) {}

  /**
   * Opens an interactive browser session and persists its verified account state.
   *
   * @param request Login channel, username, and optional password.
   * @returns The saved account identifiers or a sanitized failure.
   */
  async login(request: AccountLoginRequest): Promise<AccountLoginResult> {
    if (!request.username.trim()) {
      return { ok: false, error: "请输入拼多多账号" };
    }
    if (!this.options.dataDir || !this.options.saveAccount) {
      return { ok: false, error: "PDD 登录服务缺少 dataDir 或账号保存回调。" };
    }

    try {
      this.assertActive();
      const playwright = this.options.playwright ?? await loadPlaywright();
      const userDataDir = await resolvePddProfileDir(this.options.dataDir, request.username);
      return await withPddBrowserProfileLock(userDataDir, async () => {
        this.assertActive();
        const context = await playwright.chromium.launchPersistentContext(userDataDir, {
          headless: false,
          args: [...pddBrowserArgs],
        });
        this.browserContexts.add(context);
        try {
          const page = context.pages()[0] ?? await context.newPage();
          const antiContentCapture = createAntiContentCapture(page);
          try {
            const refreshed = await this.refreshExistingSession(page);
            if (!refreshed) {
              await this.performPasswordLogin(page, request);
            }
            const account = await this.finalizeLogin(page, context, request.username, antiContentCapture);
            this.nextGeneration(account.id);
            this.closeConnection(account.id);
            await this.log("info", `拼多多账号登录成功：${request.username}`);
            return { ok: true, accountId: account.id, shopId: account.shopId };
          } finally {
            antiContentCapture.dispose();
          }
        } finally {
          this.browserContexts.delete(context);
          await closeBrowserContext(context, this.options.browserCloseTimeoutMs);
        }
      });
    } catch (error) {
      const failure = classifyConnectionError(error, {
        accountId: "",
        shopId: "",
        username: request.username,
        operation: "session-health",
      });
      if (failure.requiresRelogin) {
        await this.logDiagnostic("pdd", "session_expiry", {
          account: request.username,
          error: failure.summary,
        });
      }
      await this.log("error", `拼多多登录失败：${failure.summary}`);
      return { ok: false, error: failure.summary };
    }
  }

  /**
   * Refreshes a saved account through its persistent browser profile.
   *
   * @param accountId Account whose browser session should be refreshed.
   * @returns The refreshed account or a failure requiring user action.
   */
  async refreshAccountSession(accountId: string): Promise<{ ok: boolean; account?: AccountRecord; error?: string }> {
    const account = await this.options.getAccount?.(accountId);
    if (!account) {
      return { ok: false, error: "找不到要刷新的拼多多账号。" };
    }
    if (!this.options.dataDir || !this.options.saveAccount) {
      return { ok: false, error: "PDD 会话刷新服务缺少 dataDir 或账号保存回调。" };
    }

    try {
      this.assertActive();
      const playwright = this.options.playwright ?? await loadPlaywright();
      const userDataDir = await resolvePddProfileDir(this.options.dataDir, account.username);
      return await withPddBrowserProfileLock(userDataDir, async () => {
        this.assertActive();
        const context = await playwright.chromium.launchPersistentContext(userDataDir, {
          headless: true,
          args: [...pddBrowserArgs],
        });
        this.browserContexts.add(context);
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
          this.browserContexts.delete(context);
          await closeBrowserContext(context, this.options.browserCloseTimeoutMs);
        }
      });
    } catch (error) {
      const message = sanitizeServiceError(error);
      await this.log("warning", `拼多多账号会话刷新失败：${message}`);
      return { ok: false, error: message };
    }
  }

  /**
   * Starts one account unless it is already healthy or a stop invalidates the request.
   *
   * @param accountId Account to start.
   * @returns Whether a current socket is running or was started.
   */
  async startAccount(accountId: string): Promise<{ ok: boolean; error?: string }> {
    if (this.disposed || this.loggingOut.has(accountId)) {
      return { ok: false, error: START_CANCELLED_MESSAGE };
    }
    const current = this.connections.get(accountId);
    if (current && !current.stopped && !current.requiresRelogin && current.state !== "error") {
      return { ok: true };
    }
    const generation = this.nextGeneration(accountId);
    const account = await this.options.getAccount?.(accountId);
    if (!account) {
      return { ok: false, error: "找不到要启动的拼多多账号。" };
    }
    if (!account.cookies) {
      return { ok: false, error: "账号缺少可用会话，请先完成真实拼多多登录。" };
    }
    try {
      this.assertGeneration(accountId, generation);
      await this.startConnection(account, false, generation);
      return { ok: true };
    } catch (error) {
      if (!this.isCurrentGeneration(accountId, generation)) {
        return { ok: false, error: START_CANCELLED_MESSAGE };
      }
      const message = sanitizeServiceError(error);
      await this.options.saveAccount?.(withoutRuntimeAccountFields({ ...account, status: "error", error: message }));
      await this.log("error", `启动拼多多账号失败：${message}`);
      return { ok: false, error: message };
    }
  }

  /**
   * Invalidates in-flight work and stops one account without affecting others.
   *
   * @param accountId Account to stop.
   * @returns A successful idempotent stop result.
   */
  async stopAccount(accountId: string): Promise<{ ok: boolean; error?: string }> {
    this.nextGeneration(accountId);
    this.startLocks.delete(accountId);
    this.closeConnection(accountId);
    const account = await this.options.getAccount?.(accountId);
    if (account) {
      await this.options.saveAccount?.(withoutRuntimeAccountFields({ ...account, status: "offline" }));
      await this.log("info", `拼多多账号已停止：${account.username}`);
    }
    return { ok: true };
  }

  /**
   * Closes and removes the currently registered socket for one account.
   *
   * @param accountId Account whose current socket should be removed.
   */
  private closeConnection(accountId: string): void {
    const connection = this.connections.get(accountId);
    if (connection) {
      connection.stopped = true;
      connection.state = "stopped";
      this.clearConnectionTimers(connection);
      connection.requiresRelogin = false;
      connection.lastError = undefined;
      connection.socket.onopen = null;
      connection.socket.onmessage = null;
      connection.socket.onclose = null;
      connection.socket.onerror = null;
      try {
        connection.socket.close();
      } catch {
        // ignore close failures
      }
      this.connections.delete(accountId);
    }
  }

  async setAccountAvailability(
    accountId: string,
    status: Extract<AccountRecord["status"], "online" | "busy" | "offline">,
  ): Promise<{ ok: boolean; error?: string }> {
    const account = await this.options.getAccount?.(accountId);
    if (!account?.cookies) {
      return { ok: false, error: "账号缺少可用会话，请先完成真实拼多多登录。" };
    }

    try {
      const api = this.createApi(account.cookies);
      await api.setOnlineStatus(status satisfies PddCustomerServiceAvailability);
      await this.options.saveAccount?.(withoutRuntimeAccountFields({ ...account, status, error: "" }));
      await this.log("info", `拼多多账号接待状态已更新：${account.username} ${status}`);
      return { ok: true };
    } catch (error) {
      const message = sanitizeServiceError(error);
      await this.log("error", `拼多多账号接待状态更新失败：${message}`);
      return { ok: false, error: message };
    }
  }

  /**
   * Clears saved credentials and removes only this account's contained profile.
   *
   * @param accountId Account to log out.
   * @returns Whether credentials and best-effort profile cleanup completed.
   */
  async logoutAccount(accountId: string): Promise<{ ok: boolean; error?: string }> {
    if (this.loggingOut.has(accountId)) {
      return { ok: false, error: "拼多多账号正在退出登录。" };
    }
    this.loggingOut.add(accountId);
    try {
      const account = await this.options.getAccount?.(accountId);
      if (!account) {
        return { ok: false, error: "找不到要退出登录的拼多多账号。" };
      }
      if (!this.options.saveAccount) {
        return { ok: false, error: "PDD 退出登录服务缺少账号保存回调。" };
      }

      this.nextGeneration(accountId);
      this.startLocks.delete(accountId);
      this.closeConnection(accountId);

      const loggedOutAccount: AccountRecord = { ...account, status: "offline" };
      delete loggedOutAccount.cookies;
      delete loggedOutAccount.error;
      await this.options.saveAccount(withoutRuntimeAccountFields(loggedOutAccount));

      if (this.options.dataDir) {
        const profileRoot = path.resolve(this.options.dataDir, "pdd-profiles");
        const profileDir = await resolvePddProfileDir(this.options.dataDir, account.username);
        assertContainedProfilePath(profileRoot, profileDir);
        try {
          await withPddBrowserProfileLock(
            profileDir,
            () => this.options.removeProfileDir?.(profileDir) ?? rm(profileDir, { recursive: true, force: true }),
          );
        } catch {
          const message = "登录凭据已清除，但 PDD 浏览器会话资料清理失败。";
          await this.log("warning", message);
          return { ok: false, error: message };
        }
      }

      await this.log("info", `拼多多账号已退出登录：${account.username}`);
      return { ok: true };
    } finally {
      this.nextGeneration(accountId);
      this.closeConnection(accountId);
      this.loggingOut.delete(accountId);
    }
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

  /**
   * Permanently stops this service and closes sockets, timers, and browser contexts.
   *
   * @returns A promise settled after all tracked browser closes finish.
   */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const accountId of this.generations.keys()) {
      this.nextGeneration(accountId);
    }
    const starts = [...this.startLocks.values()];
    this.startLocks.clear();
    for (const accountId of [...this.connections.keys()]) {
      this.closeConnection(accountId);
    }
    const contexts = [...this.browserContexts];
    this.browserContexts.clear();
    await Promise.allSettled([
      ...contexts.map((context) => closeBrowserContext(context, this.options.browserCloseTimeoutMs)),
      ...starts,
      ...this.backgroundTasks,
    ]);
  }

  /**
   * Advances the cancellation token for one account.
   *
   * @param accountId Account whose prior work becomes stale.
   * @returns The new generation number.
   */
  private nextGeneration(accountId: string): number {
    const generation = (this.generations.get(accountId) ?? 0) + 1;
    this.generations.set(accountId, generation);
    return generation;
  }

  /**
   * Reports whether an asynchronous operation still owns the account.
   *
   * @param accountId Account being checked.
   * @param generation Generation owned by the operation.
   * @returns True only while the service and generation remain current.
   */
  private isCurrentGeneration(accountId: string, generation: number): boolean {
    return !this.disposed && this.generations.get(accountId) === generation;
  }

  /**
   * Rejects cancelled account work before it can create or publish resources.
   *
   * @param accountId Account being checked.
   * @param generation Generation owned by the operation.
   * @throws If stop, replacement, or dispose invalidated the operation.
   */
  private assertGeneration(accountId: string, generation: number): void {
    if (!this.isCurrentGeneration(accountId, generation)) {
      throw new Error(START_CANCELLED_MESSAGE);
    }
  }

  /** @throws If the service has already been disposed. */
  private assertActive(): void {
    if (this.disposed) {
      throw new Error("PDD 服务已停止。");
    }
  }

  /**
   * Reports whether a socket is still the current registered account connection.
   *
   * @param connection Candidate connection.
   * @returns True only for the live connection owned by the current generation.
   */
  private isLiveConnection(connection: PddRuntimeConnection): boolean {
    return !connection.stopped
      && this.connections.get(connection.accountId) === connection
      && this.isCurrentGeneration(connection.accountId, connection.generation);
  }

  /** Tracks asynchronous socket callbacks so dispose can wait before the database closes. */
  private trackBackground(operation: Promise<void>): void {
    const tracked = operation
      .catch((error) => {
        console.error("PDD background task failed", redactSensitiveText(error instanceof Error ? error.message : String(error)));
      })
      .finally(() => {
        this.backgroundTasks.delete(tracked);
      });
    this.backgroundTasks.add(tracked);
  }

  /**
   * Serializes starts while allowing a newer generation to replace cancelled work.
   *
   * @param account Account snapshot used for API authentication.
   * @param isReconnect Whether this is an automatic retry.
   * @param generation Generation that owns the start.
   * @returns A promise settled after startup is published or cancelled.
   */
  private async startConnection(account: AccountRecord, isReconnect: boolean, generation: number): Promise<void> {
    const existingLock = this.startLocks.get(account.id);
    if (existingLock) {
      try {
        await existingLock;
      } catch {
        // The current generation decides whether a replacement may continue.
      }
      this.assertGeneration(account.id, generation);
      const active = this.connections.get(account.id);
      if (active && !active.stopped && active.state !== "error") {
        return;
      }
    }
    const operation = this.internalStartConnection(account, isReconnect, generation);
    this.startLocks.set(account.id, operation);
    try {
      await operation;
    } finally {
      if (this.startLocks.get(account.id) === operation) {
        this.startLocks.delete(account.id);
      }
    }
  }

  /**
   * Builds a socket only while the caller's generation remains current.
   *
   * @param account Account snapshot used for API authentication.
   * @param isReconnect Whether this is an automatic retry.
   * @param generation Generation that owns all created resources.
   * @returns A promise settled after persistence and logging complete.
   * @throws If authentication, persistence, or generation validation fails.
   */
  private async internalStartConnection(account: AccountRecord, isReconnect: boolean, generation: number): Promise<void> {
    this.assertGeneration(account.id, generation);
    const existing = this.connections.get(account.id);
    if (existing) {
      this.closeConnection(account.id);
    }

    let activeAccount = account;
    let api = this.createApi(activeAccount.cookies);
    let refreshedSession = false;
    if (isReconnect) {
      const health = await this.checkSessionHealth(activeAccount, api);
      this.assertGeneration(account.id, generation);
      if (health.requiresRelogin || health.category === "session-expiry") {
        const refreshed = await this.refreshAccountSession(activeAccount.id);
        this.assertGeneration(account.id, generation);
        if (refreshed.ok && refreshed.account) {
          activeAccount = refreshed.account;
          api = this.createApi(activeAccount.cookies);
          refreshedSession = true;
        } else {
          this.recordFailureState(activeAccount.id, {
            category: health.category,
            summary: refreshed.error ?? health.message,
            requiresRelogin: true,
          });
          await this.logDiagnostic("pdd", "session_expiry", {
            accountId: activeAccount.id,
            shopId: activeAccount.shopId,
            username: activeAccount.username,
            error: refreshed.error ?? health.message,
          });
          throw new Error(refreshed.error ?? health.message);
        }
      }
    }

    let token: string;
    try {
      token = await this.executeWithFailureCategory(activeAccount, isReconnect, "start-token", () => api.getChatToken());
      this.assertGeneration(account.id, generation);
      await this.executeWithFailureCategory(activeAccount, isReconnect, "start-online", () => api.setOnlineStatus("online"));
      this.assertGeneration(account.id, generation);
    } catch (error) {
      const failure = classifyConnectionError(error, {
        accountId: activeAccount.id,
        shopId: activeAccount.shopId,
        username: activeAccount.username,
        operation: "token",
      });
      if (refreshedSession || !failure.requiresRelogin) {
        throw error;
      }
      const refreshed = await this.refreshAccountSession(activeAccount.id);
      this.assertGeneration(account.id, generation);
      if (!refreshed.ok || !refreshed.account) {
        throw new Error(refreshed.error ?? failure.summary);
      }
      activeAccount = refreshed.account;
      api = this.createApi(activeAccount.cookies);
      token = await this.executeWithFailureCategory(activeAccount, isReconnect, "reconnect-token", () => api.getChatToken());
      this.assertGeneration(account.id, generation);
      await this.executeWithFailureCategory(activeAccount, isReconnect, "reconnect-online", () => api.setOnlineStatus("online"));
      this.assertGeneration(account.id, generation);
    }

    this.assertGeneration(account.id, generation);
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
      accountId: activeAccount.id,
      socket,
      state: "connecting",
      stopped: false,
      startedAt: existing?.startedAt ?? new Date().toISOString(),
      reconnectCount: isReconnect ? (existing?.reconnectCount ?? 0) + 1 : 0,
      requiresRelogin: false,
      generation,
    };
    if (existing?.lastHeartbeatAt) {
      connection.lastHeartbeatAt = existing.lastHeartbeatAt;
    }
    this.connections.set(activeAccount.id, connection);

    socket.onopen = () => {
      if (!this.isLiveConnection(connection)) {
        socket.close();
        return;
      }
      connection.state = "running";
      connection.lastHeartbeatAt = new Date().toISOString();
      connection.lastError = undefined;
      this.scheduleHeartbeatProbe(activeAccount, connection);
      this.trackBackground(this.log("info", `拼多多账号 WebSocket 已连接：${activeAccount.username}`));
    };
    socket.onmessage = (event) => {
      if (!this.isLiveConnection(connection)) {
        return;
      }
      connection.lastHeartbeatAt = new Date().toISOString();
      this.trackBackground(this.handleSocketMessage(activeAccount, event.data));
    };
    socket.onclose = (event) => {
      this.trackBackground(this.handleSocketClose(activeAccount, connection, event));
    };
    socket.onerror = () => {
      this.trackBackground(this.handleSocketError(activeAccount, connection));
    };

    try {
      await this.options.saveAccount?.(withoutRuntimeAccountFields({ ...activeAccount, status: "online", error: "" }));
      this.assertGeneration(account.id, generation);
      await this.log("info", `拼多多账号已启动：${activeAccount.username}`);
      this.assertGeneration(account.id, generation);
    } catch (error) {
      connection.stopped = true;
      this.clearConnectionTimers(connection);
      try {
        socket.close();
      } catch {
        // Best-effort cleanup; the original startup error remains authoritative.
      }
      if (this.connections.get(activeAccount.id) === connection) {
        this.connections.delete(activeAccount.id);
      }
      throw error;
    }
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

  /**
   * Records an unexpected close and schedules a bounded reconnect when eligible.
   *
   * @param account Account owning the socket.
   * @param connection Connection that emitted the close.
   * @param event Optional WebSocket close metadata.
   * @returns A promise settled after diagnostic persistence.
   */
  private async handleSocketClose(
    account: AccountRecord,
    connection: PddRuntimeConnection,
    event?: { code?: number; reason?: string },
  ): Promise<void> {
    if (!this.isLiveConnection(connection)) {
      connection.state = "stopped";
      return;
    }
    this.clearConnectionTimers(connection);
    connection.state = "error";
    const reason = sanitizeServiceError(`${event?.code ?? "unknown"}:${event?.reason ?? "websocket_closed"}`);
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

  /**
   * Records a live socket error and schedules its reconnect.
   *
   * @param account Account owning the socket.
   * @param connection Connection that emitted the error.
   * @returns A promise settled after logging.
   */
  private async handleSocketError(account: AccountRecord, connection: PddRuntimeConnection): Promise<void> {
    if (!this.isLiveConnection(connection)) {
      return;
    }
    connection.state = "error";
    connection.lastError = "websocket_error";
    connection.failureCategory = "network";
    await this.log("error", `拼多多 WebSocket 连接错误：${account.username}`);
    if (!connection.stopped) {
      this.scheduleReconnect(account, connection);
    }
  }

  /**
   * Schedules at most the configured number of reconnect generations.
   *
   * @param account Account to reconnect.
   * @param connection Failed connection carrying retry state.
   */
  private scheduleReconnect(account: AccountRecord, connection: PddRuntimeConnection): void {
    if (!this.isLiveConnection(connection)) {
      return;
    }
    if (connection.reconnectCount >= PddService.RECONNECT_MAX_ATTEMPTS) {
      connection.state = "error";
      connection.lastError = "reconnect_retries_exhausted";
      connection.failureCategory = "network";
      this.trackBackground(Promise.all([
        this.options.saveAccount?.(withoutRuntimeAccountFields({
          ...account,
          status: "error",
          error: connection.lastError,
        })) ?? Promise.resolve(),
        this.log("error", `拼多多 WebSocket 重连已停止：${account.username}`),
      ]).then(() => undefined));
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
      connection.reconnectTimer = undefined;
      this.trackBackground(this.startConnection(account, true, connection.generation).catch(async (error) => {
        if (!this.isCurrentGeneration(account.id, connection.generation)) {
          return;
        }
        const message = sanitizeServiceError(error);
        connection.lastError = message;
        connection.state = "error";
        await this.options.saveAccount?.(withoutRuntimeAccountFields({ ...account, status: "error", error: message }));
      }));
    }, delay);
  }

  /**
   * Starts the heartbeat watchdog for one live connection.
   *
   * @param account Account owning the connection.
   * @param connection Live connection to monitor.
   */
  private scheduleHeartbeatProbe(account: AccountRecord, connection: PddRuntimeConnection): void {
    this.clearHeartbeatTimer(connection);
    connection.heartbeatTimer = setInterval(() => {
      if (!this.isLiveConnection(connection)) {
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
        this.trackBackground(this.handleSocketClose(account, connection));
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
      runtimeState.lastError = sanitizeServiceError(connection.lastError);
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
    let result: { ok: boolean; error?: string };
    try {
      result = await this.createApi(account.cookies).sendText(message.buyerId, text);
    } catch (error) {
      result = { ok: false, error: sanitizeServiceError(error) };
    }
    if (!result.ok) {
      const error = sanitizeServiceError(result.error ?? "未知错误");
      await this.options.saveMessage?.(withoutMessageRuntimeFields({ ...message, state: "failed", error }));
      await this.logDiagnostic("pdd", "send_message_failure", {
        accountId: account.id,
        shopId: account.shopId,
        messageId,
        buyerId: message.buyerId,
        error,
      });
      await this.log("error", `拼多多消息发送失败：${error}`);
      return { ok: false, error };
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
    let result: { ok: boolean; error?: string };
    try {
      result = await this.createApi(account.cookies).sendImage(message.buyerId, imageUrl);
    } catch (error) {
      result = { ok: false, error: sanitizeServiceError(error) };
    }
    if (!result.ok) {
      const error = sanitizeServiceError(result.error ?? "未知错误");
      await this.options.saveMessage?.(withoutMessageRuntimeFields({ ...message, state: "failed", error }));
      await this.logDiagnostic("pdd", "send_message_failure", {
        accountId: account.id,
        shopId: account.shopId,
        messageId,
        buyerId: message.buyerId,
        error,
      });
      await this.log("error", `拼多多图片发送失败：${error}`);
      return { ok: false, error };
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

/**
 * Loads Playwright lazily so non-browser PDD operations do not pay startup cost.
 *
 * @returns The Playwright module.
 * @throws If Playwright is unavailable.
 */
async function loadPlaywright(): Promise<PlaywrightModule> {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;
    return await dynamicImport("playwright") as PlaywrightModule;
  } catch {
    throw new Error("缺少 Node Playwright 依赖，请安装 playwright 后再使用拼多多真实登录。");
  }
}

export function classifyConnectionError(error: unknown, context: FailureContext): ConnectionFailure {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = sanitizeServiceError(rawMessage);
  const lower = rawMessage.toLowerCase();
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

/**
 * Resolves a collision-resistant direct child profile and migrates safe legacy names.
 *
 * @param dataDir Application data directory.
 * @param username PDD username that owns the profile.
 * @returns A contained profile directory unique to ambiguous usernames.
 * @throws If legacy migration fails or the resolved path is unsafe.
 */
export async function resolvePddProfileDir(dataDir: string, username: string): Promise<string> {
  const profileRoot = path.resolve(dataDir, "pdd-profiles");
  const profileDir = path.join(profileRoot, profileSegment(username));
  assertContainedProfilePath(profileRoot, profileDir);
  if (await pathExists(profileDir)) {
    return profileDir;
  }

  const legacySegment = username.replace(/[^a-zA-Z0-9._-]/g, "_");
  const legacyDir = path.resolve(profileRoot, legacySegment);
  if (legacySegment !== "." && legacySegment !== ".." && path.dirname(legacyDir) === profileRoot && await pathExists(legacyDir)) {
    await mkdir(profileRoot, { recursive: true });
    try {
      await rename(legacyDir, profileDir);
    } catch (error) {
      if (!await pathExists(profileDir)) {
        throw error;
      }
    }
  }
  return profileDir;
}

/**
 * Hashes every username so case-insensitive filesystems cannot merge accounts.
 *
 * @param username PDD username.
 * @returns A direct-child-safe, collision-resistant directory segment.
 */
function profileSegment(username: string): string {
  return `user-${createHash("sha256").update(username).digest("hex")}`;
}

/**
 * Rejects root, sibling, and ancestor paths before recursive deletion.
 *
 * @param profileRoot Allowed profile root.
 * @param profileDir Candidate child directory.
 * @throws If the candidate is not a child of the profile root.
 */
function assertContainedProfilePath(profileRoot: string, profileDir: string): void {
  const relative = path.relative(profileRoot, profileDir);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("拒绝删除 PDD profile 根目录或其外部路径。");
  }
}

/**
 * Checks whether a path exists without treating absence as an exceptional state.
 *
 * @param value Filesystem path to inspect.
 * @returns Whether the path exists.
 */
async function pathExists(value: string): Promise<boolean> {
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Closes a browser context while tolerating a concurrent dispose call.
 *
 * @param context Tracked Playwright context.
 * @param timeoutMs Maximum time allowed for the context close handshake.
 * @returns A promise settled after the close attempt or its deadline.
 */
async function closeBrowserContext(
  context: PlaywrightBrowserContext,
  timeoutMs = DEFAULT_BROWSER_CLOSE_TIMEOUT_MS,
): Promise<void> {
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
    const timeout = setTimeout(finish, Math.max(0, timeoutMs));
    context.close().then(finish, finish);
  });
}

function isLoginUrl(value: string): boolean {
  try {
    return new URL(value).pathname.includes("/login");
  } catch {
    return value.includes("/login");
  }
}

/** Redacts and bounds one value before it reaches persistence or an external caller. */
function sanitizeContextValue(value: string): string {
  return redactSensitiveText(value)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 300);
}

/** Converts an unknown failure into a redacted, bounded service-boundary message. */
function sanitizeServiceError(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return sanitizeContextValue(value) || "未知错误";
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
