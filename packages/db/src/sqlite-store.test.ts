import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteAppStore } from "./sqlite-store.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "customer-agent-sqlite-"));
});

afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

describe("SqliteAppStore", () => {
  it("persists accounts and messages across store instances", async () => {
    const first = await SqliteAppStore.open(dir);
    const account = await first.upsertAccount({
      channel: "pinduoduo",
      username: "seller@example.com",
      shopId: "shop-1",
      shopName: "测试店铺",
      userId: "user-1",
      status: "online",
      cookies: "{\"PDDAccessToken\":\"token-value\"}",
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
    await first.close();

    const dbBytes = await readFile(path.join(dir, "customer-agent.sqlite"));
    expect(dbBytes.toString("utf8")).not.toContain("token-value");

    const second = await SqliteAppStore.open(dir);
    expect(await second.listAccounts()).toMatchObject([
      { username: "seller@example.com", shopId: "shop-1", status: "online", cookies: "{\"PDDAccessToken\":\"token-value\"}" },
    ]);
    expect(await second.listMessages()).toMatchObject([
      { id: "msg-1", content: "这件还有 L 码吗？", state: "received" },
    ]);
    await second.close();
  });
});
