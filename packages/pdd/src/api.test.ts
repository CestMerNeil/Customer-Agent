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
});
