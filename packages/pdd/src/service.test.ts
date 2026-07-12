import { afterEach, describe, expect, it, vi } from "vitest";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AccountRecord } from "@customer-agent/core";
import { classifyConnectionError } from "./service.js";
import { PddService } from "./service.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("classifyConnectionError", () => {
  it("classifies session expiry as manual relogin-required", () => {
    const failure = classifyConnectionError(new Error("会话已过期，请重新登录"), {
      accountId: "account-1",
      shopId: "shop-1",
      username: "店主",
      operation: "session-health",
    });

    expect(failure).toMatchObject({
      category: "session-expiry",
      requiresRelogin: true,
    });
  });

  it("classifies token request errors as pdd-token", () => {
    const failure = classifyConnectionError(new Error("invalid token: 获取 token 失败"), {
      accountId: "account-1",
      shopId: "shop-1",
      username: "店主",
      operation: "token",
    });

    expect(failure).toMatchObject({
      category: "pdd-token",
      requiresRelogin: true,
    });
  });

  it("classifies network issues as network category", () => {
    const failure = classifyConnectionError(new Error("NetworkError: failed to fetch"), {
      accountId: "account-1",
      shopId: "shop-1",
      username: "店主",
      operation: "online",
    });

    expect(failure).toMatchObject({
      category: "network",
      requiresRelogin: false,
    });
  });
});

describe("PddService websocket message filtering", () => {
  it("does not persist auth control packets as buyer messages", async () => {
    const saveMessage = vi.fn();
    const onMessageReceived = vi.fn();
    const service = new PddService({ saveMessage, onMessageReceived });
    const account = {
      id: "account-1",
      channel: "pinduoduo" as const,
      username: "operator",
      shopId: "shop-1",
      userId: "cs-1",
      status: "online" as const,
      createdAt: "2026-06-24T00:00:00.000Z",
      updatedAt: "2026-06-24T00:00:00.000Z",
    };

    await invokeHandleSocketMessage(service, account, JSON.stringify({ response: "auth", auth: { result: "ok" } }));

    expect(saveMessage).not.toHaveBeenCalled();
    expect(onMessageReceived).not.toHaveBeenCalled();
  });

  it("persists real PDD push text packets and triggers downstream processing", async () => {
    const saveMessage = vi.fn(async (message) => ({ ...message, updatedAt: "2026-06-24T00:00:01.000Z" }));
    const onMessageReceived = vi.fn();
    const service = new PddService({ saveMessage, onMessageReceived });
    const account = {
      id: "account-1",
      channel: "pinduoduo" as const,
      username: "operator",
      shopId: "shop-1",
      userId: "cs-1",
      status: "online" as const,
      createdAt: "2026-06-24T00:00:00.000Z",
      updatedAt: "2026-06-24T00:00:00.000Z",
    };

    await invokeHandleSocketMessage(service, account, JSON.stringify({
      response: "push",
      message: {
        msg_id: "msg-1",
        type: 0,
        content: "有现货吗？",
        from: { uid: "buyer-1", role: "user" },
        to: { uid: "cs-1", role: "mall_cs" },
      },
    }));

    expect(saveMessage).toHaveBeenCalledWith(expect.objectContaining({
      id: "msg-1",
      type: "text",
      content: "有现货吗？",
      buyerId: "buyer-1",
      state: "received",
    }));
    expect(onMessageReceived).toHaveBeenCalledTimes(1);
  });
});

