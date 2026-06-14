import { afterEach, describe, expect, it } from "vitest";
import { mockFixtures } from "./mock-pdd.js";
import { startMockPddServer, type MockPddServer } from "./mock-pdd-server.js";

// Verifies the process-mode mock directly (independent of Electron): a real WS
// client connects, a frame is pushed via the control endpoint and arrives, and
// the HTTP endpoints answer from the same fixtures as the library mode.

let server: MockPddServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe("Mock Pinduoduo process mode", () => {
  it("delivers a pushed buyer frame to a connected WebSocket client", async () => {
    server = await startMockPddServer();
    const ws = new WebSocket(`${server.wsBaseUrl}/?role=mall_cs`);
    const received = new Promise<string>((resolve) => {
      ws.addEventListener("message", (event) => resolve(String((event as MessageEvent).data)));
    });
    await new Promise<void>((resolve) => ws.addEventListener("open", () => resolve()));

    server.pushBuyerMessage();
    const frame = JSON.parse(await received) as typeof mockFixtures.buyerFrame;
    expect(frame).toMatchObject({ msg_id: "msg-1", content: "有 L 码吗？", from: { uid: "buyer-1" } });
    ws.close();
  });

  it("pushes a frame via the HTTP control endpoint", async () => {
    server = await startMockPddServer();
    const ws = new WebSocket(`${server.wsBaseUrl}/`);
    const received = new Promise<string>((resolve) => {
      ws.addEventListener("message", (event) => resolve(String((event as MessageEvent).data)));
    });
    await new Promise<void>((resolve) => ws.addEventListener("open", () => resolve()));

    const custom = { ...mockFixtures.buyerFrame, msg_id: "msg-control", content: "控制推送" };
    const control = await fetch(`${server.httpBaseUrl}/__control/push`, {
      method: "POST",
      body: JSON.stringify(custom),
    });
    expect(await control.json()).toEqual({ pushed: true });

    const frame = JSON.parse(await received) as typeof mockFixtures.buyerFrame;
    expect(frame).toMatchObject({ msg_id: "msg-control", content: "控制推送" });
    ws.close();
  });

  it("answers the five PDD endpoints from the shared fixtures", async () => {
    server = await startMockPddServer();

    const token = await postJson(`${server.httpBaseUrl}/chats/getToken`);
    expect(token).toEqual(mockFixtures.getToken);

    const userInfo = await postJson(`${server.httpBaseUrl}/janus/api/new/userinfo`);
    expect(userInfo).toEqual(mockFixtures.userInfo);

    const shopInfo = await postJson(`${server.httpBaseUrl}/earth/api/merchant/queryMerchantInfoByMallId`);
    expect(shopInfo).toEqual(mockFixtures.shopInfo);

    const status = await postJson(`${server.httpBaseUrl}/plateau/chat/set_csstatus`);
    expect(status).toEqual(mockFixtures.setOnlineStatus);

    const send = await postJson(`${server.httpBaseUrl}/plateau/chat/send_message`, JSON.stringify({ hello: "world" }));
    expect(send).toEqual(mockFixtures.sendMessage);

    expect(server.requests.send_message).toHaveLength(1);
    expect(server.requests.send_message?.[0]?.body).toBe(JSON.stringify({ hello: "world" }));
  });

  it("returns the configured send error", async () => {
    server = await startMockPddServer({ sendError: "session expired" });
    const send = await postJson(`${server.httpBaseUrl}/plateau/chat/send_message`);
    expect(send).toEqual({ success: false, errorMsg: "session expired" });
  });
});

async function postJson(url: string, body = ""): Promise<unknown> {
  const response = await fetch(url, { method: "POST", body });
  return response.json();
}
