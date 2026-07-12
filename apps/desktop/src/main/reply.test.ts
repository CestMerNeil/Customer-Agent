import { describe, expect, it, vi } from "vitest";
import { generateAndPersistReply, runInboundHandlerChain } from "./reply.js";
import type { AppSettings, GovernedKnowledgeRecord, MessageRecord, ReplyDraftRecord } from "@customer-agent/core";

describe("generateAndPersistReply", () => {
  it("returns an auto-send reply with chat only when knowledge search is unavailable", async () => {
    const savedDrafts: ReplyDraftRecord[] = [];
    const appendLog = vi.fn();
    const settings: AppSettings = {
      businessHours: { start: "08:00", end: "23:00" },
      knowledge: { topK: 4 },
    };

    const result = await generateAndPersistReply(
      {
        mode: "automatic",
        context: {
          id: "message-1",
          channel: "pinduoduo",
          type: "text",
          content: "这件有 L 码吗？",
          shopId: "shop-a",
          accountId: "account-a",
          buyerId: "buyer-a",
          receivedAt: "2026-06-24T00:00:00.000Z",
          raw: {},
        },
      },
      {
        store: {
          getSettings: async () => settings,
          saveDraft: async (draft) => {
            savedDrafts.push(draft);
            return draft;
          },
          appendLog,
          listGovernedKnowledge: async () => [],
          getConversationMemory: async () => undefined,
          saveConversationMemory: async (memory) => ({ id: "memory-1", updatedAt: "2026-06-24T00:00:00.000Z", ...memory }),
          appendAgentAudit: async (audit) => ({ id: "audit-1", createdAt: "2026-06-24T00:00:00.000Z", ...audit }),
        },
        createInferenceClient: async () => nativeAgentClient([{ outputText: "您好，这款可以帮您确认尺码。", toolCalls: [] }]),
      },
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.reply.text).toBe("您好，这款可以帮您确认尺码。");
    expect(savedDrafts).toHaveLength(0);
    expect(appendLog).not.toHaveBeenCalled();
  });

  it("stores a meta-note instead of the verbatim reply in conversation memory", async () => {
    let savedSummary = "";
    const replyText = "您好，这款可以帮您确认尺码。";

    await generateAndPersistReply(
      {
        mode: "automatic",
        context: {
          id: "message-1",
          channel: "pinduoduo",
          type: "text",
          content: "这件有 L 码吗？",
          shopId: "shop-a",
          accountId: "account-a",
          buyerId: "buyer-a",
          receivedAt: "2026-06-24T00:00:00.000Z",
          raw: {},
        },
      },
      {
        store: {
          getSettings: async () => ({
            businessHours: { start: "08:00", end: "23:00" },
            knowledge: { topK: 4 },
          }),
          saveDraft: async (draft) => draft,
          appendLog: vi.fn(),
          listGovernedKnowledge: async () => [],
          getConversationMemory: async () => undefined,
          saveConversationMemory: async (memory) => {
            savedSummary = memory.summary;
            return { id: "memory-1", updatedAt: "2026-06-24T00:00:00.000Z", ...memory };
          },
          appendAgentAudit: async (audit) => ({ id: "audit-1", createdAt: "2026-06-24T00:00:00.000Z", ...audit }),
        },
        createInferenceClient: async () => nativeAgentClient([{ outputText: replyText, toolCalls: [] }]),
      },
    );

    // The verbatim reply must never re-enter memory — that is what makes a small
    // model parrot its own last reply into a loop.
    expect(savedSummary).not.toContain(replyText);
    expect(savedSummary).toContain("买家：这件有 L 码吗？");
    expect(savedSummary).toContain("客服处理：");
  });

  it("returns an error outcome when the LLM is unavailable in auto-send mode", async () => {
    const savedDrafts: ReplyDraftRecord[] = [];
    const result = await generateAndPersistReply(
      {
        mode: "automatic",
        context: buildMessage({ content: "你好" }),
      },
      {
        store: {
          getSettings: async () => ({
            businessHours: { start: "08:00", end: "23:00" },
            knowledge: { topK: 4 },
          }),
          saveDraft: async (draft) => {
            savedDrafts.push(draft);
            return draft;
          },
          appendLog: vi.fn(),
          listGovernedKnowledge: async () => [],
          getConversationMemory: async () => undefined,
          saveConversationMemory: async (memory) => ({ id: "memory-1", updatedAt: "2026-06-24T00:00:00.000Z", ...memory }),
          appendAgentAudit: async (audit) => ({ id: "audit-1", createdAt: "2026-06-24T00:00:00.000Z", ...audit }),
        },
        createInferenceClient: async () => {
          throw new Error("dependency_llm_circuit_open");
        },
      },
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("dependency_llm_circuit_open");
    expect(savedDrafts).toHaveLength(0);
  });

  it("uses only eligible governed shop-scoped knowledge for Agent prompts", async () => {
    const prompts: string[] = [];
    const savedDrafts: ReplyDraftRecord[] = [];
    const audits: unknown[] = [];

    const result = await generateAndPersistReply(
      {
        mode: "automatic",
        context: {
          id: "message-1",
          channel: "pinduoduo",
          type: "text",
          content: "围巾有库存吗？",
          shopId: "shop-a",
          accountId: "account-a",
          buyerId: "buyer-a",
          receivedAt: "2026-06-24T00:00:00.000Z",
          raw: {},
        },
      },
      {
        store: {
          getSettings: async () => ({
            businessHours: { start: "08:00", end: "23:00" },
            knowledge: { topK: 4 },
          }),
          saveDraft: async (draft) => {
            savedDrafts.push(draft);
            return draft;
          },
          appendLog: vi.fn(),
          getConversationMemory: async () => ({
            id: "memory-1",
            shopId: "shop-a",
            accountId: "account-a",
            buyerId: "buyer-a",
            summary: "买家之前问过围巾。",
            messageCount: 2,
            updatedAt: "2026-06-24T00:00:00.000Z",
          }),
          saveConversationMemory: async (memory) => ({ id: "memory-1", updatedAt: "2026-06-24T00:00:00.000Z", ...memory }),
          appendAgentAudit: async (audit) => {
            audits.push(audit);
            return { id: `audit-${audits.length}`, createdAt: "2026-06-24T00:00:00.000Z", ...audit };
          },
          listGovernedKnowledge: async (options) => {
            expect(options).toMatchObject({ shopId: "shop-a", eligibleOnly: true });
            return [
              governedKnowledge({ id: "eligible", content: "围巾库存充足，可当天发货。", reviewState: "reviewed", enabled: true }),
              governedKnowledge({ id: "draft", content: "草稿知识不应进入 prompt。", reviewState: "draft", enabled: true }),
              governedKnowledge({ id: "disabled", content: "禁用知识不应进入 prompt。", reviewState: "reviewed", enabled: false }),
            ];
          },
        },
        createInferenceClient: async () => nativeAgentClient([
          { responseId: "resp-1", toolCalls: [{ callId: "call-1", name: "get_shop_products", arguments: {} }] },
          { responseId: "resp-2", outputText: "您好，这款目前有库存。", toolCalls: [] },
        ], prompts),
      },
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.reply.answerable).toBe(true);
    expect(savedDrafts).toHaveLength(0);
    expect(prompts[0]).toContain("会话记忆：买家之前问过围巾。");
    expect(prompts[1]).toContain("围巾库存充足");
    expect(prompts[1]).not.toContain("草稿知识");
    expect(prompts[1]).not.toContain("禁用知识");
    expect(audits).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: "tool_call", toolName: "get_shop_products" }),
      expect.objectContaining({ eventType: "tool_result", toolName: "get_shop_products", ok: true }),
      expect.objectContaining({ eventType: "final" }),
    ]));
  });

  it("returns reviewed products for broad recommendation requests instead of claiming the shop is empty", async () => {
    const prompts: string[] = [];

    const result = await generateAndPersistReply(
      {
        mode: "automatic",
        context: {
          id: "message-1",
          channel: "pinduoduo",
          type: "text",
          content: "我想买点东西",
          shopId: "shop-a",
          accountId: "account-a",
          buyerId: "buyer-a",
          receivedAt: "2026-06-26T04:00:00.000Z",
          raw: {},
        },
      },
      {
        store: {
          getSettings: async () => ({
            businessHours: { start: "08:00", end: "23:00" },
            knowledge: { topK: 4 },
          }),
          saveDraft: async (draft) => draft,
          appendLog: vi.fn(),
          getConversationMemory: async () => undefined,
          saveConversationMemory: async (memory) => ({ id: "memory-1", updatedAt: "2026-06-26T04:00:00.000Z", ...memory }),
          appendAgentAudit: async (audit) => ({ id: "audit-1", createdAt: "2026-06-26T04:00:00.000Z", ...audit }),
          listGovernedKnowledge: async () => [
            governedKnowledge({
              citationId: "product:shop-a:788320987478",
              sourceId: "788320987478",
              title: "大疆T30后摄像头改装调节支架",
              content: "商品ID：788320987478\n价格：48.60-52.50 元\n库存：29999988",
              tags: ["大疆", "支架"],
              reviewState: "reviewed",
              enabled: true,
            }),
          ],
        },
        createInferenceClient: async () => nativeAgentClient([
          { responseId: "resp-1", toolCalls: [{ callId: "call-1", name: "get_shop_products", arguments: {} }] },
          { responseId: "resp-2", outputText: "您好，可以看这款大疆T30后摄像头改装调节支架。", toolCalls: [] },
        ], prompts),
      },
    );

    expect(result).toMatchObject({ ok: true, reply: { text: "您好，可以看这款大疆T30后摄像头改装调节支架。" } });
    expect(prompts[1]).toContain("788320987478");
    expect(prompts[1]).not.toContain("当前店铺没有可用的已审核商品知识");
  });

  it("uses the goods card goods_id when product knowledge input is omitted", async () => {
    const prompts: string[] = [];

    const result = await generateAndPersistReply(
      {
        mode: "automatic",
        context: {
          id: "message-1",
          channel: "pinduoduo",
          type: "goods_inquiry",
          content: "https://mobile.yangkeduo.com/goods.html?goods_id=788320987478",
          shopId: "shop-a",
          accountId: "account-a",
          buyerId: "buyer-a",
          receivedAt: "2026-06-26T04:00:00.000Z",
          goods: { goodsId: "788320987478", goodsName: "大疆T30后摄像头改装调节支架" },
          raw: {},
        },
      },
      {
        store: {
          getSettings: async () => ({
            businessHours: { start: "08:00", end: "23:00" },
            knowledge: { topK: 4 },
          }),
          saveDraft: async (draft) => draft,
          appendLog: vi.fn(),
          getConversationMemory: async () => undefined,
          saveConversationMemory: async (memory) => ({ id: "memory-1", updatedAt: "2026-06-26T04:00:00.000Z", ...memory }),
          appendAgentAudit: async (audit) => ({ id: "audit-1", createdAt: "2026-06-26T04:00:00.000Z", ...audit }),
          listGovernedKnowledge: async (options) => {
            expect(options).toMatchObject({ citationId: "product:shop-a:788320987478" });
            return [
              governedKnowledge({
                citationId: "product:shop-a:788320987478",
                sourceId: "788320987478",
                content: "商品ID：788320987478\n价格：48.60-52.50 元",
              }),
            ];
          },
        },
        createInferenceClient: async () => nativeAgentClient([
          { responseId: "resp-1", toolCalls: [{ callId: "call-1", name: "get_product_knowledge", arguments: {} }] },
          { responseId: "resp-2", outputText: "您好，这是大疆T30后摄像头改装调节支架。", toolCalls: [] },
        ], prompts),
      },
    );

    expect(result).toMatchObject({ ok: true, reply: { text: "您好，这是大疆T30后摄像头改装调节支架。" } });
    expect(prompts[1]).toContain("788320987478");
  });

  it("prefers the Responses API tool loop when the inference client supports it", async () => {
    const savedDrafts: ReplyDraftRecord[] = [];
    const responseRequests: unknown[] = [];
    const chat = vi.fn();
    const audits: unknown[] = [];

    const result = await generateAndPersistReply(
      {
        mode: "automatic",
        context: {
          id: "message-1",
          channel: "pinduoduo",
          type: "text",
          content: "围巾能退货吗？",
          shopId: "shop-a",
          accountId: "account-a",
          buyerId: "buyer-a",
          receivedAt: "2026-06-24T00:00:00.000Z",
          raw: {},
        },
      },
      {
        store: {
          getSettings: async () => ({
            businessHours: { start: "08:00", end: "23:00" },
            knowledge: { topK: 4 },
          }),
          saveDraft: async (draft) => {
            savedDrafts.push(draft);
            return draft;
          },
          appendLog: vi.fn(),
          getConversationMemory: async () => undefined,
          saveConversationMemory: async (memory) => ({ id: "memory-1", updatedAt: "2026-06-24T00:00:00.000Z", ...memory }),
          appendAgentAudit: async (audit) => {
            audits.push(audit);
            return { id: `audit-${audits.length}`, createdAt: "2026-06-24T00:00:00.000Z", ...audit };
          },
          listGovernedKnowledge: async (options) => {
            expect(options).toMatchObject({ kind: "customer_service", shopId: "shop-a", eligibleOnly: true });
            return [governedKnowledge({
              kind: "customer_service",
              citationId: "customer_service:shop-a:return",
              title: "退货政策",
              content: "围巾支持签收七天内退货。",
              tags: ["退货"],
            })];
          },
        },
        createInferenceClient: async () => ({
          chat,
          respond: async (request) => {
            responseRequests.push(request);
            if (responseRequests.length === 1) {
              return {
                responseId: "resp-1",
                toolCalls: [{
                  callId: "call-1",
                  name: "list_customer_service_knowledge",
                  arguments: { page: 1 },
                }],
              };
            }
            if (responseRequests.length === 2) {
              return {
                responseId: "resp-2",
                toolCalls: [{
                  callId: "call-2",
                  name: "get_customer_service_knowledge",
                  arguments: { citation_ids: ["customer_service:shop-a:return"] },
                }],
              };
            }
            return {
              responseId: "resp-3",
              outputText: "您好，围巾支持签收七天内退货。",
              toolCalls: [],
            };
          },
        }),
      },
    );

    expect(result).toMatchObject({ ok: true, reply: { text: "您好，围巾支持签收七天内退货。" } });
    expect(savedDrafts).toHaveLength(0);
    expect(chat).not.toHaveBeenCalled();
    expect(responseRequests[0]).toMatchObject({
      tools: expect.arrayContaining([
        expect.objectContaining({ type: "function", name: "list_customer_service_knowledge" }),
        expect.objectContaining({ type: "function", name: "get_customer_service_knowledge" }),
      ]),
    });
    expect(responseRequests[1]).toMatchObject({
      previousResponseId: "resp-1",
      input: [expect.objectContaining({ type: "function_call_output", call_id: "call-1" })],
    });
    expect(JSON.stringify(responseRequests[1])).toContain("citation_id=customer_service:shop-a:return");
    expect(JSON.stringify(responseRequests[1])).not.toContain("围巾支持签收七天内退货");
    expect(JSON.stringify(responseRequests[2])).toContain("围巾支持签收七天内退货");
    expect(audits).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: "tool_call", toolName: "list_customer_service_knowledge" }),
      expect.objectContaining({ eventType: "tool_result", toolName: "list_customer_service_knowledge", ok: true }),
      expect.objectContaining({ eventType: "tool_call", toolName: "get_customer_service_knowledge" }),
      expect.objectContaining({ eventType: "tool_result", toolName: "get_customer_service_knowledge", ok: true }),
      expect.objectContaining({ eventType: "final" }),
    ]));
  });

  it("rejects AI-selected customer knowledge ids outside the eligible current-shop catalog", async () => {
    const audits: unknown[] = [];
    const result = await generateAndPersistReply(
      {
        mode: "automatic",
        context: {
          id: "message-1", channel: "pinduoduo", type: "text", content: "能退货吗？",
          shopId: "shop-a", accountId: "account-a", buyerId: "buyer-a",
          receivedAt: "2026-06-24T00:00:00.000Z", raw: {},
        },
      },
      {
        store: {
          getSettings: async () => ({ businessHours: { start: "08:00", end: "23:00" }, knowledge: { topK: 4 } }),
          saveDraft: async (draft) => draft,
          appendLog: vi.fn(),
          listGovernedKnowledge: async () => [governedKnowledge({
            kind: "customer_service",
            citationId: "customer_service:shop-a:return",
            title: "退货政策",
            content: "七天内可退货。",
          })],
          getConversationMemory: async () => undefined,
          saveConversationMemory: async (memory) => ({ id: "memory-1", updatedAt: "2026-06-24T00:00:00.000Z", ...memory }),
          appendAgentAudit: async (audit) => {
            audits.push(audit);
            return { id: `audit-${audits.length}`, createdAt: "2026-06-24T00:00:00.000Z", ...audit };
          },
        },
        createInferenceClient: async () => nativeAgentClient([
          { responseId: "resp-1", toolCalls: [{ callId: "call-1", name: "get_customer_service_knowledge", arguments: { citation_ids: ["customer_service:shop-b:return"] } }] },
          { responseId: "resp-2", outputText: "抱歉，当前知识不足，请联系人工客服。", toolCalls: [] },
        ]),
      },
    );

    expect(result).toMatchObject({ ok: true, reply: { sources: [] } });
    expect(audits).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: "tool_result", toolName: "get_customer_service_knowledge", ok: false }),
    ]));
  });

  it("blocks goods-card sends when the goods id is not eligible for the current shop", async () => {
    const sendGoodsLink = vi.fn(async () => ({ ok: true, content: "sent" }));
    const audits: unknown[] = [];

    const result = await generateAndPersistReply(
      {
        mode: "automatic",
        context: {
          id: "message-1",
          channel: "pinduoduo",
          type: "text",
          content: "发一下这个商品链接",
          shopId: "shop-a",
          accountId: "account-a",
          buyerId: "buyer-a",
          receivedAt: "2026-06-24T00:00:00.000Z",
          raw: {},
        },
      },
      {
        store: {
          getSettings: async () => ({
            businessHours: { start: "08:00", end: "23:00" },
            knowledge: { topK: 4 },
          }),
          saveDraft: async (draft) => draft,
          appendLog: vi.fn(),
          listGovernedKnowledge: async (options) => {
            expect(options).toMatchObject({
              kind: "product",
              shopId: "shop-a",
              citationId: "product:shop-a:cross-shop-goods",
              eligibleOnly: true,
            });
            return [];
          },
          getConversationMemory: async () => undefined,
          saveConversationMemory: async (memory) => ({ id: "memory-1", updatedAt: "2026-06-24T00:00:00.000Z", ...memory }),
          appendAgentAudit: async (audit) => {
            audits.push(audit);
            return { id: `audit-${audits.length}`, createdAt: "2026-06-24T00:00:00.000Z", ...audit };
          },
        },
        createInferenceClient: async () => nativeAgentClient([
          { responseId: "resp-1", toolCalls: [{ callId: "call-1", name: "send_goods_link", arguments: { goods_id: "cross-shop-goods" } }] },
          { responseId: "resp-2", outputText: "请稍等，我帮您确认商品链接。", toolCalls: [] },
        ]),
        sendGoodsLink,
      },
    );

    expect(result.ok).toBe(true);
    expect(sendGoodsLink).not.toHaveBeenCalled();
    expect(audits).toEqual(expect.arrayContaining([
      expect.objectContaining({
        eventType: "tool_result",
        toolName: "send_goods_link",
        ok: false,
        summary: expect.stringContaining("cross_shop_goods_blocked"),
      }),
    ]));
  });

  it("compresses long conversation memory with the real chat client before saving", async () => {
    const saved = vi.fn(async (memory) => ({ id: "memory-1", updatedAt: "2026-06-24T00:00:00.000Z", ...memory }));
    const prompts: string[] = [];

    const result = await generateAndPersistReply(
      {
        mode: "automatic",
        context: {
          id: "message-1",
          channel: "pinduoduo",
          type: "text",
          content: "还有库存吗？",
          shopId: "shop-a",
          accountId: "account-a",
          buyerId: "buyer-a",
          receivedAt: "2026-06-24T00:00:00.000Z",
          raw: {},
        },
      },
      {
        store: {
          getSettings: async () => ({
            businessHours: { start: "08:00", end: "23:00" },
            knowledge: { topK: 4 },
          }),
          saveDraft: async (draft) => draft,
          appendLog: vi.fn(),
          listGovernedKnowledge: async () => [],
          getConversationMemory: async () => ({
            id: "memory-1",
            shopId: "shop-a",
            accountId: "account-a",
            buyerId: "buyer-a",
            summary: "旧记忆".repeat(700),
            messageCount: 8,
            updatedAt: "2026-06-24T00:00:00.000Z",
          }),
          saveConversationMemory: saved,
          appendAgentAudit: async (audit) => ({ id: "audit-1", createdAt: "2026-06-24T00:00:00.000Z", ...audit }),
        },
        createInferenceClient: async () => nativeAgentClient(
          [{ responseId: "resp-1", outputText: "有库存。", toolCalls: [] }],
          prompts,
          ["压缩后的记忆"],
        ),
      },
    );

    expect(result.ok).toBe(true);
    expect(prompts[1]).toContain("压缩成后续回复可用的简洁记忆");
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ summary: "压缩后的记忆", messageCount: 10 }));
  });

  it("runs keyword handoff before AI generation", async () => {
    const appendLog = vi.fn();
    const upsertMessage = vi.fn(async (message: MessageRecord) => message);
    const createInferenceClient = vi.fn();
    const message = buildMessage({ content: "我要转人工处理" });

    const result = await runInboundHandlerChain(
      { context: message },
      {
        store: {
          getSettings: async () => ({
            businessHours: { start: "08:00", end: "23:00" },
            knowledge: { topK: 4 },
            handoff: { keywords: ["转人工"] },
          }),
          saveDraft: async (draft) => draft,
          appendLog,
          listGovernedKnowledge: async () => [],
          getConversationMemory: async () => undefined,
          saveConversationMemory: async (memory) => ({ id: "memory-1", updatedAt: "2026-06-24T00:00:00.000Z", ...memory }),
          appendAgentAudit: async (audit) => ({ id: "audit-1", createdAt: "2026-06-24T00:00:00.000Z", ...audit }),
          upsertMessage,
        },
        createInferenceClient,
      },
    );

    expect(result).toMatchObject({ ok: true, handler: "keyword_handoff", action: "escalated" });
    expect(createInferenceClient).not.toHaveBeenCalled();
    expect(upsertMessage).toHaveBeenCalledWith(expect.objectContaining({ id: message.id, state: "escalated" }));
  });

  it("matches shop-scoped keyword handoff only for the current shop", async () => {
    const appendLog = vi.fn();
    const upsertMessage = vi.fn(async (message: MessageRecord) => message);
    const createInferenceClient = vi.fn();
    const message = buildMessage({ shopId: "shop-a", content: "我要人工处理" });

    const result = await runInboundHandlerChain(
      { context: message },
      {
        store: {
          getSettings: async () => ({
            businessHours: { start: "08:00", end: "23:00" },
            knowledge: { topK: 4 },
            handoff: { keywords: ["shop:shop-b:人工", "shop:shop-a:人工"] },
          }),
          saveDraft: async (draft) => draft,
          appendLog,
          listGovernedKnowledge: async () => [],
          getConversationMemory: async () => undefined,
          saveConversationMemory: async (memory) => ({ id: "memory-1", updatedAt: "2026-06-24T00:00:00.000Z", ...memory }),
          appendAgentAudit: async (audit) => ({ id: "audit-1", createdAt: "2026-06-24T00:00:00.000Z", ...audit }),
          upsertMessage,
        },
        createInferenceClient,
      },
    );

    expect(result).toMatchObject({ ok: true, handler: "keyword_handoff", action: "escalated" });
    expect(appendLog).toHaveBeenCalledWith("info", expect.stringContaining("触发关键词：人工"));
    expect(createInferenceClient).not.toHaveBeenCalled();
  });

  it("uses reference default handoff keywords when no keywords are configured", async () => {
    const upsertMessage = vi.fn(async (message: MessageRecord) => message);
    const saveDraft = vi.fn(async (draft: ReplyDraftRecord) => draft);
    const createInferenceClient = vi.fn();
    const message = buildMessage({ content: "我要转人工" });

    const result = await runInboundHandlerChain(
      { context: message },
      {
        store: {
          getSettings: async () => ({
            businessHours: { start: "08:00", end: "23:00" },
            knowledge: { topK: 4 },
            handoff: { keywords: [], intentRules: [] },
          }),
          saveDraft,
          appendLog: vi.fn(),
          listGovernedKnowledge: async () => [],
          getConversationMemory: async () => undefined,
          saveConversationMemory: async (memory) => ({ id: "memory-1", updatedAt: "2026-06-24T00:00:00.000Z", ...memory }),
          appendAgentAudit: async (audit) => ({ id: "audit-1", createdAt: "2026-06-24T00:00:00.000Z", ...audit }),
          upsertMessage,
        },
        createInferenceClient,
      },
    );

    expect(result).toMatchObject({ ok: true, handler: "keyword_handoff", action: "escalated" });
    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({ state: "escalated", messageId: message.id }));
    expect(createInferenceClient).not.toHaveBeenCalled();
  });

  it("runs configured intent handoff before AI generation", async () => {
    const appendLog = vi.fn();
    const upsertMessage = vi.fn(async (message: MessageRecord) => message);
    const createInferenceClient = vi.fn();
    const message = buildMessage({ content: "我要投诉，这个订单一直没发货" });

    const result = await runInboundHandlerChain(
      { context: message },
      {
        store: {
          getSettings: async () => ({
            businessHours: { start: "08:00", end: "23:00" },
            knowledge: { topK: 4 },
            handoff: {
              keywords: ["转人工"],
              intentRules: [{ id: "complaint", label: "投诉", patterns: ["投诉", "没发货"] }],
            },
          }),
          saveDraft: async (draft) => draft,
          appendLog,
          listGovernedKnowledge: async () => [],
          getConversationMemory: async () => undefined,
          saveConversationMemory: async (memory) => ({ id: "memory-1", updatedAt: "2026-06-24T00:00:00.000Z", ...memory }),
          appendAgentAudit: async (audit) => ({ id: "audit-1", createdAt: "2026-06-24T00:00:00.000Z", ...audit }),
          upsertMessage,
        },
        createInferenceClient,
      },
    );

    expect(result).toMatchObject({ ok: true, handler: "intent_handoff", action: "escalated" });
    expect(createInferenceClient).not.toHaveBeenCalled();
    expect(upsertMessage).toHaveBeenCalledWith(expect.objectContaining({ id: message.id, state: "escalated" }));
  });

  it("replies that humans are offline for an after-hours handoff request instead of transferring", async () => {
    const appendLog = vi.fn();
    const upsertMessage = vi.fn(async (message: MessageRecord) => message);
    const createInferenceClient = vi.fn();
    const sendReply = vi.fn();
    const transferConversation = vi.fn();
    const message = buildMessage({
      content: "我要转人工",
      receivedAt: "2026-06-24T22:30:00.000+08:00",
    });

    const result = await runInboundHandlerChain(
      { context: message },
      {
        store: {
          getSettings: async () => ({
            businessHours: { start: "08:00", end: "21:00" },
            knowledge: { topK: 4 },
            handoff: { keywords: ["转人工"] },
          }),
          saveDraft: async (draft) => draft,
          appendLog,
          listGovernedKnowledge: async () => [],
          getConversationMemory: async () => undefined,
          saveConversationMemory: async (memory) => ({ id: "memory-1", updatedAt: "2026-06-24T00:00:00.000Z", ...memory }),
          appendAgentAudit: async (audit) => ({ id: "audit-1", createdAt: "2026-06-24T00:00:00.000Z", ...audit }),
          upsertMessage,
        },
        createInferenceClient,
        sendReply,
        transferConversation,
      },
    );

    expect(result).toMatchObject({ ok: true, handler: "keyword_handoff", action: "escalated" });
    expect(createInferenceClient).not.toHaveBeenCalled();
    expect(transferConversation).not.toHaveBeenCalled();
    expect(sendReply).toHaveBeenCalledWith(message, expect.stringContaining("人工客服当前不在线"));
    expect(upsertMessage).toHaveBeenCalledWith(expect.objectContaining({ id: message.id, state: "escalated" }));
    expect(appendLog).toHaveBeenCalledWith("info", expect.stringContaining("营业时间外"));
  });

  it("lets the model answer low-information messages instead of using deterministic shortcuts", async () => {
    const sendReply = vi.fn();
    const prompts: string[] = [];
    const message = buildMessage({ content: "啊？" });

    const result = await runInboundHandlerChain(
      { context: message },
      {
        store: {
          getSettings: async () => ({
            businessHours: { start: "08:00", end: "23:00" },
            knowledge: { topK: 4 },
            handoff: { keywords: ["转人工"] },
          }),
          saveDraft: async (draft) => draft,
          appendLog: vi.fn(),
          listGovernedKnowledge: async () => [],
          getConversationMemory: async () => undefined,
          saveConversationMemory: async (memory) => ({ id: "memory-1", updatedAt: "2026-06-24T00:00:00.000Z", ...memory }),
          appendAgentAudit: async (audit) => ({ id: "audit-1", createdAt: "2026-06-24T00:00:00.000Z", ...audit }),
          upsertMessage: async (record: MessageRecord) => record,
        },
        createInferenceClient: async () => nativeAgentClient(
          [{ responseId: "resp-1", outputText: "您好，我在的。请问您想咨询哪款商品或订单问题？", toolCalls: [] }],
          prompts,
        ),
        sendReply,
      },
    );

    expect(result).toMatchObject({ ok: true, handler: "ai_agent", action: "send" });
    expect(sendReply).toHaveBeenCalledWith(message, "您好，我在的。请问您想咨询哪款商品或订单问题？");
    expect(prompts[0]).toContain("寒暄、低信息追问或买家不满");
  });

  it("runs immediate system handler before handoff and AI", async () => {
    const appendLog = vi.fn();
    const upsertMessage = vi.fn(async (message: MessageRecord) => message);
    const createInferenceClient = vi.fn();
    const message = buildMessage({ type: "system_status", content: "system event" });

    const result = await runInboundHandlerChain(
      { context: message },
      {
        store: {
          getSettings: async () => ({
            businessHours: { start: "08:00", end: "23:00" },
            knowledge: { topK: 4 },
            handoff: {
              keywords: ["system"],
              intentRules: [{ id: "system", label: "系统", patterns: ["system"] }],
            },
          }),
          saveDraft: async (draft) => draft,
          appendLog,
          listGovernedKnowledge: async () => [],
          getConversationMemory: async () => undefined,
          saveConversationMemory: async (memory) => ({ id: "memory-1", updatedAt: "2026-06-24T00:00:00.000Z", ...memory }),
          appendAgentAudit: async (audit) => ({ id: "audit-1", createdAt: "2026-06-24T00:00:00.000Z", ...audit }),
          upsertMessage,
        },
        createInferenceClient,
      },
    );

    expect(result).toMatchObject({ ok: true, handler: "immediate_system", action: "ignored" });
    expect(createInferenceClient).not.toHaveBeenCalled();
    expect(upsertMessage).toHaveBeenCalledWith(expect.objectContaining({ id: message.id, state: "ignored" }));
  });

  it("runs AI handler when no higher-priority handler claims the message", async () => {
    const savedDrafts: ReplyDraftRecord[] = [];
    const sendReply = vi.fn();

    const result = await runInboundHandlerChain(
      { context: buildMessage({ content: "这件有库存吗" }) },
      {
        store: {
          getSettings: async () => ({
            businessHours: { start: "08:00", end: "23:00" },
            knowledge: { topK: 4 },
            handoff: { keywords: ["转人工"] },
          }),
          saveDraft: async (draft) => {
            savedDrafts.push(draft);
            return draft;
          },
          appendLog: vi.fn(),
          listGovernedKnowledge: async () => [],
          getConversationMemory: async () => undefined,
          saveConversationMemory: async (memory) => ({ id: "memory-1", updatedAt: "2026-06-24T00:00:00.000Z", ...memory }),
          appendAgentAudit: async (audit) => ({ id: "audit-1", createdAt: "2026-06-24T00:00:00.000Z", ...audit }),
          upsertMessage: async (message: MessageRecord) => message,
        },
        createInferenceClient: async () => nativeAgentClient([{ responseId: "resp-1", outputText: "您好，我帮您确认。", toolCalls: [] }]),
        sendReply,
      },
    );

    expect(result).toMatchObject({ ok: true, handler: "ai_agent", action: "send" });
    expect(savedDrafts).toHaveLength(0);
    expect(sendReply).toHaveBeenCalledWith(expect.objectContaining({ content: "这件有库存吗" }), "您好，我帮您确认。");
  });
});

