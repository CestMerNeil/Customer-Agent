import { describe, expect, it } from "vitest";
import { isQueueablePddMessage, normalizePddMessage } from "./normalizer.js";

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

  it("normalizes real PDD push text payloads from nested message fields", () => {
    const context = normalizePddMessage(
      {
        response: "push",
        message: {
          msg_id: "real-msg-1",
          type: 0,
          content: "这件还有货吗？",
          from: { uid: "buyer-1", role: "user" },
          to: { uid: "cs-1", role: "mall_cs" },
          nickname: "买家A",
          time: 1779984000000,
        },
      },
      { accountId: "account-1", shopId: "shop-1" },
    );

    expect(context).toMatchObject({
      id: "real-msg-1",
      type: "text",
      content: "这件还有货吗？",
      buyerId: "buyer-1",
      buyerNickname: "买家A",
    });
    expect(isQueueablePddMessage(context)).toBe(true);
  });

  it("classifies auth and mall customer-service websocket payloads as non-queueable", () => {
    const auth = normalizePddMessage(
      { response: "auth", request_id: "1", auth: { result: "ok" } },
      { accountId: "account-1", shopId: "shop-1" },
    );
    const mallCs = normalizePddMessage(
      {
        response: "push",
        message: {
          msg_id: "cs-msg-1",
          type: 0,
          content: "客服自己发送的消息",
          from: { uid: "cs-1", role: "mall_cs" },
          to: { uid: "buyer-1", role: "user" },
        },
      },
      { accountId: "account-1", shopId: "shop-1" },
    );

    expect(auth.type).toBe("auth");
    expect(mallCs.type).toBe("mall_cs");
    expect(isQueueablePddMessage(auth)).toBe(false);
    expect(isQueueablePddMessage(mallCs)).toBe(false);
  });

  it("normalizes image websocket payloads with media url", () => {
    const context = normalizePddMessage(
      {
        msg_id: "img-1",
        message_type: "image",
        image_url: "https://example.com/chat.jpg",
        buyer_id: "buyer-2",
      },
      { accountId: "account-1", shopId: "shop-1" },
    );

    expect(context).toMatchObject({
      id: "img-1",
      type: "image",
      content: "https://example.com/chat.jpg",
      buyerId: "buyer-2",
    });
  });

  it("normalizes goods card payloads into goods context", () => {
    const context = normalizePddMessage(
      {
        msg_id: "goods-1",
        message_type: "goods_card",
        goods_card: {
          goods_id: "g-1",
          goods_name: "真丝围巾",
          goods_price: "59.90",
          spec: "米白色",
        },
        buyer_id: "buyer-3",
      },
      { accountId: "account-1", shopId: "shop-1" },
    );

    expect(context).toMatchObject({
      id: "goods-1",
      type: "goods_card",
      content: expect.stringContaining("goods-1"),
    });
    expect(context.goods).toMatchObject({
      goodsId: "g-1",
      goodsName: "真丝围巾",
      goodsPrice: "59.90",
      goodsSpec: "米白色",
    });
  });

  it("normalizes order payloads into order context", () => {
    const context = normalizePddMessage(
      {
        msg_id: "order-1",
        type: 7,
        order_info: {
          order_id: "ord-1001",
          goods_name: "连衣裙",
        },
        buyer_id: "buyer-4",
      },
      { accountId: "account-1", shopId: "shop-1" },
    );

    expect(context).toMatchObject({
      id: "order-1",
      type: "order_info",
      content: expect.stringContaining("order-1"),
    });
    expect(context.order).toMatchObject({
      orderId: "ord-1001",
      goodsName: "连衣裙",
    });
  });

  it("maps mall system messages into mall_system_msg content", () => {
    const context = normalizePddMessage(
      {
        msg_id: "sys-1",
        message_type: "mall_system_msg",
        notice: "买家正在输入",
        buyer_id: "buyer-5",
      },
      { accountId: "account-1", shopId: "shop-1" },
    );

    expect(context).toMatchObject({
      id: "sys-1",
      type: "mall_system_msg",
      content: "买家正在输入",
      buyerId: "buyer-5",
    });
  });
});