describe("PddService login session capture", () => {
  it("persists anti-content captured from browser request headers", async () => {
    const saved: AccountRecord[] = [];
    const requestHandlers: Array<(request: { headers(): Record<string, string> }) => void> = [];
    const page = {
      currentUrl: "about:blank",
      async goto(url: string) {
        this.currentUrl = url;
        for (const handler of requestHandlers) {
          handler({ headers: () => ({ "anti-content": "anti-from-browser-request" }) });
        }
      },
      async click() {},
      async fill() {},
      async waitForFunction() {},
      async waitForURL() {
        throw new Error("still authenticated");
      },
      async waitForLoadState() {},
      async waitForTimeout() {},
      async title() {
        return "首页";
      },
      url() {
        return this.currentUrl;
      },
      on(event: string, handler: (request: { headers(): Record<string, string> }) => void) {
        if (event === "request") {
          requestHandlers.push(handler);
        }
      },
      off(event: string, handler: (request: { headers(): Record<string, string> }) => void) {
        if (event !== "request") return;
        const index = requestHandlers.indexOf(handler);
        if (index >= 0) requestHandlers.splice(index, 1);
      },
    };
    const service = new PddService({
      dataDir: "/tmp/customer-agent-test",
      playwright: {
        chromium: {
          launchPersistentContext: async () => ({
            pages: () => [page],
            newPage: async () => page,
            cookies: async () => [{ name: "api_uid", value: "uid-a" }],
            close: async () => undefined,
          }),
        },
      } as never,
      saveAccount: async (account) => {
        const savedAccount: AccountRecord = {
          ...account,
          id: account.id ?? "account-1",
          createdAt: "2026-06-25T00:00:00.000Z",
          updatedAt: "2026-06-25T00:00:00.000Z",
        };
        saved.push(savedAccount);
        return savedAccount;
      },
      log: async () => undefined,
    });
    (service as unknown as { createApi(cookies: string | Record<string, string> | undefined): unknown }).createApi = () => ({
      getUserInfo: async () => ({ userId: "user-1", username: "operator", mallId: "mall-1" }),
      getShopInfo: async () => ({ shopId: "shop-1", shopName: "测试店" }),
    });

    await expect(service.login({ channel: "pinduoduo", username: "seller" })).resolves.toMatchObject({
      ok: true,
      accountId: "account-1",
      shopId: "shop-1",
    });

    expect(JSON.parse(saved[0]!.cookies!)).toEqual({
      api_uid: "uid-a",
      "anti-content": "anti-from-browser-request",
    });
  });

  it("refreshes persisted browser session and saves captured anti-content without password login", async () => {
    const account = accountRecord("account-1", "shop-1");
    const saved: AccountRecord[] = [];
    const requestHandlers: Array<(request: { headers(): Record<string, string> }) => void> = [];
    const page = {
      currentUrl: "about:blank",
      async goto(url: string) {
        this.currentUrl = url;
        for (const handler of requestHandlers) {
          handler({ headers: () => ({ "anti-content": "anti-from-refresh" }) });
        }
      },
      async click() {
        throw new Error("password login should not be used");
      },
      async fill() {
        throw new Error("password login should not be used");
      },
      async waitForFunction() {},
      async waitForURL() {
        throw new Error("still authenticated");
      },
      async waitForLoadState() {},
      async waitForTimeout() {},
      async title() {
        return "首页";
      },
      url() {
        return this.currentUrl;
      },
      on(event: string, handler: (request: { headers(): Record<string, string> }) => void) {
        if (event === "request") {
          requestHandlers.push(handler);
        }
      },
      off(event: string, handler: (request: { headers(): Record<string, string> }) => void) {
        if (event !== "request") return;
        const index = requestHandlers.indexOf(handler);
        if (index >= 0) requestHandlers.splice(index, 1);
      },
    };
    const service = new PddService({
      dataDir: "/tmp/customer-agent-test",
      getAccount: async (accountId) => accountId === account.id ? account : undefined,
      playwright: {
        chromium: {
          launchPersistentContext: async () => ({
            pages: () => [page],
            newPage: async () => page,
            cookies: async () => [{ name: "api_uid", value: "uid-a" }],
            close: async () => undefined,
          }),
        },
      } as never,
      saveAccount: async (input) => {
        const savedAccount: AccountRecord = {
          ...account,
          ...input,
          id: input.id ?? account.id,
          createdAt: account.createdAt,
          updatedAt: "2026-06-25T00:00:01.000Z",
        };
        saved.push(savedAccount);
        return savedAccount;
      },
      log: async () => undefined,
    });
    (service as unknown as { createApi(cookies: string | Record<string, string> | undefined): unknown }).createApi = () => ({
      getUserInfo: async () => ({ userId: account.userId, username: account.username, mallId: "mall-1" }),
      getShopInfo: async () => ({ shopId: account.shopId, shopName: account.shopName ?? "测试店" }),
    });

    await expect(service.refreshAccountSession(account.id)).resolves.toMatchObject({
      ok: true,
      account: { id: account.id, shopId: account.shopId },
    });

    expect(JSON.parse(saved[0]!.cookies!)).toMatchObject({
      api_uid: "uid-a",
      "anti-content": "anti-from-refresh",
    });
  });

  it("keeps the Chromium sandbox enabled for browser login sessions", async () => {
    const launchOptions: Array<{ args: string[] }> = [];
    const page = {
      async goto() {},
      async click() {},
      async fill() {},
      async waitForFunction() {},
      async waitForURL() {
        throw new Error("still authenticated");
      },
      async waitForLoadState() {},
      async waitForTimeout() {},
      async title() {
        return "首页";
      },
      url() {
        return "https://mms.pinduoduo.com/home/";
      },
      on() {},
      off() {},
    };
    const service = new PddService({
      dataDir: "/tmp/customer-agent-test",
      playwright: {
        chromium: {
          launchPersistentContext: async (_userDataDir: string, options: { args: string[] }) => {
            launchOptions.push(options);
            return {
              pages: () => [page],
              newPage: async () => page,
              cookies: async () => [{ name: "api_uid", value: "uid-a" }],
              close: async () => undefined,
            };
          },
        },
      } as never,
      saveAccount: async (account) => ({
        ...account,
        id: account.id ?? "account-1",
        createdAt: "2026-06-25T00:00:00.000Z",
        updatedAt: "2026-06-25T00:00:00.000Z",
      }),
      log: async () => undefined,
    });
    (service as unknown as { createApi(cookies: string | Record<string, string> | undefined): unknown }).createApi = () => ({
      getUserInfo: async () => ({ userId: "user-1", username: "operator", mallId: "mall-1" }),
      getShopInfo: async () => ({ shopId: "shop-1", shopName: "测试店" }),
    });

    await service.login({ channel: "pinduoduo", username: "seller" });

    expect(launchOptions).toHaveLength(1);
    expect(launchOptions[0]?.args).not.toContain("--no-sandbox");
  });
});

