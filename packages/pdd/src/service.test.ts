import { afterEach, describe, expect, it, vi } from "vitest";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AccountRecord, MessageRecord } from "@customer-agent/core";
import { classifyConnectionError, resolvePddProfileDir } from "./service.js";
import { PddService } from "./service.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeWebSocket.instances = [];
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

  it("does not misclassify a busy browser profile as an expired session", () => {
    const failure = classifyConnectionError(new Error("Opening in existing browser session: profile already in use"), {
      accountId: "account-1",
      shopId: "shop-1",
      username: "店主",
      operation: "session-health",
    });

    expect(failure.requiresRelogin).toBe(false);
  });

  it("redacts and bounds failure summaries at the service boundary", () => {
    const secret = "audit-cookie-secret";
    const failure = classifyConnectionError(new Error(`cookie=${secret}\n${"x".repeat(500)}`), {
      accountId: "account-1",
      shopId: "shop-1",
      username: "店主",
      operation: "session-health",
    });

    expect(failure.summary).not.toContain(secret);
    expect(failure.summary).toContain("[REDACTED]");
    expect(failure.summary.length).toBeLessThanOrEqual(300);
  });
});

describe("resolvePddProfileDir", () => {
  it("gives ambiguous usernames distinct contained profile directories", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "customer-agent-pdd-"));
    try {
      const first = await resolvePddProfileDir(dataDir, "店主甲");
      const second = await resolvePddProfileDir(dataDir, "店主乙");

      expect(first).not.toBe(second);
      expect(path.dirname(first)).toBe(path.join(dataDir, "pdd-profiles"));
      expect(path.dirname(second)).toBe(path.join(dataDir, "pdd-profiles"));
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("migrates an existing safe legacy profile instead of dropping its session", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "customer-agent-pdd-"));
    const legacyDir = path.join(dataDir, "pdd-profiles", "___");
    try {
      await mkdir(legacyDir, { recursive: true });
      await writeFile(path.join(legacyDir, "session"), "saved");

      const currentDir = await resolvePddProfileDir(dataDir, "店主甲");

      await expect(access(path.join(currentDir, "session"))).resolves.toBeUndefined();
      await expect(access(legacyDir)).rejects.toThrow();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("keeps case variants distinct on case-insensitive filesystems", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "customer-agent-pdd-"));
    try {
      const upper = path.basename(await resolvePddProfileDir(dataDir, "Seller"));
      const lower = path.basename(await resolvePddProfileDir(dataDir, "seller"));

      expect(upper).toMatch(/^user-[a-f0-9]{64}$/);
      expect(lower).toMatch(/^user-[a-f0-9]{64}$/);
      expect(upper.toLowerCase()).not.toBe(lower.toLowerCase());
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
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
    const staleConnection = runtimeConnection("account-1") as { requiresRelogin: boolean };
    staleConnection.requiresRelogin = true;
    (service as unknown as { connections: Map<string, unknown> }).connections.set("account-1", staleConnection);

    await expect(service.login({ channel: "pinduoduo", username: "seller" })).resolves.toMatchObject({
      ok: true,
      accountId: "account-1",
      shopId: "shop-1",
    });

    expect(JSON.parse(saved[0]!.cookies!)).toEqual({
      api_uid: "uid-a",
      "anti-content": "anti-from-browser-request",
    });
    expect(service.getAccountRuntimeState("account-1")).toMatchObject({ state: "stopped" });
    expect(service.getAccountRuntimeState("account-1").requiresRelogin).toBeUndefined();
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

  it("sanitizes login and refresh failures before returning or logging them", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "customer-agent-pdd-"));
    const account = accountRecord("account-1", "shop-1");
    const secret = "browser-cookie-secret";
    const rawError = `cookie=${secret}\n${"x".repeat(500)}`;
    const logs: string[] = [];
    const service = new PddService({
      dataDir,
      getAccount: async (accountId) => accountId === account.id ? account : undefined,
      saveAccount: async (input) => ({ ...account, ...input, id: input.id ?? account.id }),
      playwright: {
        chromium: {
          launchPersistentContext: async () => {
            throw new Error(rawError);
          },
        },
      } as never,
      log: async (_level, message) => { logs.push(message); },
    });
    try {
      const login = await service.login({ channel: "pinduoduo", username: "seller" });
      const refresh = await service.refreshAccountSession(account.id);

      for (const result of [login, refresh]) {
        expect(result.error).not.toContain(secret);
        expect(result.error).toContain("[REDACTED]");
        expect(result.error!.length).toBeLessThanOrEqual(300);
      }
      expect(logs.join("\n")).not.toContain(secret);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});

