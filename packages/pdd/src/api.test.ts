import { describe, expect, it, vi } from "vitest";
import { PddApi } from "./api.js";

describe("PddApi", () => {
  it("fetches chat token from supported response shapes", async () => {
    const postForm = vi.fn().mockResolvedValue({ result: { token: "chat-token" } });
    const api = new PddApi({ http: { postForm, postJson: vi.fn(), postEmptyJson: vi.fn() } });

    await expect(api.getChatToken()).resolves.toBe("chat-token");
    expect(postForm).toHaveBeenCalledWith("https://mms.pinduoduo.com/chats/getToken", { version: "3" });
  });

  it("fetches user and shop info", async () => {
    const postEmptyJson = vi
      .fn()
      .mockResolvedValueOnce({ success: true, result: { id: "user-1", username: "客服", mall_id: "mall-1" } });
    const postJson = vi
      .fn()
      .mockResolvedValueOnce({ success: true, result: { mallId: "shop-1", mallName: "测试店", mallLogo: "logo.png" } });
    const api = new PddApi({ http: { postForm: vi.fn(), postJson, postEmptyJson } });

    await expect(api.getUserInfo()).resolves.toEqual({ userId: "user-1", username: "客服", mallId: "mall-1" });
    expect(postEmptyJson).toHaveBeenCalledWith("https://mms.pinduoduo.com/janus/api/new/userinfo");
    await expect(api.getShopInfo()).resolves.toEqual({ shopId: "shop-1", shopName: "测试店", shopLogo: "logo.png" });
  });

  it("surfaces PDD underscore error fields", async () => {
    const api = new PddApi({
      http: {
        postForm: vi.fn(),
        postJson: vi.fn(),
        postEmptyJson: vi.fn().mockResolvedValue({ success: false, error_msg: "会话已过期", error_code: 43001 }),
      },
    });

    await expect(api.getUserInfo()).rejects.toThrow("会话已过期（43001）");
  });

  it("maps customer-service availability to PDD status codes", async () => {
    const postJson = vi.fn().mockResolvedValue({ success: true });
    const api = new PddApi({ http: { postForm: vi.fn(), postJson, postEmptyJson: vi.fn() } });

    await api.setOnlineStatus("online");
    await api.setOnlineStatus("busy");
    await api.setOnlineStatus("offline");

    expect(postJson).toHaveBeenNthCalledWith(
      1,
      "https://mms.pinduoduo.com/plateau/chat/set_csstatus",
      { data: { cmd: "set_csstatus", status: "1" }, client: "WEB" },
    );
    expect(postJson).toHaveBeenNthCalledWith(
      2,
      "https://mms.pinduoduo.com/plateau/chat/set_csstatus",
      { data: { cmd: "set_csstatus", status: "0" }, client: "WEB" },
    );
    expect(postJson).toHaveBeenNthCalledWith(
      3,
      "https://mms.pinduoduo.com/plateau/chat/set_csstatus",
      { data: { cmd: "set_csstatus", status: "3" }, client: "WEB" },
    );
  });

  it("constructs text send payload", async () => {
    const postJson = vi.fn().mockResolvedValue({ success: true, result: { msg_id: "sent-1" } });
    const api = new PddApi({ http: { postForm: vi.fn(), postJson, postEmptyJson: vi.fn() }, requestId: () => "req-1" });

    await expect(api.sendText("buyer-1", "您好")).resolves.toEqual({ ok: true });
    expect(postJson).toHaveBeenCalledWith(
      "https://mms.pinduoduo.com/plateau/chat/send_message",
      expect.objectContaining({
        data: expect.objectContaining({
          cmd: "send_message",
          request_id: "req-1",
          message: expect.objectContaining({
            to: { role: "user", uid: "buyer-1" },
            content: "您好",
            type: 0,
          }),
        }),
        client: "WEB",
      }),
    );
  });

  it("fetches product list from calibrated onSaleGoods shape", async () => {
    const postJson = vi.fn().mockResolvedValue({
      success: true,
      result: {
        total: 2,
        onSaleGoods: [{
          goodsId: 123456789,
          goodsName: "真丝围巾",
          thumbUrl: "https://img.example/goods.jpg",
          minOnSaleGroupPrice: 5990,
          maxOnSaleGroupPrice: 6990,
          soldQuantity: 12,
          soldQuantity30d: 4,
          quantity: 88,
          goodsType: 1,
          goodsTag: { marketingTags: ["新品", "热卖"] },
          goodsUrl: "https://mobile.yangkeduo.com/goods.html",
        }],
      },
    });
    const api = new PddApi({ http: { postForm: vi.fn(), postJson, postEmptyJson: vi.fn() } });

    await expect(api.getProductList({ page: 2, pageSize: 50, antiContent: "anti" })).resolves.toMatchObject({
      total: 2,
      page: 2,
      pageSize: 50,
      products: [{
        goodsId: "123456789",
        goodsName: "真丝围巾",
        price: "59.90-69.90",
        soldQuantity: 12,
        soldQuantity30d: 4,
        quantity: 88,
        tag: "新品, 热卖",
        sourceMetadata: {
          endpoint: "/latitude/goods/recommendGoods",
          page: 2,
        },
      }],
    });
    expect(postJson).toHaveBeenCalledWith(
      "https://mms.pinduoduo.com/latitude/goods/recommendGoods",
      { uid: "", pageNum: 2, pageSize: 50 },
      expect.objectContaining({ headers: expect.objectContaining({ "anti-content": "anti" }) }),
    );
  });

  it("fetches product detail and parses specs and images", async () => {
    const postJson = vi.fn().mockResolvedValue({
      success: true,
      result: {
        goods_id: 123456789,
        goods_name: "真丝围巾",
        skus: [{ spec: [{ parent_name: "颜色", spec_name: "米白" }, { spec_name: "均码" }] }],
        cats: ["服饰", "围巾"],
        carousel_gallery: ["https://img.example/a.jpg"],
        detail_gallery: ["https://img.example/b.jpg"],
        thumb_url: "https://img.example/a.jpg",
      },
    });
    const api = new PddApi({ http: { postForm: vi.fn(), postJson, postEmptyJson: vi.fn() } });

    await expect(api.getProductDetail("123456789")).resolves.toMatchObject({
      goodsId: "123456789",
      goodsName: "真丝围巾",
      specifications: ["颜色: 米白", "均码"],
      categories: ["服饰", "围巾"],
      images: ["https://img.example/a.jpg", "https://img.example/b.jpg"],
      sourceMetadata: { endpoint: "/glide/v2/mms/query/commit/on_shop/detail" },
    });
  });

  it("constructs image, goods-card, customer-service, and transfer requests", async () => {
    const postJson = vi
      .fn()
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true, result: { csList: { cs_1: { username: "客服A", status: "online" } } } })
      .mockResolvedValueOnce({ success: true });
    const api = new PddApi({ http: { postForm: vi.fn(), postJson, postEmptyJson: vi.fn() }, requestId: () => "req-1" });

    await expect(api.sendImage("buyer-1", "https://img.example/1.jpg")).resolves.toEqual({ ok: true });
    await expect(api.sendGoodsCard("buyer-1", "123456789", { antiContent: "anti" })).resolves.toEqual({ ok: true });
    await expect(api.getAssignedCustomerServices()).resolves.toEqual([{ uid: "cs_1", username: "客服A", status: "online" }]);
    await expect(api.moveConversation("buyer-1", "cs_1")).resolves.toEqual({ ok: true });

    expect(postJson).toHaveBeenNthCalledWith(
      2,
      "https://mms.pinduoduo.com/plateau/message/send/mallGoodsCard",
      { uid: "buyer-1", goods_id: 123456789, biz_type: 2 },
      expect.objectContaining({ headers: expect.objectContaining({ "anti-content": "anti" }) }),
    );
    expect(postJson).toHaveBeenNthCalledWith(
      4,
      "https://mms.pinduoduo.com/plateau/chat/move_conversation",
      expect.objectContaining({
        data: expect.objectContaining({
          cmd: "move_conversation",
          conversation: expect.objectContaining({ csid: "cs_1", uid: "buyer-1" }),
        }),
      }),
    );
  });

  it("rejects list indexes as goods-card goods IDs", async () => {
    const postJson = vi.fn();
    const api = new PddApi({ http: { postForm: vi.fn(), postJson, postEmptyJson: vi.fn() } });

    await expect(api.sendGoodsCard("buyer-1", 3)).resolves.toEqual({
      ok: false,
      error: "goods_id 无效，不能使用商品列表序号作为商品 ID",
    });
    expect(postJson).not.toHaveBeenCalled();
  });

  it("returns failed goods-card results for HTTP errors so callers can retry", async () => {
    const error = 'PDD request failed with HTTP 403: {"error_msg":"","error_code":-12}';
    const postJson = vi.fn().mockRejectedValue(new Error(error));
    const api = new PddApi({ http: { postForm: vi.fn(), postJson, postEmptyJson: vi.fn() } });

    await expect(api.sendGoodsCard("buyer-1", "123456789", { antiContent: "anti" })).resolves.toEqual({
      ok: false,
      error,
    });
  });
});