describe("PddService multi-account runtime state", () => {
  it("keeps transient websocket closes in background reconnect instead of requiring relogin", async () => {
    vi.useFakeTimers();
    const account = accountRecord("account-a", "shop-a");
    const saved: AccountRecord[] = [];
    const service = new PddService({
      getAccount: async (id) => id === account.id ? account : undefined,
      saveAccount: async (record) => {
        const savedAccount: AccountRecord = {
          ...record,
          id: record.id ?? account.id,
          createdAt: "2026-06-24T00:00:00.000Z",
          updatedAt: "2026-06-24T00:00:00.000Z",
        };
        saved.push(savedAccount);
        return savedAccount;
      },
      log: async () => undefined,
    });
    const connections = (service as unknown as { connections: Map<string, unknown> }).connections;
    connections.set(account.id, runtimeConnection(account.id, {
      reconnectCount: PddService.RECONNECT_MAX_ATTEMPTS + 1,
    }));

    await invokeHandleSocketClose(service, account, { code: 1005, reason: "" });

    expect(service.getAccountRuntimeState(account.id)).toMatchObject({
      state: "running",
      failureCategory: "network",
      lastError: "1005:",
      requiresRelogin: false,
    });
    expect(saved).not.toContainEqual(expect.objectContaining({ status: "error" }));

    await service.stopAccount(account.id);
  });

  it("does not persist transient websocket errors as account login errors while reconnecting", async () => {
    vi.useFakeTimers();
    const account = accountRecord("account-a", "shop-a");
    const saved: AccountRecord[] = [];
    const service = new PddService({
      getAccount: async (id) => id === account.id ? account : undefined,
      saveAccount: async (record) => {
        const savedAccount: AccountRecord = {
          ...record,
          id: record.id ?? account.id,
          createdAt: "2026-06-24T00:00:00.000Z",
          updatedAt: "2026-06-24T00:00:00.000Z",
        };
        saved.push(savedAccount);
        return savedAccount;
      },
      log: async () => undefined,
    });
    const connections = (service as unknown as { connections: Map<string, unknown> }).connections;
    connections.set(account.id, runtimeConnection(account.id));

    await invokeHandleSocketError(service, account);

    expect(service.getAccountRuntimeState(account.id)).toMatchObject({
      state: "running",
      failureCategory: "network",
      lastError: "websocket_error",
      requiresRelogin: false,
    });
    expect(saved).not.toContainEqual(expect.objectContaining({ status: "error" }));

    await service.stopAccount(account.id);
  });

  it("stops one account without changing another account runtime state", async () => {
    const accounts = new Map<string, AccountRecord>([
      ["account-a", accountRecord("account-a", "shop-a")],
      ["account-b", accountRecord("account-b", "shop-b")],
    ]);
    const saved: AccountRecord[] = [];
    const service = new PddService({
      getAccount: async (id) => accounts.get(id),
      saveAccount: async (account) => {
        const savedAccount: AccountRecord = {
          ...account,
          id: account.id ?? `${account.shopId}-${account.userId}`,
          createdAt: "2026-06-24T00:00:00.000Z",
          updatedAt: "2026-06-24T00:00:00.000Z",
        };
        saved.push(savedAccount);
        accounts.set(savedAccount.id, savedAccount);
        return savedAccount;
      },
    });

    const connections = (service as unknown as { connections: Map<string, unknown> }).connections;
    connections.set("account-a", runtimeConnection("account-a"));
    connections.set("account-b", runtimeConnection("account-b"));

    await service.stopAccount("account-a");

    expect(service.getAccountRuntimeState("account-a")).toMatchObject({ state: "stopped" });
    expect(service.getAccountRuntimeState("account-b")).toMatchObject({
      state: "running",
      websocketConnected: true,
    });
    expect(saved).toContainEqual(expect.objectContaining({ id: "account-a", status: "offline" }));
    expect(saved).not.toContainEqual(expect.objectContaining({ id: "account-b", status: "offline" }));
  });

  it("sets real customer-service availability without stopping the connection", async () => {
    let account: AccountRecord = {
      ...accountRecord("account-a", "shop-a"),
      cookies: JSON.stringify({ PDDAccessToken: "token" }),
    };
    const saved: AccountRecord[] = [];
    const setOnlineStatus = vi.fn(async () => true);
    const service = new PddService({
      getAccount: async (id) => id === account.id ? account : undefined,
      saveAccount: async (input) => {
        account = { ...account, ...input, id: input.id ?? account.id };
        saved.push(account);
        return account;
      },
      log: async () => undefined,
    });
    (service as unknown as { createApi: () => { setOnlineStatus: typeof setOnlineStatus } }).createApi = () => ({ setOnlineStatus });
    (service as unknown as { connections: Map<string, unknown> }).connections.set(account.id, runtimeConnection(account.id));

    await expect(service.setAccountAvailability(account.id, "busy")).resolves.toEqual({ ok: true });

    expect(setOnlineStatus).toHaveBeenCalledWith("busy");
    expect(saved.at(-1)).toMatchObject({ id: account.id, status: "busy" });
    expect(service.getAccountRuntimeState(account.id)).toMatchObject({ state: "running" });
  });

  it("logs out an account by clearing stored cookies and browser session", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "customer-agent-pdd-"));
    try {
      let account: AccountRecord = {
        ...accountRecord("account-a", "shop-a"),
        username: "seller-a",
        cookies: JSON.stringify({ PDDAccessToken: "token", "anti-content": "anti" }),
      };
      const profileDir = path.join(dataDir, "pdd-profiles", "seller-a");
      await mkdir(profileDir, { recursive: true });
      const saved: AccountRecord[] = [];
      const service = new PddService({
        dataDir,
        getAccount: async (id) => id === account.id ? account : undefined,
        saveAccount: async (input) => {
          const nextAccount: AccountRecord = {
            id: input.id ?? account.id,
            channel: input.channel,
            username: input.username,
            shopId: input.shopId,
            userId: input.userId,
            status: input.status,
            createdAt: account.createdAt,
            updatedAt: "2026-06-24T00:00:01.000Z",
          };
          if (input.shopName) {
            nextAccount.shopName = input.shopName;
          }
          if (input.cookies) {
            nextAccount.cookies = input.cookies;
          }
          if (input.error) {
            nextAccount.error = input.error;
          }
          account = nextAccount;
          saved.push(account);
          return account;
        },
        log: async () => undefined,
      });
      const connections = (service as unknown as { connections: Map<string, unknown> }).connections;
      connections.set(account.id, runtimeConnection(account.id));

      await expect(service.logoutAccount(account.id)).resolves.toEqual({ ok: true });

      expect(service.getAccountRuntimeState(account.id)).toMatchObject({ state: "stopped" });
      expect(saved.at(-1)).toMatchObject({ id: account.id, status: "offline" });
      expect(saved.at(-1)?.cookies).toBeUndefined();
      await expect(access(profileDir)).rejects.toThrow();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});

