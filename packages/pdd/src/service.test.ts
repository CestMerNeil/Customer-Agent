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

  it("ignores a draft and marks both draft and source message as ignored", async () => {
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
    const savedMessages: Array<Omit<MessageRecord, "updatedAt">> = [];
    const savedDrafts: ReplyDraftRecord[] = [];
    const service = new PddService({
      getAccount: async () => account,
      getMessage: async () => message,
      getDraft: async () => draft,
      saveMessage: async (saved) => {
        savedMessages.push(saved);
        return { ...saved, updatedAt: "now" };
      },
      saveDraft: async (saved) => {
        savedDrafts.push(saved);
        return saved;
      },
    });

    await expect(service.ignoreDraft("draft-1")).resolves.toEqual({ ok: true });
    expect(savedMessages.at(-1)).toMatchObject({ id: "msg-1", state: "ignored" });
    expect(savedDrafts.at(-1)).toMatchObject({ id: "draft-1", state: "ignored" });
  });

  it("escalates a draft and records an operational log", async () => {
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
    const savedMessages: Array<Omit<MessageRecord, "updatedAt">> = [];
    const savedDrafts: ReplyDraftRecord[] = [];
    const logs: string[] = [];
    const service = new PddService({
      getAccount: async () => account,
      getMessage: async () => message,
      getDraft: async () => draft,
      saveMessage: async (saved) => {
        savedMessages.push(saved);
        return { ...saved, updatedAt: "now" };
      },
      saveDraft: async (saved) => {
        savedDrafts.push(saved);
        return saved;
      },
      log: async (_level, message) => {
        logs.push(message);
      },
    });

    await expect(service.escalateDraft("draft-1")).resolves.toEqual({ ok: true });
    expect(savedMessages.at(-1)).toMatchObject({ id: "msg-1", state: "escalated" });
    expect(savedDrafts.at(-1)).toMatchObject({ id: "draft-1", state: "escalated" });
    expect(logs.some((entry) => entry.includes("草稿已升级至人工介入"))).toBe(true);
  });

  it("rejects actions when the draft no longer exists", async () => {
    const service = new PddService({
      getDraft: async () => undefined,
    });
    await expect(service.sendDraft("missing-draft")).resolves.toMatchObject({ ok: false });
    await expect(service.ignoreDraft("missing-draft")).resolves.toMatchObject({ ok: false });
    await expect(service.escalateDraft("missing-draft")).resolves.toMatchObject({ ok: false });
  });

  it("prevents repeated actions on terminal draft states", async () => {
    const draft: ReplyDraftRecord = {
      id: "draft-1",
      messageId: "msg-1",
      accountId: "account-1",
      shopId: "shop-1",
      mode: "human_review",
      state: "ignored",
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
    const savedMessages: Array<Omit<MessageRecord, "updatedAt">> = [];
    const savedDrafts: ReplyDraftRecord[] = [];
    const service = new PddService({
      getMessage: async () => message,
      getDraft: async () => draft,
      saveMessage: async (saved) => {
        savedMessages.push(saved);
        return { ...saved, updatedAt: "now" };
      },
      saveDraft: async (saved) => {
        savedDrafts.push(saved);
        return saved;
      },
    });

    await expect(service.sendDraft("draft-1")).resolves.toMatchObject({ ok: false });
    await expect(service.ignoreDraft("draft-1")).resolves.toMatchObject({ ok: false });
    expect(savedMessages).toHaveLength(0);
    expect(savedDrafts).toHaveLength(0);
  });

  it("allows send retry when draft was previously failed", async () => {
    const draft: ReplyDraftRecord = {
      id: "draft-1",
      messageId: "msg-1",
      accountId: "account-1",
      shopId: "shop-1",
      mode: "human_review",
      state: "failed",
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
    const failedMessage: MessageRecord = {
      ...message,
      state: "failed",
    };
    const savedDrafts: ReplyDraftRecord[] = [];
    const service = new PddService({
      getAccount: async () => account,
      getMessage: async () => failedMessage,
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

describe("PddService login flow", () => {
  it("uses password login when an existing session check lands on the login page", async () => {
    const clicks: string[] = [];
    const fills: Array<{ selector: string; value: string }> = [];
    const page = {
      goto: vi.fn(),
      click: vi.fn(async (selector: string) => {
        clicks.push(selector);
      }),
      fill: vi.fn(async (selector: string, value: string) => {
        fills.push({ selector, value });
      }),
      waitForFunction: vi.fn(),
      waitForURL: vi.fn().mockRejectedValue(new Error("already on login page")),
      waitForLoadState: vi.fn(),
      waitForTimeout: vi.fn(),
      title: vi.fn().mockResolvedValue("拼多多 商家后台"),
      url: vi.fn()
        .mockReturnValueOnce("https://mms.pinduoduo.com/login/")
        .mockReturnValueOnce("https://mms.pinduoduo.com/login/")
        .mockReturnValue("https://mms.pinduoduo.com/home/"),
    };
    const context = {
      pages: () => [page],
      newPage: vi.fn(),
      cookies: vi.fn().mockResolvedValue([{ name: "PDDAccessToken", value: "token" }]),
      close: vi.fn(),
    };
    const launchPersistentContext = vi.fn().mockResolvedValue(context);
    const savedAccounts: unknown[] = [];
    const service = new PddService({
      dataDir: "/tmp/customer-agent-test",
      playwright: {
        chromium: {
          launchPersistentContext,
        },
      },
      saveAccount: async (account) => {
        savedAccounts.push(account);
        return {
          ...account,
          id: "account-1",
          createdAt: "now",
          updatedAt: "now",
        };
      },
      fetchImpl: vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, result: { id: "user-1", username: "seller", mall_id: "mall-1" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, result: { mallId: "shop-1", mallName: "测试店" } }),
        }),
    });

    await expect(service.login({ channel: "pinduoduo", username: "seller", password: "secret" })).resolves.toMatchObject({ ok: true });
    expect(page.goto).toHaveBeenCalledWith("https://mms.pinduoduo.com/login");
    expect(fills).toContainEqual({ selector: "input[type='text']", value: "seller" });
    expect(fills).toContainEqual({ selector: "input[type='password']", value: "secret" });
    expect(clicks).toContain("button:has-text('登录')");
    expect(page.waitForTimeout).toHaveBeenCalledWith(1_000);
    expect(savedAccounts.at(-1)).toMatchObject({ username: "seller", shopId: "shop-1", userId: "user-1" });
  });
});
