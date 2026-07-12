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
          name: "list_customer_service_knowledge",
          arguments: { page: 1 },
        }],
      })
      .mockResolvedValueOnce({
        responseId: "resp-2",
        toolCalls: [{
          callId: "call-2",
          name: "get_customer_service_knowledge",
          arguments: { citation_ids: ["customer_service:shop-1:return"] },
        }],
      })
      .mockResolvedValueOnce({
        responseId: "resp-3",
        outputText: "您好，签收七天内可以申请退货。",
        toolCalls: [],
      });
    const listExecute = vi.fn(async () => ({
      ok: true,
      content: "citation_id=customer_service:shop-1:return | title=退货政策 | tags=退货 | version=v1",
    }));
    const getExecute = vi.fn(async () => ({
      ok: true,
      content: "退货政策：签收七天内可申请退货。",
      citations: [{ scope: "shop" as const, documentId: "customer_service:shop-1:return", chunkId: "v1", score: 1 }],
    }));
    const workflow = new ResponsesAgentWorkflow({
      invokeModel,
      tools: [
        { name: "list_customer_service_knowledge", description: "列出客服知识目录", execute: listExecute },
        { name: "get_customer_service_knowledge", description: "获取客服知识全文", execute: getExecute },
      ],
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

    expect(listExecute).toHaveBeenCalledWith({ page: 1 });
    expect(getExecute).toHaveBeenCalledWith({ citation_ids: ["customer_service:shop-1:return"] });
    expect(invokeModel.mock.calls[0]?.[0]).toMatchObject({
      tools: expect.arrayContaining([
        expect.objectContaining({ type: "function", name: "list_customer_service_knowledge" }),
        expect.objectContaining({ type: "function", name: "get_customer_service_knowledge" }),
      ]),
    });
    expect(invokeModel.mock.calls[1]?.[0]).toMatchObject({
      previousResponseId: "resp-1",
      input: [expect.objectContaining({
        type: "function_call_output",
        call_id: "call-1",
      })],
    });
    expect(invokeModel.mock.calls[2]?.[0]).toMatchObject({
      previousResponseId: "resp-2",
      input: [expect.objectContaining({ type: "function_call_output", call_id: "call-2" })],
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