describe("PddService multi-account runtime state", () => {
  it("sanitizes returned and persisted text/image send failures", async () => {
    const account = accountRecord("account-a", "shop-a");
    const message: MessageRecord = {
      id: "message-a",
      channel: "pinduoduo",
      type: "text",
      content: "你好",
      shopId: account.shopId,
      accountId: account.id,
      buyerId: "buyer-a",
      receivedAt: "2026-06-24T00:00:00.000Z",
      state: "received",
      updatedAt: "2026-06-24T00:00:00.000Z",
    };
    const secret = "send-cookie-secret";
    const rawError = `cookie=${secret}\n${"x".repeat(500)}`;
    const saved: MessageRecord[] = [];
    const logs: string[] = [];
    const service = new PddService({
      getAccount: async (id) => id === account.id ? account : undefined,
      getMessage: async (id) => id === message.id ? message : undefined,
      saveMessage: async (input) => {
        const next = { ...input, updatedAt: "2026-06-24T00:00:01.000Z" };
        saved.push(next);
        return next;
      },
      log: async (_level, value) => { logs.push(value); },
    });
    (service as unknown as { createApi: () => unknown }).createApi = () => ({
      sendText: async () => ({ ok: false, error: rawError }),
      sendImage: async () => { throw new Error(rawError); },
    });

    const textResult = await service.sendMessage(message.id, "回复");
    const imageResult = await service.sendImage(message.id, "https://example.com/image.png");

    for (const result of [textResult, imageResult]) {
      expect(result.error).not.toContain(secret);
      expect(result.error).toContain("[REDACTED]");
      expect(result.error!.length).toBeLessThanOrEqual(300);
    }
    expect(saved).toHaveLength(2);
    expect(saved.every((item) => !item.error?.includes(secret))).toBe(true);
    expect(logs.join("\n")).not.toContain(secret);
  });

  it("cancels an in-flight start before a stop-start replacement creates its socket", async () => {
    const account = accountRecord("account-a", "shop-a");
    let releaseFirst: () => void = () => {};
    let markFirstStarted: () => void = () => {};
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve; });
    const getChatToken = vi.fn()
      .mockImplementationOnce(async () => {
        markFirstStarted();
        await firstGate;
        return "stale-token";
      })
      .mockResolvedValue("fresh-token");
    const service = new PddService({
      getAccount: async (id) => id === account.id ? account : undefined,
      saveAccount: async (input) => ({ ...account, ...input, id: input.id ?? account.id }),
      log: async () => undefined,
    });
    (service as unknown as { createApi: () => unknown }).createApi = () => ({
      getChatToken,
      setOnlineStatus: async () => true,
    });
    vi.stubGlobal("WebSocket", FakeWebSocket);

    const staleStart = service.startAccount(account.id);
    await firstStarted;
    await service.stopAccount(account.id);
    const freshStart = service.startAccount(account.id);
    releaseFirst();

    await expect(staleStart).resolves.toEqual({ ok: false, error: "拼多多账号启动已取消。" });
    await expect(freshStart).resolves.toEqual({ ok: true });
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("closes a newly created socket when startup persistence fails", async () => {
    const account = accountRecord("account-a", "shop-a");
    const service = new PddService({
      getAccount: async (id) => id === account.id ? account : undefined,
      saveAccount: async (input) => {
        if (input.status === "online") {
          throw new Error("save failed");
        }
        return { ...account, ...input, id: input.id ?? account.id };
      },
      log: async () => undefined,
    });
    (service as unknown as { createApi: () => unknown }).createApi = () => ({
      getChatToken: async () => "token",
      setOnlineStatus: async () => true,
    });
    vi.stubGlobal("WebSocket", FakeWebSocket);

    await expect(service.startAccount(account.id)).resolves.toEqual({ ok: false, error: "save failed" });

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]?.close).toHaveBeenCalledTimes(1);
    expect(service.getAccountRuntimeState(account.id)).toMatchObject({ state: "stopped" });
  });

  it("sanitizes start failures before persistence, logs, and runtime-state output", async () => {
    const account = accountRecord("account-a", "shop-a");
    const secret = "start-password-secret";
    const rawError = `password=${secret}\n${"x".repeat(500)}`;
    const saved: AccountRecord[] = [];
    const logs: string[] = [];
    const service = new PddService({
      getAccount: async (id) => id === account.id ? account : undefined,
      saveAccount: async (input) => {
        const next = { ...account, ...input, id: input.id ?? account.id };
        saved.push(next);
        return next;
      },
      log: async (_level, message) => { logs.push(message); },
    });
    (service as unknown as { createApi: () => unknown }).createApi = () => ({
      getChatToken: async () => { throw new Error(rawError); },
      setOnlineStatus: async () => true,
    });

    const result = await service.startAccount(account.id);
    const connection = runtimeConnection(account.id) as { state: string; lastError?: string };
    connection.state = "error";
    connection.lastError = rawError;
    (service as unknown as { connections: Map<string, unknown> }).connections.set(account.id, connection);
    const runtime = service.getAccountRuntimeState(account.id);

    expect(result.error).not.toContain(secret);
    expect(result.error).toContain("[REDACTED]");
    expect(result.error!.length).toBeLessThanOrEqual(300);
    expect(saved.at(-1)?.error).not.toContain(secret);
    expect(logs.join("\n")).not.toContain(secret);
    expect(runtime.lastError).not.toContain(secret);
    expect(runtime.lastError).toContain("[REDACTED]");
    expect(runtime.lastError!.length).toBeLessThanOrEqual(300);
  });

  it("refreshes an expired browser session once before requiring relogin", async () => {
    const account = {
      ...accountRecord("account-a", "shop-a"),
      cookies: JSON.stringify({ session: "stale" }),
    };
    const refreshedAccount = {
      ...account,
      cookies: JSON.stringify({ session: "fresh" }),
    };
    const getChatToken = vi.fn()
      .mockRejectedValueOnce(new Error("无法获取 chat token：43001 会话已过期"))
      .mockResolvedValueOnce("fresh-token");
    const setOnlineStatus = vi.fn(async () => true);
    const service = new PddService({
      getAccount: async (id) => id === account.id ? account : undefined,
      saveAccount: async (input) => ({
        ...refreshedAccount,
        ...input,
        id: input.id ?? account.id,
      }),
      log: async () => undefined,
    });
    vi.spyOn(service, "refreshAccountSession").mockResolvedValue({ ok: true, account: refreshedAccount });
    (service as unknown as { createApi: () => unknown }).createApi = () => ({ getChatToken, setOnlineStatus });
    vi.stubGlobal("WebSocket", FakeWebSocket);

    await expect(service.startAccount(account.id)).resolves.toEqual({ ok: true });

    expect(service.refreshAccountSession).toHaveBeenCalledTimes(1);
    expect(getChatToken).toHaveBeenCalledTimes(2);
    expect(setOnlineStatus).toHaveBeenCalledTimes(1);
    expect(service.getAccountRuntimeState(account.id)).toMatchObject({ state: "running", requiresRelogin: false });
  });

  it("marks an old connection stopped before replacing its socket", async () => {
    const account = accountRecord("account-a", "shop-a");
    const service = new PddService({
      getAccount: async (id) => id === account.id ? account : undefined,
      saveAccount: async (input) => ({ ...account, ...input, id: input.id ?? account.id }),
      log: async () => undefined,
    });
    (service as unknown as { createApi: () => unknown }).createApi = () => ({
      getChatToken: async () => "token",
      setOnlineStatus: async () => true,
    });
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const oldConnection = runtimeConnection(account.id) as {
      state: "error";
      stopped: boolean;
      socket: { close: ReturnType<typeof vi.fn> };
    };
    oldConnection.state = "error";
    let stoppedAtClose = false;
    oldConnection.socket.close = vi.fn(() => {
      stoppedAtClose = oldConnection.stopped;
    });
    (service as unknown as { connections: Map<string, unknown> }).connections.set(account.id, oldConnection);

    await expect(service.startAccount(account.id)).resolves.toEqual({ ok: true });

    expect(oldConnection.socket.close).toHaveBeenCalledTimes(1);
    expect(stoppedAtClose).toBe(true);
  });

  it("stops transient websocket reconnects after the bounded retry limit", async () => {
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
      reconnectCount: PddService.RECONNECT_MAX_ATTEMPTS,
    }));

    await invokeHandleSocketClose(service, account, { code: 1005, reason: "" });
    await Promise.resolve();

    expect(service.getAccountRuntimeState(account.id)).toMatchObject({
      state: "error",
      failureCategory: "network",
      lastError: "reconnect_retries_exhausted",
      requiresRelogin: false,
    });
    expect(saved).toContainEqual(expect.objectContaining({ status: "error", error: "reconnect_retries_exhausted" }));

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

  it("keeps credentials cleared when browser-profile deletion fails", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "customer-agent-pdd-"));
    let account: AccountRecord = {
      ...accountRecord("account-a", "shop-a"),
      username: "seller-a",
      cookies: JSON.stringify({ PDDAccessToken: "token" }),
    };
    const removeProfileDir = vi.fn(async () => {
      throw new Error("cookie=profile-cleanup-secret");
    });
    const logs: string[] = [];
    const service = new PddService({
      dataDir,
      getAccount: async (id) => id === account.id ? account : undefined,
      saveAccount: async (input) => {
        const next: AccountRecord = {
          id: input.id ?? account.id,
          channel: input.channel,
          username: input.username,
          shopId: input.shopId,
          userId: input.userId,
          status: input.status,
          createdAt: account.createdAt,
          updatedAt: "2026-06-24T00:00:01.000Z",
          ...(input.shopName ? { shopName: input.shopName } : {}),
          ...(input.cookies ? { cookies: input.cookies } : {}),
          ...(input.error ? { error: input.error } : {}),
        };
        account = next;
        return next;
      },
      removeProfileDir,
      log: async (_level, message) => { logs.push(message); },
    });
    try {
      await expect(service.logoutAccount(account.id)).resolves.toEqual({
        ok: false,
        error: "登录凭据已清除，但 PDD 浏览器会话资料清理失败。",
      });

      expect(removeProfileDir).toHaveBeenCalledTimes(1);
      expect(account.cookies).toBeUndefined();
      expect(account.error).toBeUndefined();
      expect(logs.join("\n")).not.toContain("profile-cleanup-secret");
      await expect(service.startAccount(account.id)).resolves.toEqual({
        ok: false,
        error: "账号缺少可用会话，请先完成真实拼多多登录。",
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("blocks account starts until logout has cleared the persisted session", async () => {
    let account = accountRecord("account-a", "shop-a");
    let releaseStopSave: () => void = () => {};
    let markStopSaveStarted: () => void = () => {};
    const stopSaveGate = new Promise<void>((resolve) => { releaseStopSave = resolve; });
    const stopSaveStarted = new Promise<void>((resolve) => { markStopSaveStarted = resolve; });
    let saveCount = 0;
    const service = new PddService({
      getAccount: async (id) => id === account.id ? account : undefined,
      saveAccount: async (input) => {
        saveCount += 1;
        if (saveCount === 1) {
          markStopSaveStarted();
          await stopSaveGate;
        }
        const next: AccountRecord = {
          id: input.id ?? account.id,
          channel: input.channel,
          username: input.username,
          shopId: input.shopId,
          userId: input.userId,
          status: input.status,
          createdAt: account.createdAt,
          updatedAt: "2026-06-24T00:00:01.000Z",
          ...(input.cookies ? { cookies: input.cookies } : {}),
        };
        account = next;
        return next;
      },
      log: async () => undefined,
    });
    (service as unknown as { createApi: () => unknown }).createApi = () => ({
      getChatToken: async () => "token",
      setOnlineStatus: async () => true,
    });
    vi.stubGlobal("WebSocket", FakeWebSocket);

    const logout = service.logoutAccount(account.id);
    await stopSaveStarted;

    await expect(service.startAccount(account.id)).resolves.toEqual({
      ok: false,
      error: "拼多多账号启动已取消。",
    });
    releaseStopSave();
    await expect(logout).resolves.toEqual({ ok: true });

    expect(account.cookies).toBeUndefined();
    await expect(service.startAccount(account.id)).resolves.toEqual({
      ok: false,
      error: "账号缺少可用会话，请先完成真实拼多多登录。",
    });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("never deletes the profile root for a traversal-shaped username", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "customer-agent-pdd-"));
    const profileRoot = path.join(dataDir, "pdd-profiles");
    const marker = path.join(profileRoot, "keep.txt");
    try {
      await mkdir(profileRoot, { recursive: true });
      await writeFile(marker, "keep");
      const account = { ...accountRecord("account-a", "shop-a"), username: ".." };
      const service = new PddService({
        dataDir,
        getAccount: async (id) => id === account.id ? account : undefined,
        saveAccount: async (input) => ({ ...account, ...input, id: input.id ?? account.id }),
      });

      await expect(service.logoutAccount(account.id)).resolves.toEqual({ ok: true });

      await expect(access(marker)).resolves.toBeUndefined();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("disposes sockets and browser contexts exactly through their cleanup boundary", async () => {
    const service = new PddService();
    const connection = runtimeConnection("account-a") as { socket: { close: ReturnType<typeof vi.fn> } };
    const closeContext = vi.fn(async () => undefined);
    (service as unknown as { generations: Map<string, number> }).generations.set("account-a", 1);
    (service as unknown as { connections: Map<string, unknown> }).connections.set("account-a", connection);
    (service as unknown as { browserContexts: Set<unknown> }).browserContexts.add({ close: closeContext });

    await service.dispose();

    expect(connection.socket.close).toHaveBeenCalledTimes(1);
    expect(closeContext).toHaveBeenCalledTimes(1);
    await expect(service.startAccount("account-a")).resolves.toEqual({ ok: false, error: "拼多多账号启动已取消。" });
  });

  it("does not block disposal forever when a browser context refuses to close", async () => {
    vi.useFakeTimers();
    try {
      const service = new PddService({ browserCloseTimeoutMs: 25 });
      const closeContext = vi.fn(() => new Promise<void>(() => {}));
      (service as unknown as { browserContexts: Set<unknown> }).browserContexts.add({ close: closeContext });

      const disposing = service.dispose();
      await vi.advanceTimersByTimeAsync(25);
      await expect(disposing).resolves.toBeUndefined();
      expect(closeContext).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
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
  (service as unknown as { generations: Map<string, number> }).generations.set(account.id, 1);
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
  (service as unknown as { generations: Map<string, number> }).generations.set(account.id, 1);
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
    cookies: "{}",
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
    generation: 1,
  };
}

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly OPEN = 1;
  readonly CONNECTING = 0;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  readonly close = vi.fn(() => {
    this.readyState = 3;
  });

  constructor() {
    FakeWebSocket.instances.push(this);
  }
}
