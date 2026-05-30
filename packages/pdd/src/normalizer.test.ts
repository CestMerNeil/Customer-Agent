import { describe, expect, it } from "vitest";
import { normalizePddMessage } from "./normalizer.js";

describe("normalizePddMessage", () => {
  it("normalizes text websocket payloads into customer service context", () => {
    const context = normalizePddMessage(
      {
        msg_id: "msg-1",
        message_type: 0,
        content: "有 L 码吗？",
        from: { uid: "buyer-1", nickname: "买家A" },
        ts: 1779984000000,
      },
      { accountId: "account-1", shopId: "shop-1" },
    );

    expect(context).toMatchObject({
      id: "msg-1",
      channel: "pinduoduo",
      type: "text",
      content: "有 L 码吗？",
      buyerId: "buyer-1",
      buyerNickname: "买家A",
      shopId: "shop-1",
      accountId: "account-1",
    });
  });
});
