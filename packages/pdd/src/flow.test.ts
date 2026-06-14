import type { AccountRecord, MessageRecord, ReplyDraftRecord } from "@customer-agent/core";
import { describe, expect, it } from "vitest";
import { createMockPdd } from "./mock-pdd.js";
import { PddService } from "./service.js";

// Seam A: prove that a buyer message flows in and a reply flows out through the
// real PddService / normalizer / api / client code, driven only by the mock edge.

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

function createStore() {
  const messages = new Map<string, MessageRecord>();
  const drafts = new Map<string, ReplyDraftRecord>();
  const accounts = new Map<string, AccountRecord>([[account.id, account]]);
  return {
    messages,
    drafts,
    callbacks: {
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
      getDraft: async (id: string) => drafts.get(id),
      saveDraft: async (saved: ReplyDraftRecord) => {
        drafts.set(saved.id, saved);
        return saved;
      },
    },
  };
}

describe("Seam A — transport / normalize / service flow", () => {
  it("2.1 receives a pushed buyer frame and persists it as state=received", async () => {
    const store = createStore();
    const mock = createMockPdd();
    const service = new PddService({
      ...store.callbacks,
      WebSocketCtor: mock.WebSocketCtor,
      fetchImpl: mock.fetchImpl,
    });

    await expect(service.startAccount("account-1")).resolves.toEqual({ ok: true });
    mock.pushBuyerMessage();
    await flush();

    const received = store.messages.get("msg-1");
    expect(received).toMatchObject({
      state: "received",
      buyerId: "buyer-1",
      buyerNickname: "买家A",
      shopId: "shop-1",
      accountId: "account-1",
      content: "有 L 码吗？",
    });
  });

  it("2.2 sends a reply: send_message endpoint gets buyer uid + content and message becomes sent", async () => {
    const store = createStore();
    const mock = createMockPdd();
    const service = new PddService({
      ...store.callbacks,
      WebSocketCtor: mock.WebSocketCtor,
      fetchImpl: mock.fetchImpl,
    });

    await service.startAccount("account-1");
    mock.pushBuyerMessage();
    await flush();

    await expect(service.sendMessage("msg-1", "您好，有货。")).resolves.toEqual({ ok: true });

    const sent = mock.requests.send_message ?? [];
    expect(sent).toHaveLength(1);
    const body = JSON.parse(sent[0]!.body) as { data: { message: { to: { uid: string }; content: string } } };
    expect(body.data.message.to.uid).toBe("buyer-1");
    expect(body.data.message.content).toBe("您好，有货。");

    expect(store.messages.get("msg-1")).toMatchObject({ state: "sent", replyText: "您好，有货。" });
  });

  it("2.2 sends a draft: send_message endpoint gets the draft reply and draft becomes sent", async () => {
    const store = createStore();
    const mock = createMockPdd();
    const service = new PddService({
      ...store.callbacks,
      WebSocketCtor: mock.WebSocketCtor,
      fetchImpl: mock.fetchImpl,
    });

    await service.startAccount("account-1");
    mock.pushBuyerMessage();
    await flush();
    store.drafts.set("draft-1", makeDraft("您好，有货。"));

    await expect(service.sendDraft("draft-1")).resolves.toEqual({ ok: true });

    const body = JSON.parse(mock.requests.send_message![0]!.body) as { data: { message: { to: { uid: string }; content: string } } };
    expect(body.data.message.to.uid).toBe("buyer-1");
    expect(body.data.message.content).toBe("您好，有货。");
    expect(store.drafts.get("draft-1")).toMatchObject({ state: "sent" });
    expect(store.messages.get("msg-1")).toMatchObject({ state: "sent" });
  });

  it("2.3 surfaces send failure and leaves the message unsent", async () => {
    const store = createStore();
    const mock = createMockPdd({ sendError: "session expired" });
    const service = new PddService({
      ...store.callbacks,
      WebSocketCtor: mock.WebSocketCtor,
      fetchImpl: mock.fetchImpl,
    });

    await service.startAccount("account-1");
    mock.pushBuyerMessage();
    await flush();

    await expect(service.sendMessage("msg-1", "您好")).resolves.toEqual({ ok: false, error: "session expired" });
    expect(store.messages.get("msg-1")).toMatchObject({ state: "failed", error: "session expired" });
  });

  it("2.3 surfaces send failure for a draft and leaves the draft unsent", async () => {
    const store = createStore();
    const mock = createMockPdd({ sendError: "session expired" });
    const service = new PddService({
      ...store.callbacks,
      WebSocketCtor: mock.WebSocketCtor,
      fetchImpl: mock.fetchImpl,
    });

    await service.startAccount("account-1");
    mock.pushBuyerMessage();
    await flush();
    store.drafts.set("draft-1", makeDraft("您好"));

    await expect(service.sendDraft("draft-1")).resolves.toEqual({ ok: false, error: "session expired" });
    expect(store.drafts.get("draft-1")).toMatchObject({ state: "failed" });
    expect(store.messages.get("msg-1")).toMatchObject({ state: "failed" });
  });
});

function makeDraft(text: string): ReplyDraftRecord {
  return {
    id: "draft-1",
    messageId: "msg-1",
    accountId: "account-1",
    shopId: "shop-1",
    mode: "human_review",
    state: "draft_ready",
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z",
    reply: {
      text,
      action: "review",
      answerable: true,
      sources: [],
      createdAt: "2026-05-29T00:00:00.000Z",
    },
  };
}

// handleSocketMessage runs async off onmessage; let the microtask queue drain.
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
