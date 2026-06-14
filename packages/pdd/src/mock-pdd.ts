// Mock Pinduoduo edge (library mode). Provides injectable doubles for the
// WebSocket and fetch seams of PddService so the receive/send pipe can be
// driven deterministically without a real account. Fixtures are seeded from
// real shapes pinned in normalizer.test.ts and the response fields api.ts reads.

/** Inbound WS frame shape, as pinned in normalizer.test.ts. */
export interface MockBuyerFrame {
  msg_id: string;
  message_type: number | string;
  content: string;
  from: { uid: string; nickname?: string };
  ts: number;
}

/** A request body captured by the mock fetch, keyed by endpoint. */
export interface RecordedRequest {
  url: string;
  body: string;
}

/** Default recorded fixtures, derived from real PDD shapes. */
export const mockFixtures = {
  buyerFrame: {
    msg_id: "msg-1",
    message_type: 0,
    content: "有 L 码吗？",
    from: { uid: "buyer-1", nickname: "买家A" },
    ts: 1779984000000,
  } satisfies MockBuyerFrame,
  getToken: { token: "mock-chat-token" },
  userInfo: { success: true, result: { id: "user-1", username: "客服", mall_id: "mall-1" } },
  shopInfo: { success: true, result: { mallId: "shop-1", mallName: "测试店", mallLogo: "logo.png" } },
  setOnlineStatus: { success: true, result: {} },
  sendMessage: { success: true, result: { msg_id: "sent-1" } },
};

/** Fake WebSocket compatible with how service.ts uses the constructor. */
class MockSocket {
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public readonly url: string) {}

  pushBuyerMessage(frame: MockBuyerFrame): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  close(): void {
    this.onclose?.();
  }
}

export interface MockPdd {
  /** Inject as `WebSocketCtor` into PddService. */
  WebSocketCtor: typeof WebSocket;
  /** Inject as `fetchImpl` into PddService. */
  fetchImpl: typeof fetch;
  /** The socket opened by the most recent startAccount, if any. */
  readonly socket: MockSocket | undefined;
  /** Push a buyer frame into the open socket. */
  pushBuyerMessage(frame?: MockBuyerFrame): void;
  /** Request bodies received per endpoint key (e.g. "send_message"). */
  readonly requests: Record<string, RecordedRequest[]>;
  /** Force the send_message endpoint to return an error response. */
  failSend(error?: string): void;
}

export interface CreateMockPddOptions {
  /** When set, send_message returns this error instead of success. */
  sendError?: string;
}

export function createMockPdd(options: CreateMockPddOptions = {}): MockPdd {
  let socket: MockSocket | undefined;
  let sendError = options.sendError;
  const requests: Record<string, RecordedRequest[]> = {};

  const record = (key: string, url: string, body: string): void => {
    (requests[key] ??= []).push({ url, body });
  };

  const WebSocketCtor = function (this: MockSocket, url: string) {
    const instance = new MockSocket(url);
    socket = instance;
    return instance;
  } as unknown as typeof WebSocket;

  const fetchImpl = (async (input: unknown, init?: { body?: string }): Promise<unknown> => {
    const url = String(input);
    const body = typeof init?.body === "string" ? init.body : "";

    if (url.includes("chats/getToken")) {
      record("getToken", url, body);
      return jsonResponse(mockFixtures.getToken);
    }
    if (url.includes("janus/api/new/userinfo")) {
      record("userInfo", url, body);
      return jsonResponse(mockFixtures.userInfo);
    }
    if (url.includes("queryMerchantInfoByMallId")) {
      record("shopInfo", url, body);
      return jsonResponse(mockFixtures.shopInfo);
    }
    if (url.includes("set_csstatus")) {
      record("setOnlineStatus", url, body);
      return jsonResponse(mockFixtures.setOnlineStatus);
    }
    if (url.includes("send_message")) {
      record("send_message", url, body);
      if (sendError) {
        return jsonResponse({ success: false, errorMsg: sendError });
      }
      return jsonResponse(mockFixtures.sendMessage);
    }
    return jsonResponse({ success: false, errorMsg: `mock-pdd: unrecognized endpoint ${url}` });
  }) as unknown as typeof fetch;

  return {
    WebSocketCtor,
    fetchImpl,
    get socket() {
      return socket;
    },
    pushBuyerMessage(frame = mockFixtures.buyerFrame) {
      if (!socket) {
        throw new Error("mock-pdd: no socket open; call startAccount first");
      }
      socket.pushBuyerMessage(frame);
    },
    requests,
    failSend(error = "session expired") {
      sendError = error;
    },
  };
}

function jsonResponse(payload: unknown): { ok: true; status: number; json: () => Promise<unknown>; text: () => Promise<string> } {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}