async function invokeHandleSocketMessage(
  service: PddService,
  account: AccountRecord,
  data: string,
): Promise<void> {
  await (service as unknown as {
    handleSocketMessage(account: AccountRecord, data: string): Promise<void>;
  }).handleSocketMessage(account, data);
}

async function invokeHandleSocketClose(
  service: PddService,
  account: AccountRecord,
  event: { code?: number; reason?: string },
): Promise<void> {
  const connection = (service as unknown as {
    connections: Map<string, unknown>;
  }).connections.get(account.id);
  await (service as unknown as {
    handleSocketClose(account: AccountRecord, connection: unknown, event?: { code?: number; reason?: string }): Promise<void>;
  }).handleSocketClose(account, connection, event);
}

async function invokeHandleSocketError(
  service: PddService,
  account: AccountRecord,
): Promise<void> {
  const connection = (service as unknown as {
    connections: Map<string, unknown>;
  }).connections.get(account.id);
  await (service as unknown as {
    handleSocketError(account: AccountRecord, connection: unknown): Promise<void>;
  }).handleSocketError(account, connection);
}

function accountRecord(id: string, shopId: string): AccountRecord {
  return {
    id,
    channel: "pinduoduo",
    username: id,
    shopId,
    userId: `${id}-user`,
    status: "online",
    createdAt: "2026-06-24T00:00:00.000Z",
    updatedAt: "2026-06-24T00:00:00.000Z",
  };
}

function runtimeConnection(accountId: string, overrides: Partial<{ reconnectCount: number }> = {}): unknown {
  const socket = {
    OPEN: 1,
    readyState: 1,
    close: vi.fn(),
  };
  return {
    accountId,
    shopId: accountId.replace("account", "shop"),
    username: accountId,
    socket,
    state: "running",
    stopped: false,
    reconnectCount: overrides.reconnectCount ?? 0,
    startedAt: "2026-06-24T00:00:00.000Z",
    requiresRelogin: false,
  };
}
