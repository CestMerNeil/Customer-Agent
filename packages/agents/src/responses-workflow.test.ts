import { describe, expect, it, vi } from "vitest";
import { ResponsesAgentWorkflow } from "./responses-workflow.js";
import type { ToolWorkflowEvent } from "./tools.js";

describe("ResponsesAgentWorkflow", () => {
  it("runs native response tool calls and continues with function outputs", async () => {
    const events: ToolWorkflowEvent[] = [];
    const invokeModel = vi
      .fn()
      .mockResolvedValueOnce({
        responseId: "resp-1",
        toolCalls: [{
          callId: "call-1",
          name: "get_customer_service_knowledge",
          arguments: { citation_ids: ["customer_service:shop-1:return"] },
        }],
      })
      .mockResolvedValueOnce({
        responseId: "resp-2",
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
      onEvent: (event) => events.push(event),
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

    expect(listExecute).toHaveBeenCalledOnce();
    expect(listExecute).toHaveBeenCalledWith({ page: 1 });
    expect(getExecute).toHaveBeenCalledWith({ citation_ids: ["customer_service:shop-1:return"] });
    expect(invokeModel.mock.calls[0]?.[0]).toMatchObject({
      tools: expect.arrayContaining([
        expect.objectContaining({ type: "function", name: "list_customer_service_knowledge" }),
        expect.objectContaining({ type: "function", name: "get_customer_service_knowledge" }),
      ]),
    });
    expect(invokeModel.mock.calls[0]?.[0].input).toContain("citation_id=customer_service:shop-1:return");
    expect(invokeModel.mock.calls[0]?.[0].input).not.toContain("退货政策：签收七天内可申请退货");
    expect(invokeModel.mock.calls[1]?.[0]).toMatchObject({
      previousResponseId: "resp-1",
      input: [expect.objectContaining({
        type: "function_call_output",
        call_id: "call-1",
      })],
    });
    expect(JSON.stringify(invokeModel.mock.calls[1]?.[0].input)).toContain("退货政策：签收七天内可申请退货");
    expect(events.slice(0, 2)).toMatchObject([
      { type: "tool_call", name: "list_customer_service_knowledge", input: { page: 1 } },
      { type: "tool_result", name: "list_customer_service_knowledge", result: { ok: true } },
    ]);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "tool_call", name: "get_customer_service_knowledge" }),
      expect.objectContaining({
        type: "final",
        result: expect.objectContaining({
          ok: true,
          citations: [expect.objectContaining({ documentId: "customer_service:shop-1:return" })],
        }),
      }),
    ]));
  });

  it("exposes an empty eligible catalog before the first model decision", async () => {
    const listExecute = vi.fn(async () => ({
      ok: true,
      content: "当前页没有可用客服知识。",
    }));
    const events: ToolWorkflowEvent[] = [];
    const invokeModel = vi.fn(async () => ({
      responseId: "resp-1",
      outputText: "您好，请问您想咨询哪方面的问题？",
      toolCalls: [],
    }));
    const workflow = new ResponsesAgentWorkflow({
      invokeModel,
      onEvent: (event) => events.push(event),
      tools: [{
        name: "list_customer_service_knowledge",
        description: "列出客服知识目录",
        execute: listExecute,
      }],
    });

    await workflow.generate({
      mode: "automatic",
      context: {
        id: "msg-1",
        channel: "pinduoduo",
        type: "text",
        content: "你好",
        shopId: "shop-1",
        accountId: "account-1",
        buyerId: "buyer-1",
        receivedAt: "2026-06-24T00:00:00.000Z",
      },
    });

    expect(listExecute).toHaveBeenCalledOnce();
    const firstRequest = (invokeModel.mock.calls as unknown as Array<[{ input: string }]>)[0]?.[0];
    expect(firstRequest?.input).toContain("当前页没有可用客服知识");
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "final",
        result: expect.objectContaining({ ok: true, citations: [] }),
      }),
    ]));
  });

  it("records loop limit and asks for a final response", async () => {
    const events: ToolWorkflowEvent[] = [];
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
      onEvent: (event) => events.push(event),
      tools: [{
        name: "get_shop_products",
        description: "获取商品列表",
        execute: async () => ({
          ok: true,
          content: "商品ID: 100001",
          citations: [{ scope: "shop", documentId: "product:shop-1:100001", chunkId: "v1", score: 1 }],
        }),
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
    })).resolves.toMatchObject({
      text: "您好，当前信息不足，建议转人工确认。",
      sources: [expect.objectContaining({ documentId: "product:shop-1:100001" })],
    });
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "loop_limit" }),
      expect.objectContaining({
        type: "final",
        result: expect.objectContaining({
          citations: [expect.objectContaining({ documentId: "product:shop-1:100001" })],
        }),
      }),
    ]));
    expect(invokeModel.mock.calls[1]?.[0]).toMatchObject({
      previousResponseId: "resp-1",
      input: [expect.objectContaining({ type: "function_call_output", call_id: "call-1" })],
    });
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
