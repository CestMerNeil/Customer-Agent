import type {
  AccountRecord,
  AppSettings,
  MessageRecord,
  ReplyDraftRecord,
  ReplyMode,
} from "@customer-agent/core";
import { createMockPdd, PddService } from "@customer-agent/pdd";
import { describe, expect, it } from "vitest";
import { generateAndPersistReply } from "./reply.js";

// Seam B: prove the received → reply → send glue. Real PddService + mock-pdd
// edge + the real generateAndPersistReply helper (real reply-workflow) + a mock
// inference client and stub knowledge service. Mirrors the wiring in index.ts.

const REPLY_TEXT = "您好，有 L 码现货。";

const account: AccountRecord = {
  id: "account-1",
  channel: "pinduoduo",
  username: "seller",
  shopId: "shop-1",
  userId: "user-1",
  status: "online",
  cookies: "{\"PDDAccessToken\":\"token\"}",
  createdAt: "2026-05-29T00:00:00.000Z",
  updatedAt: "2026-05-29T00:00:00.000Z",
};

function createStore(replyMode: ReplyMode) {
  const messages = new Map<string, MessageRecord>();
  const drafts = new Map<string, ReplyDraftRecord>();
  const accounts = new Map<string, AccountRecord>([[account.id, account]]);
  const settings: AppSettings = {
    replyMode,
    businessHours: { start: "09:00", end: "21:00" },
    knowledge: { chunkSize: 500, chunkOverlap: 50, topK: 3 },
  };
  return {
    messages,
    drafts,
    settings,
    getSettings: async () => settings,
    saveDraft: async (draft: ReplyDraftRecord) => {
      drafts.set(draft.id, draft);
      return draft;
    },
    getDraft: async (id: string) => drafts.get(id),
    appendLog: async () => ({ id: "log-1", level: "error" as const, message: "", createdAt: "now" }),
    getAccount: async (id: string) => accounts.get(id),
    saveAccount: async (saved: Omit<AccountRecord, "id" | "createdAt" | "updatedAt"> & { id?: string }) => {
      const record: AccountRecord = { ...account, ...saved, id: saved.id ?? account.id };
      accounts.set(record.id, record);
      return record;
    },
    getMessage: async (id: string) => messages.get(id),
    saveMessage: async (saved: Omit<MessageRecord, "updatedAt">) => {
      const record: MessageRecord = { ...saved, updatedAt: "now" };
      messages.set(record.id, record);
      return record;
    },
  };
}

// Mock inference client + stub knowledge service, matching the deps the helper
// reads (client.chat, knowledge.search).
const deps = (store: ReturnType<typeof createStore>) => ({
  store,
  createInferenceClient: async () => ({ chat: async () => REPLY_TEXT }),
  createKnowledgeService: async () => ({ search: async () => [] }),
});

function buildService(store: ReturnType<typeof createStore>): PddService {
  const mock = createMockPdd();
  const service = new PddService({
    getAccount: store.getAccount,
    saveAccount: store.saveAccount,
    getMessage: store.getMessage,
    saveMessage: store.saveMessage,
    getDraft: store.getDraft,
    saveDraft: store.saveDraft,
    WebSocketCtor: mock.WebSocketCtor,
    fetchImpl: mock.fetchImpl,
    onMessageReceived: async (message) => {
      const { replyMode } = await store.getSettings();
      const result = await generateAndPersistReply({ context: message, mode: replyMode }, deps(store));
      if (result.ok && replyMode === "automatic") {
        await service.sendMessage(message.id, result.reply.text);
      }
    },
  });
  return Object.assign(service, { mock });
}

describe("Seam B — received → reply → send glue", () => {
  it("3.2 human_review: inbound message produces a draft_ready draft that can be sent", async () => {
    const store = createStore("human_review");
    const service = buildService(store) as PddService & { mock: ReturnType<typeof createMockPdd> };

    await service.startAccount("account-1");
    service.mock.pushBuyerMessage();
    await flush();

    const draft = [...store.drafts.values()][0];
    expect(draft).toMatchObject({ state: "draft_ready", messageId: "msg-1" });
    expect(draft!.reply.text).toBe(REPLY_TEXT);
    expect(service.mock.requests.send_message).toBeUndefined();

    await expect(service.sendDraft(draft!.id)).resolves.toEqual({ ok: true });
    expect(store.messages.get("msg-1")).toMatchObject({ state: "sent" });
    expect(store.drafts.get(draft!.id)).toMatchObject({ state: "sent" });

    const body = JSON.parse(service.mock.requests.send_message![0]!.body) as {
      data: { message: { to: { uid: string }; content: string } };
    };
    expect(body.data.message.to.uid).toBe("buyer-1");
    expect(body.data.message.content).toBe(REPLY_TEXT);
  });

  it("3.2 automatic: inbound message is replied and sent without a draft", async () => {
    const store = createStore("automatic");
    const service = buildService(store) as PddService & { mock: ReturnType<typeof createMockPdd> };

    await service.startAccount("account-1");
    service.mock.pushBuyerMessage();
    await flush();

    expect(store.drafts.size).toBe(0);
    expect(store.messages.get("msg-1")).toMatchObject({ state: "sent", replyText: REPLY_TEXT });

    const sent = service.mock.requests.send_message ?? [];
    expect(sent).toHaveLength(1);
    const body = JSON.parse(sent[0]!.body) as { data: { message: { to: { uid: string }; content: string } } };
    expect(body.data.message.to.uid).toBe("buyer-1");
    expect(body.data.message.content).toBe(REPLY_TEXT);
  });
});

// onMessageReceived runs async off saveMessage; let the microtask queue drain.
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
