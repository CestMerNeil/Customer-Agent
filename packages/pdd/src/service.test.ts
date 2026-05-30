import type { AccountRecord, MessageRecord, ReplyDraftRecord } from "@customer-agent/core";
import { describe, expect, it, vi } from "vitest";
import { PddService } from "./service.js";

describe("PddService send flow", () => {
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

  const message: MessageRecord = {
    id: "msg-1",
    channel: "pinduoduo",
    type: "text",
    content: "有货吗？",
    shopId: "shop-1",
    accountId: "account-1",
    buyerId: "buyer-1",
    receivedAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z",
    state: "received",
  };

  it("marks a message sent when PDD text send succeeds", async () => {
    const savedMessages: Array<Omit<MessageRecord, "updatedAt">> = [];
    const service = new PddService({
      getAccount: async () => account,
      getMessage: async () => message,
      saveMessage: async (saved) => {
        savedMessages.push(saved);
        return { ...saved, updatedAt: "now" };
      },
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, result: {} }),
      }),
    });

    await expect(service.sendMessage("msg-1", "您好，有货。")).resolves.toEqual({ ok: true });
    expect(savedMessages.at(-1)).toMatchObject({
      id: "msg-1",
      state: "sent",
      replyText: "您好，有货。",
    });
  });

  it("preserves unsent state details when PDD text send fails", async () => {
    const savedMessages: Array<Omit<MessageRecord, "updatedAt">> = [];
    const service = new PddService({
      getAccount: async () => account,
      getMessage: async () => message,
      saveMessage: async (saved) => {
        savedMessages.push(saved);
        return { ...saved, updatedAt: "now" };
      },
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: false, errorMsg: "session expired" }),
      }),
    });

    await expect(service.sendMessage("msg-1", "您好")).resolves.toEqual({ ok: false, error: "session expired" });
    expect(savedMessages.at(-1)).toMatchObject({
      id: "msg-1",
      state: "failed",
      error: "session expired",
    });
  });

  it("sends a draft through the source message and marks draft sent", async () => {
    const draft: ReplyDraftRecord = {
      id: "draft-1",
      messageId: "msg-1",
      accountId: "account-1",
      shopId: "shop-1",
      mode: "human_review",
      state: "draft_ready",
      createdAt: "2026-05-29T00:00:00.000Z",
      updatedAt: "2026-05-29T00:00:00.000Z",
      reply: {
        text: "您好，有货。",
        action: "review",
        answerable: true,
        sources: [],
        createdAt: "2026-05-29T00:00:00.000Z",
      },
    };
    const savedDrafts: ReplyDraftRecord[] = [];
    const service = new PddService({
      getAccount: async () => account,
      getMessage: async () => message,
      getDraft: async () => draft,
      saveMessage: async (saved) => ({ ...saved, updatedAt: "now" }),
      saveDraft: async (saved) => {
        savedDrafts.push(saved);
        return saved;
      },
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, result: {} }),
      }),
    });

    await expect(service.sendDraft("draft-1")).resolves.toEqual({ ok: true });
    expect(savedDrafts.at(-1)).toMatchObject({ id: "draft-1", state: "sent" });
  });
});
