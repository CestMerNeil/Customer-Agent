import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonAppStore } from "./json-store.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "customer-agent-db-"));
});

afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

describe("JsonAppStore", () => {
  it("persists accounts and messages across store instances", async () => {
    const first = await JsonAppStore.open(dir);

    const account = await first.upsertAccount({
      channel: "pinduoduo",
      username: "seller@example.com",
      shopId: "shop-1",
      shopName: "测试店铺",
      userId: "user-1",
      status: "online",
      cookies: "{\"PDDAccessToken\":\"token\"}",
    });
    await first.upsertMessage({
      id: "msg-1",
      channel: "pinduoduo",
      type: "text",
      content: "这件还有 L 码吗？",
      shopId: "shop-1",
      accountId: account.id,
      buyerId: "buyer-1",
      receivedAt: "2026-05-29T00:00:00.000Z",
      state: "received",
    });

    const second = await JsonAppStore.open(dir);

    expect(await second.listAccounts()).toMatchObject([
      { username: "seller@example.com", shopId: "shop-1", status: "online" },
    ]);
    expect(await second.listMessages()).toMatchObject([
      { id: "msg-1", content: "这件还有 L 码吗？", state: "received" },
    ]);
  });
});