function nativeAgentClient(
  responses: Array<{ responseId?: string; outputText?: string; toolCalls: Array<{ callId: string; name: string; arguments: Record<string, unknown> }> }>,
  capturedPrompts: string[] = [],
  chatResponses: string[] = [],
) {
  return {
    chat: async (prompt: string) => {
      capturedPrompts.push(prompt);
      return chatResponses.shift() ?? "";
    },
    respond: async (request: { instructions: string; input: unknown }) => {
      capturedPrompts.push(`${request.instructions}\n${JSON.stringify(request.input)}`);
      const response = responses.shift();
      if (!response) {
        throw new Error("No native Agent response configured");
      }
      return response;
    },
  };
}

function buildMessage(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: "message-1",
    channel: "pinduoduo",
    type: "text",
    content: "这件有 L 码吗？",
    shopId: "shop-a",
    accountId: "account-a",
    buyerId: "buyer-a",
    receivedAt: "2026-06-24T00:00:00.000Z",
    state: "received",
    updatedAt: "2026-06-24T00:00:00.000Z",
    raw: {},
    ...overrides,
  };
}

function governedKnowledge(overrides: Partial<GovernedKnowledgeRecord> = {}): GovernedKnowledgeRecord {
  return {
    id: "knowledge-1",
    citationId: "product:shop-a:100001",
    kind: "product",
    shopId: "shop-a",
    title: "围巾",
    content: "围巾有库存。",
    tags: ["围巾"],
    sourceType: "pdd_product",
    sourceId: "100001",
    version: 1,
    enabled: true,
    reviewState: "reviewed",
    stale: false,
    conflict: false,
    createdAt: "2026-06-24T00:00:00.000Z",
    updatedAt: "2026-06-24T00:00:00.000Z",
    ...overrides,
  };
}
