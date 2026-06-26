import { describe, expect, it, vi } from "vitest";
import { ResponsesAgentWorkflow } from "./responses-workflow.js";

describe("ResponsesAgentWorkflow", () => {
  it("runs native response tool calls and continues with function outputs", async () => {
    const invokeModel = vi
      .fn()
      .mockResolvedValueOnce({
        responseId: "resp-1",
        toolCalls: [{
          callId: "call-1",
          name: "search_customer_service_knowledge",
          arguments: { query: "退货" },
        }],
      })
      .mockResolvedValueOnce({
        responseId: "resp-2",
        outputText: "您好，签收七天内可以申请退货。",
        toolCalls: [],
      });
    const execute = vi.fn(async () => ({
      ok: true,
      content: "退货政策：签收七天内可申请退货。",
      citations: [{ scope: "shop" as const, documentId: "customer_service:shop-1:return", chunkId: "v1", score: 1 }],
    }));
    const workflow = new ResponsesAgentWorkflow({
      invokeModel,
      tools: [{
        name: "search_customer_service_knowledge",
        description: "搜索客服知识",
        execute,
      }],
    });

    await expect(workflow.generate({
      mode: "automatic",
      context: {
        id: "msg-1",
        channel: "pinduoduo",
        type: "text",
        content: "能退货吗？",
        shopId: "shop-1",
        accountId: "account-1",
        buyerId: "buyer-1",
        receivedAt: "2026-06-24T00:00:00.000Z",
      },
    })).resolves.toMatchObject({
      text: "您好，签收七天内可以申请退货。",
      action: "send",
      sources: [{ documentId: "customer_service:shop-1:return", chunkId: "v1" }],
    });

    expect(execute).toHaveBeenCalledWith({ query: "退货" });
    expect(invokeModel.mock.calls[0]?.[0]).toMatchObject({
      tools: [expect.objectContaining({
        type: "function",
        name: "search_customer_service_knowledge",
      })],
    });
    expect(invokeModel.mock.calls[1]?.[0]).toMatchObject({
      previousResponseId: "resp-1",
      input: [expect.objectContaining({
        type: "function_call_output",
        call_id: "call-1",
      })],
    });
  });

  it("records loop limit and asks for a final response", async () => {
    const events: string[] = [];
    const invokeModel = vi
      .fn()
      .mockResolvedValueOnce({
        responseId: "resp-1",
        toolCalls: [{ callId: "call-1", name: "get_shop_products", arguments: {} }],
      })
      .mockResolvedValueOnce({
        responseId: "resp-2",
        outputText: "您好，当前信息不足，建议转人工确认。",
        toolCalls: [],
      });
    const workflow = new ResponsesAgentWorkflow({
      invokeModel,
      maxIterations: 1,
      onEvent: (event) => events.push(event.type),
      tools: [{
        name: "get_shop_products",
        description: "获取商品列表",
        execute: async () => ({ ok: true, content: "商品ID: 100001" }),
      }],
    });

    await expect(workflow.generate({
      mode: "automatic",
      context: {
        id: "msg-1",
        channel: "pinduoduo",
        type: "text",
        content: "推荐商品",
        shopId: "shop-1",
        accountId: "account-1",
        buyerId: "buyer-1",
        receivedAt: "2026-06-24T00:00:00.000Z",
      },
    })).resolves.toMatchObject({ text: "您好，当前信息不足，建议转人工确认。", answerable: false });
    expect(events).toContain("loop_limit");
  });

  it("prefetches shop products before recommendation replies", async () => {
    const execute = vi.fn(async () => ({
      ok: true,
      content: "商品知识: product:shop-1:100001\n红枣 500g，goods_id=100001",
      citations: [{ scope: "shop" as const, documentId: "product:shop-1:100001", chunkId: "v1", score: 1 }],
    }));
    const invokeModel = vi.fn(async () => ({
      responseId: "resp-1",
      outputText: "您好，推荐这款红枣，我可以给您发商品卡。",
      toolCalls: [],
    }));
    const workflow = new ResponsesAgentWorkflow({
      invokeModel,
      tools: [{
        name: "get_shop_products",
        description: "获取商品列表",
        execute,
      }],
    });

    await expect(workflow.generate({
      mode: "automatic",
      context: {
        id: "msg-1",
        channel: "pinduoduo",
        type: "text",
        content: "有什么商品推荐？",
        shopId: "shop-1",
        accountId: "account-1",
        buyerId: "buyer-1",
        receivedAt: "2026-06-24T00:00:00.000Z",
      },
    })).resolves.toMatchObject({
      sources: [{ documentId: "product:shop-1:100001" }],
    });

    expect(execute).toHaveBeenCalledWith({});
    const firstRequest = (invokeModel.mock.calls as unknown as Array<[{ input: string }]>)[0]?.[0];
    expect(firstRequest?.input).toContain("当前店铺商品上下文");
    expect(firstRequest?.input).toContain("goods_id=100001");
  });
});
