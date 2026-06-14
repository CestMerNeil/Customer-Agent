import type { AccountRecord } from "@customer-agent/core";
import { afterEach, describe, expect, it, vi } from "vitest";

const openedUrls: string[] = [];

vi.mock("ws", () => ({
  default: class FallbackWebSocket {
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;

    constructor(public readonly url: string) {
      openedUrls.push(url);
    }

    close(): void {
      this.onclose?.();
    }
  },
}));

const account: AccountRecord = {
  id: "account-1",
  channel: "pinduoduo",
  username: "seller",
  shopId: "shop-1",
  userId: "user-1",
  status: "offline",
  cookies: "{\"PDDAccessToken\":\"token\"}",
  createdAt: "2026-05-29T00:00:00.000Z",
  updatedAt: "2026-05-29T00:00:00.000Z",
};

afterEach(() => {
  openedUrls.length = 0;
  vi.unstubAllGlobals();
});

describe("PddService WebSocket runtime", () => {
  it("uses the ws fallback when no injected or global WebSocket constructor exists", async () => {
    vi.stubGlobal("WebSocket", undefined);
    const { PddService } = await import("./service.js");
    const savedAccounts: AccountRecord[] = [];

    const service = new PddService({
      getAccount: async () => account,
      saveAccount: async (saved) => {
        const record = { ...account, ...saved };
        savedAccounts.push(record);
        return record;
      },
      fetchImpl: pddStartFetch(),
    });

    await expect(service.startAccount(account.id)).resolves.toEqual({ ok: true });
    expect(openedUrls).toHaveLength(1);
    expect(openedUrls[0]).toContain("wss://m-ws.pinduoduo.com/");
    expect(openedUrls[0]).toContain("access_token=mock-chat-token");
    expect(savedAccounts.at(-1)).toMatchObject({ id: account.id, status: "online" });
  });

  it("prefers the injected WebSocket constructor over the fallback", async () => {
    vi.stubGlobal("WebSocket", undefined);
    const injectedUrls: string[] = [];
    const InjectedWebSocket = function (this: { url: string; close: () => void }, url: string) {
      this.url = url;
      this.close = () => {};
      injectedUrls.push(url);
    } as unknown as typeof WebSocket;
    const { PddService } = await import("./service.js");

    const service = new PddService({
      getAccount: async () => account,
      saveAccount: async (saved) => ({ ...account, ...saved }),
      fetchImpl: pddStartFetch(),
      WebSocketCtor: InjectedWebSocket,
    });

    await expect(service.startAccount(account.id)).resolves.toEqual({ ok: true });
    expect(injectedUrls).toHaveLength(1);
    expect(openedUrls).toHaveLength(0);
  });
});

function pddStartFetch(): typeof fetch {
  return vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes("chats/getToken")) {
      return jsonResponse({ token: "mock-chat-token" });
    }
    if (url.includes("set_csstatus")) {
      return jsonResponse({ success: true, result: {} });
    }
    return jsonResponse({ success: false, errorMsg: `unexpected URL ${url}` });
  }) as unknown as typeof fetch;
}

function jsonResponse(payload: unknown): { ok: true; status: number; json: () => Promise<unknown>; text: () => Promise<string> } {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}
