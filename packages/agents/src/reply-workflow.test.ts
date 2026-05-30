import { describe, expect, it } from "vitest";
import { ReplyWorkflow } from "./reply-workflow.js";

describe("ReplyWorkflow", () => {
  it("builds a grounded prompt and returns source references", async () => {
    const workflow = new ReplyWorkflow({
      chat: async (prompt) => {
        expect(prompt).toContain("客户问题：这件支持七天无理由吗？");
        expect(prompt).toContain("签收后七天内可以退货");
        return "支持，签收后七天内可以申请退货。";
      },
      searchKnowledge: async () => [
        {
          id: "chunk-1",
          documentId: "doc-1",
          chunkId: "chunk-1",
          scope: "global",
          content: "签收后七天内可以退货。",
          score: 0.9,
        },
      ],
    });

    const reply = await workflow.generate({
      context: {
        id: "msg-1",
        channel: "pinduoduo",
        type: "text",
        content: "这件支持七天无理由吗？",
        shopId: "shop-1",
        accountId: "account-1",
        buyerId: "buyer-1",
        receivedAt: "2026-05-29T00:00:00.000Z",
      },
      mode: "human_review",
    });

    expect(reply).toMatchObject({
      text: "支持，签收后七天内可以申请退货。",
      action: "review",
      answerable: true,
      sources: [{ documentId: "doc-1", chunkId: "chunk-1", score: 0.9 }],
    });
  });
});
