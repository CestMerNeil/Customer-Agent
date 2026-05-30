import { describe, expect, it } from "vitest";
import { LangChainReplyWorkflow } from "./langchain-workflow.js";

describe("LangChainReplyWorkflow", () => {
  it("generates a grounded reply through an injected model", async () => {
    const workflow = new LangChainReplyWorkflow({
      invokeModel: async (prompt) => {
        expect(prompt).toContain("退货资料");
        return "支持七天内退货。";
      },
      searchKnowledge: async () => [{
        id: "chunk-1",
        documentId: "doc-1",
        chunkId: "chunk-1",
        scope: "global",
        content: "退货资料：签收七天内可退货。",
        score: 0.1,
      }],
    });

    const reply = await workflow.generate({
      mode: "human_review",
      context: {
        id: "msg-1",
        channel: "pinduoduo",
        type: "text",
        content: "能退货吗？",
        shopId: "shop-1",
        accountId: "account-1",
        buyerId: "buyer-1",
        receivedAt: "2026-05-29T00:00:00.000Z",
      },
    });

    expect(reply).toMatchObject({ text: "支持七天内退货。", action: "review", answerable: true });
  });
});
