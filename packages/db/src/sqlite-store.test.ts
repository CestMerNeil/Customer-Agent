import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import initSqlJs from "sql.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteAppStore } from "./sqlite-store.js";
import type { MessageRecord } from "@customer-agent/core";

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

  it("encrypts inference API keys stored in settings", async () => {
    const first = await SqliteAppStore.open(dir);
    await first.saveSettings({
      inference: {
        baseUrl: "http://127.0.0.1:8000/v1",
        chatModel: "local-chat",
        apiKey: "sk-local-secret",
      },
    });
    await first.close();

    const dbBytes = await readFile(path.join(dir, "customer-agent.sqlite"));
    expect(dbBytes.toString("utf8")).not.toContain("sk-local-secret");

    const second = await SqliteAppStore.open(dir);
    await expect(second.getSettings()).resolves.toMatchObject({
      inference: {
        baseUrl: "http://127.0.0.1:8000/v1",
        chatModel: "local-chat",
        apiKey: "sk-local-secret",
      },
    });
    await second.close();
  });

  it("redacts account errors and new or legacy diagnostic logs at the storage boundary", async () => {
    const dbPath = path.join(dir, "customer-agent.sqlite");
    const first = await SqliteAppStore.open(dir);
    const account = await first.upsertAccount({
      channel: "pinduoduo",
      username: "seller-a",
      shopId: "shop-a",
      userId: "user-a",
      status: "error",
      error: "cookie=session-secret buyer_phone=13800138000",
    });
    await first.appendLog("error", "cookie=log-secret buyer_phone=13800138000");
    expect(account.error).not.toContain("session-secret");
    expect(account.error).not.toContain("13800138000");
    expect((await first.listLogs())[0]?.message).not.toContain("log-secret");
    await first.close();

    const SQL = await initSqlJs();
    const legacyDb = new SQL.Database(await readFile(dbPath));
    legacyDb.run(
      "INSERT INTO logs(id, level, message, created_at) VALUES (?, ?, ?, ?)",
      ["legacy-log", "error", "cookie=legacy-secret buyer_phone=13800138000", "2026-07-14T00:00:00.000Z"],
    );
    await writeFile(dbPath, Buffer.from(legacyDb.export()));
    legacyDb.close();

    const reopened = await SqliteAppStore.open(dir);
    const logs = await reopened.listLogs({ limit: 10 });
    expect(logs.map((log) => log.message).join("\n")).not.toContain("legacy-secret");
    expect(logs.map((log) => log.message).join("\n")).not.toContain("13800138000");
    await reopened.close();
  });

  it("coalesces concurrent writes, retains only the newest 5000 logs, and flushes on close", async () => {
    const store = await SqliteAppStore.open(dir);
    const pending = Array.from({ length: 5_005 }, (_, index) => store.appendLog("info", `log-${index}`));

    await store.close();
    await Promise.all(pending);

    const reopened = await SqliteAppStore.open(dir);
    const logs = await reopened.listLogs({ limit: 6_000 });
    expect(logs).toHaveLength(5_000);
    expect(logs.some((log) => log.message === "log-0")).toBe(false);
    expect(logs.some((log) => log.message === "log-5004")).toBe(true);
    await reopened.close();
    expect((await readdir(dir)).some((name) => name.endsWith(".tmp"))).toBe(false);
  });

  it("fails without replacing an unreadable database", async () => {
    const dbPath = path.join(dir, "customer-agent.sqlite");
    const corruptBytes = Buffer.from("not a sqlite database");
    await writeFile(dbPath, corruptBytes);

    await expect(SqliteAppStore.open(dir)).rejects.toThrow(/file was left unchanged/);
    await expect(readFile(dbPath)).resolves.toEqual(corruptBytes);
  });

  it("removes raw payloads from new and legacy messages without deleting business fields", async () => {
    const dbPath = path.join(dir, "customer-agent.sqlite");
    const first = await SqliteAppStore.open(dir);
    await first.upsertMessage(buildMessage({
      id: "msg-raw",
      raw: { token: "new-top-secret" },
      goods: { goodsId: "goods-1", goodsName: "围巾", raw: { token: "new-goods-secret" } },
      order: { orderId: "order-1", goodsName: "围巾", raw: { token: "new-order-secret" } },
    }));
    const storedNewMessage = await first.getMessage("msg-raw");
    expect(storedNewMessage).toEqual(expect.objectContaining({
      id: "msg-raw",
      goods: { goodsId: "goods-1", goodsName: "围巾" },
      order: { orderId: "order-1", goodsName: "围巾" },
    }));
    expect(storedNewMessage?.raw).toBeUndefined();
    expect(storedNewMessage?.goods?.raw).toBeUndefined();
    expect(storedNewMessage?.order?.raw).toBeUndefined();
    await first.close();

    const SQL = await initSqlJs();
    const legacyDb = new SQL.Database(await readFile(dbPath));
    const legacyMessage = {
      ...buildMessage({ id: "msg-raw" }),
      raw: { token: "legacy-top-secret" },
      goods: { goodsId: "goods-1", goodsName: "围巾", raw: { token: "legacy-goods-secret" } },
      order: { orderId: "order-1", goodsName: "围巾", raw: { token: "legacy-order-secret" } },
    };
    legacyDb.run("UPDATE messages SET payload = ? WHERE id = ?", [JSON.stringify(legacyMessage), legacyMessage.id]);
    await writeFile(dbPath, Buffer.from(legacyDb.export()));
    legacyDb.close();

    const reopened = await SqliteAppStore.open(dir);
    expect(await reopened.getMessage("msg-raw")).toEqual(expect.objectContaining({
      id: "msg-raw",
      content: "sanitized buyer text",
      goods: { goodsId: "goods-1", goodsName: "围巾" },
      order: { orderId: "order-1", goodsName: "围巾" },
    }));
    await reopened.close();
    const persisted = (await readFile(dbPath)).toString("utf8");
    expect(persisted).not.toContain("legacy-top-secret");
    expect(persisted).not.toContain("legacy-goods-secret");
    expect(persisted).not.toContain("legacy-order-secret");
  });

  it("persists inbound queue items across store instances", async () => {
    const first = await SqliteAppStore.open(dir);
    const message = buildMessage({ id: "msg-persisted", buyerId: "buyer-a", receivedAt: "2026-06-24T10:00:00.000Z" });
    await first.upsertMessage(message);
    const queued = await first.enqueueInboundMessage(message);
    await first.close();

    const second = await SqliteAppStore.open(dir);
    expect(await second.listInboundQueue()).toMatchObject([
      {
        id: queued.id,
        messageId: "msg-persisted",
        conversationKey: "pinduoduo:shop-1:account-1:buyer-a",
        dedupeKey: "pdd-message:msg-persisted",
        state: "pending",
      },
    ]);
    await second.close();
  });

  it("recovers interrupted processing items when reopening the database", async () => {
    const dbPath = path.join(dir, "customer-agent.sqlite");
    const first = await SqliteAppStore.open(dir);
    const message = buildMessage({ id: "msg-interrupted", buyerId: "buyer-a" });
    await first.upsertMessage(message);
    await first.enqueueInboundMessage(message);
    const [claimed] = await first.claimNextInboundMessages({ limit: 1, now: "2026-06-24T10:00:00.000Z" });
    await first.close();

    const recoveryStartedAt = new Date().toISOString();
    const second = await SqliteAppStore.open(dir);
    const recoveryFinishedAt = new Date().toISOString();
    const [recovered] = await second.listInboundQueue();

    expect(recovered).toMatchObject({
      id: claimed!.id,
      state: "retry_waiting",
      attempts: 1,
      lastError: "interrupted_by_previous_shutdown",
    });
    expect(recovered!.availableAt >= recoveryStartedAt).toBe(true);
    expect(recovered!.availableAt <= recoveryFinishedAt).toBe(true);
    expect(recovered!.updatedAt).toBe(recovered!.availableAt);
    await second.close();

    const SQL = await initSqlJs();
    const persisted = new SQL.Database(await readFile(dbPath));
    const result = persisted.exec(
      "SELECT payload, state, attempts, available_at, updated_at FROM inbound_queue WHERE id = ?",
      [claimed!.id],
    )[0];
    const [payload, state, attempts, availableAt, updatedAt] = result!.values[0]!;
    expect(JSON.parse(String(payload))).toEqual(recovered);
    expect({ state, attempts, availableAt, updatedAt }).toEqual({
      state: recovered!.state,
      attempts: recovered!.attempts,
      availableAt: recovered!.availableAt,
      updatedAt: recovered!.updatedAt,
    });
    persisted.close();
  });

  it("deduplicates inbound queue items by message identity", async () => {
    const store = await SqliteAppStore.open(dir);
    const message = buildMessage({ id: "msg-duplicate", buyerId: "buyer-a" });
    await store.upsertMessage(message);

    const first = await store.enqueueInboundMessage(message);
    const second = await store.enqueueInboundMessage(message);

    expect(second).toEqual(first);
    expect(await store.listInboundQueue()).toHaveLength(1);
    await store.close();
  });

  it("persists conversation memory by shop account and buyer", async () => {
    const first = await SqliteAppStore.open(dir);
    await first.saveConversationMemory({
      shopId: "shop-1",
      accountId: "account-1",
      buyerId: "buyer-1",
      summary: "买家询问过围巾库存。",
      messageCount: 2,
    });
    await first.saveConversationMemory({
      shopId: "shop-2",
      accountId: "account-1",
      buyerId: "buyer-1",
      summary: "另一个店铺的记忆。",
      messageCount: 1,
    });
    await first.close();

    const second = await SqliteAppStore.open(dir);
    expect(await second.getConversationMemory({ shopId: "shop-1", accountId: "account-1", buyerId: "buyer-1" })).toMatchObject({
      summary: "买家询问过围巾库存。",
      messageCount: 2,
    });
    await second.saveConversationMemory({
      shopId: "shop-1",
      accountId: "account-1",
      buyerId: "buyer-1",
      summary: "买家询问过围巾库存和颜色。",
      messageCount: 4,
    });
    expect(await second.getConversationMemory({ shopId: "shop-1", accountId: "account-1", buyerId: "buyer-1" })).toMatchObject({
      summary: "买家询问过围巾库存和颜色。",
      messageCount: 4,
    });
    expect(await second.getConversationMemory({ shopId: "shop-2", accountId: "account-1", buyerId: "buyer-1" })).toMatchObject({
      summary: "另一个店铺的记忆。",
    });
    await second.close();
  });

  it("stores and lists sanitized agent audit events", async () => {
    const store = await SqliteAppStore.open(dir);
    await store.appendAgentAudit({
      shopId: "shop-1",
      accountId: "account-1",
      buyerId: "buyer-1",
      messageId: "msg-1",
      eventType: "tool_result",
      toolName: "get_product_knowledge",
      ok: true,
      summary: "工具返回商品知识",
      citations: [{ scope: "shop", documentId: "product:shop-1:100001", chunkId: "v1", score: 1 }],
    });
    await store.appendAgentAudit({
      shopId: "shop-2",
      accountId: "account-2",
      buyerId: "buyer-2",
      messageId: "msg-2",
      eventType: "final",
      summary: "其他店铺事件",
      citations: [],
    });

    expect(await store.listAgentAudit({ shopId: "shop-1" })).toMatchObject([
      {
        shopId: "shop-1",
        messageId: "msg-1",
        eventType: "tool_result",
        toolName: "get_product_knowledge",
        ok: true,
        citations: [{ documentId: "product:shop-1:100001" }],
      },
    ]);
    expect(await store.listAgentAudit({ messageId: "msg-2" })).toMatchObject([{ shopId: "shop-2" }]);
    await store.close();
  });

  it("claims one pending item per buyer conversation while allowing different buyers", async () => {
    const store = await SqliteAppStore.open(dir);
    const firstBuyerFirst = buildMessage({ id: "msg-a-1", buyerId: "buyer-a", receivedAt: "2026-06-24T10:00:00.000Z" });
    const firstBuyerSecond = buildMessage({ id: "msg-a-2", buyerId: "buyer-a", receivedAt: "2026-06-24T10:01:00.000Z" });
    const secondBuyer = buildMessage({ id: "msg-b-1", buyerId: "buyer-b", receivedAt: "2026-06-24T10:02:00.000Z" });
    for (const message of [firstBuyerFirst, firstBuyerSecond, secondBuyer]) {
      await store.upsertMessage(message);
      await store.enqueueInboundMessage(message);
    }

    const claimed = await store.claimNextInboundMessages({ limit: 2 });

    expect(claimed.map((item) => item.messageId)).toEqual(["msg-a-1", "msg-b-1"]);
    expect(await store.listInboundQueue()).toMatchObject([
      { messageId: "msg-a-1", state: "processing" },
      { messageId: "msg-a-2", state: "pending" },
      { messageId: "msg-b-1", state: "processing" },
    ]);
    await store.close();
  });

  it("moves failed processing items into retry waiting with backoff", async () => {
    const store = await SqliteAppStore.open(dir);
    const message = buildMessage({ id: "msg-retry", buyerId: "buyer-a" });
    await store.upsertMessage(message);
    await store.enqueueInboundMessage(message);
    const [claimed] = await store.claimNextInboundMessages({ limit: 1, now: "2026-06-24T10:00:00.000Z" });

    const retry = await store.failInboundQueueItem(claimed!.id, {
      error: "temporary_model_failure",
      now: "2026-06-24T10:00:00.000Z",
      maxAttempts: 3,
      baseBackoffMs: 1_000,
    });

    expect(retry).toMatchObject({
      state: "retry_waiting",
      attempts: 1,
      availableAt: "2026-06-24T10:00:01.000Z",
      lastError: "temporary_model_failure",
    });
    expect(await store.claimNextInboundMessages({ limit: 1, now: "2026-06-24T10:00:00.999Z" })).toHaveLength(0);
    expect(await store.claimNextInboundMessages({ limit: 1, now: "2026-06-24T10:00:01.000Z" })).toMatchObject([
      { id: claimed!.id, state: "processing", attempts: 2 },
    ]);
    await store.close();
  });

  it("moves failed items to dead letter after max attempts", async () => {
    const store = await SqliteAppStore.open(dir);
    const message = buildMessage({ id: "msg-dead-letter", buyerId: "buyer-a" });
    await store.upsertMessage(message);
    await store.enqueueInboundMessage(message);
    const [claimed] = await store.claimNextInboundMessages({ limit: 1, now: "2026-06-24T10:00:00.000Z" });

    const deadLetter = await store.failInboundQueueItem(claimed!.id, {
      error: "permanent_failure",
      now: "2026-06-24T10:00:00.000Z",
      maxAttempts: 1,
      baseBackoffMs: 1_000,
    });

    expect(deadLetter).toMatchObject({
      state: "dead_letter",
      attempts: 1,
      lastError: "permanent_failure",
    });
    expect(await store.claimNextInboundMessages({ limit: 1, now: "2026-06-24T10:01:00.000Z" })).toHaveLength(0);
    await store.close();
  });

  it("requeues dead-letter items for an explicit operator retry", async () => {
    const store = await SqliteAppStore.open(dir);
    const message = buildMessage({ id: "msg-dead-letter-retry", buyerId: "buyer-a" });
    await store.upsertMessage(message);
    await store.enqueueInboundMessage(message);
    const [claimed] = await store.claimNextInboundMessages({ limit: 1, now: "2026-06-24T10:00:00.000Z" });
    await store.failInboundQueueItem(claimed!.id, {
      error: "dependency_llm_circuit_open",
      now: "2026-06-24T10:00:10.000Z",
      maxAttempts: 1,
      baseBackoffMs: 1_000,
    });

    const retried = await store.retryDeadLetterInboundQueueItems({
      ids: [claimed!.id],
      now: "2026-06-24T10:05:00.000Z",
    });

    expect(retried).toMatchObject([
      {
        id: claimed!.id,
        messageId: "msg-dead-letter-retry",
        state: "pending",
        attempts: 0,
        availableAt: "2026-06-24T10:05:00.000Z",
      },
    ]);
    expect(retried[0]?.lastError).toBeUndefined();
    expect(await store.claimNextInboundMessages({ limit: 1, now: "2026-06-24T10:05:00.000Z" })).toMatchObject([
      { id: claimed!.id, state: "processing", attempts: 1 },
    ]);
    await store.close();
  });

  it("pauses and resumes inbound queue claiming", async () => {
    const store = await SqliteAppStore.open(dir);
    const message = buildMessage({ id: "msg-paused", buyerId: "buyer-a" });
    await store.upsertMessage(message);
    await store.enqueueInboundMessage(message);

    await store.setInboundQueuePaused(true);
    expect(await store.claimNextInboundMessages({ limit: 1, now: "2026-06-24T10:00:00.000Z" })).toHaveLength(0);

    await store.setInboundQueuePaused(false);
    expect(await store.claimNextInboundMessages({ limit: 1, now: "2026-06-24T10:00:00.000Z" })).toMatchObject([
      { messageId: "msg-paused", state: "processing" },
    ]);
    await store.close();
  });

  it("reports queue depth, retries, failures, and processing latency metrics", async () => {
    const store = await SqliteAppStore.open(dir);
    const retrying = buildMessage({ id: "msg-metrics-retry", buyerId: "buyer-b", receivedAt: "2026-06-24T10:00:00.000Z" });
    const dead = buildMessage({ id: "msg-metrics-dead", buyerId: "buyer-c", receivedAt: "2026-06-24T10:01:00.000Z" });
    const completed = buildMessage({ id: "msg-metrics-completed", buyerId: "buyer-d", receivedAt: "2026-06-24T10:02:00.000Z" });
    const pending = buildMessage({ id: "msg-metrics-pending", buyerId: "buyer-a", receivedAt: "2026-06-24T10:03:00.000Z" });
    for (const message of [retrying, dead, completed, pending]) {
      await store.upsertMessage(message);
      await store.enqueueInboundMessage(message);
    }

    const [retryClaim, deadClaim, completedClaim] = await store.claimNextInboundMessages({ limit: 3, now: "2026-06-24T10:03:00.000Z" });
    await store.failInboundQueueItem(retryClaim!.id, {
      error: "retryable",
      now: "2026-06-24T10:01:10.000Z",
      maxAttempts: 3,
      baseBackoffMs: 1_000,
    });
    await store.failInboundQueueItem(deadClaim!.id, {
      error: "terminal",
      now: "2026-06-24T10:02:10.000Z",
      maxAttempts: 1,
      baseBackoffMs: 1_000,
    });
    await store.completeInboundQueueItem(completedClaim!.id, "completed", undefined, "2026-06-24T10:03:05.000Z");

    const metrics = await store.getInboundQueueMetrics("2026-06-24T10:03:30.000Z");
    expect(metrics).toMatchObject({
      depth: 2,
      pending: 1,
      retryWaiting: 1,
      processing: 0,
      completed: 1,
      failed: 0,
      deadLetter: 1,
      retryCount: 1,
      failureCount: 1,
      nextRetryAt: "2026-06-24T10:01:11.000Z",
    });
    expect(metrics.averageProcessingLatencyMs).toBeGreaterThanOrEqual(0);
    expect(metrics.oldestPendingAgeMs).toBeGreaterThanOrEqual(0);
    await store.close();
  });

  it("stores product and customer-service knowledge as separate shop-scoped governed stores", async () => {
    const store = await SqliteAppStore.open(dir);

    await store.saveGovernedKnowledge({
      kind: "product",
      shopId: "shop-1",
      title: "商品 A",
      content: "商品 A 的材质说明",
      tags: ["material"],
      sourceType: "pdd_product",
      sourceId: "goods-1",
      sourceMetadata: {
        productList: { endpoint: "/latitude/goods/recommendGoods" },
        extractionModel: "gemma-vision",
      },
      enabled: true,
      reviewState: "reviewed",
    });
    await store.saveGovernedKnowledge({
      kind: "customer_service",
      shopId: "shop-1",
      title: "售后政策",
      content: "签收后七天内可申请售后",
      tags: ["after-sale"],
      sourceType: "manual",
      enabled: true,
      reviewState: "reviewed",
    });

    expect(await store.listGovernedKnowledge({ kind: "product", shopId: "shop-1" })).toMatchObject([
      {
        kind: "product",
        title: "商品 A",
        citationId: "product:shop-1:goods-1",
        sourceMetadata: { extractionModel: "gemma-vision" },
      },
    ]);
    expect(await store.listGovernedKnowledge({ kind: "customer_service", shopId: "shop-1" })).toMatchObject([
      { kind: "customer_service", title: "售后政策" },
    ]);
    expect(await store.listGovernedKnowledge({ kind: "product", shopId: "shop-2" })).toHaveLength(0);
    await store.close();
  });

  it("returns only enabled reviewed governed knowledge when eligibleOnly is requested", async () => {
    const store = await SqliteAppStore.open(dir);
    await store.saveGovernedKnowledge({
      kind: "customer_service",
      shopId: "shop-1",
      title: "已审核",
      content: "可用于客服回答",
      tags: [],
      sourceType: "manual",
      enabled: true,
      reviewState: "reviewed",
    });
    await store.saveGovernedKnowledge({
      kind: "customer_service",
      shopId: "shop-1",
      title: "草稿",
      content: "不能直接用于客服回答",
      tags: [],
      sourceType: "manual",
      enabled: true,
      reviewState: "draft",
    });

    expect(await store.listGovernedKnowledge({ kind: "customer_service", shopId: "shop-1", eligibleOnly: true })).toMatchObject([
      { title: "已审核", reviewState: "reviewed", enabled: true },
    ]);
    await store.close();
  });

  it("versions governed knowledge and can roll back to a prior reviewed version", async () => {
    const store = await SqliteAppStore.open(dir);
    const first = await store.saveGovernedKnowledge({
      kind: "product",
      shopId: "shop-1",
      title: "商品 A",
      content: "第一版",
      tags: [],
      sourceType: "pdd_product",
      sourceId: "goods-1",
      enabled: true,
      reviewState: "reviewed",
    });
    const second = await store.saveGovernedKnowledge({
      citationId: first.citationId,
      kind: "product",
      shopId: "shop-1",
      title: "商品 A",
      content: "第二版",
      tags: ["updated"],
      sourceType: "llm_extraction",
      sourceId: "goods-1",
      enabled: true,
      reviewState: "reviewed",
    });

    expect(second).toMatchObject({ citationId: first.citationId, version: 2, supersedesId: first.id });
    expect(await store.listGovernedKnowledge({ kind: "product", shopId: "shop-1", eligibleOnly: true })).toMatchObject([
      { id: second.id, version: 2, enabled: true },
    ]);

    const rolledBack = await store.rollbackGovernedKnowledge(first.citationId, 1);
    expect(rolledBack).toMatchObject({ id: first.id, version: 1, enabled: true });
    expect(await store.listGovernedKnowledge({ kind: "product", shopId: "shop-1", eligibleOnly: true })).toMatchObject([
      { id: first.id, version: 1, enabled: true },
    ]);
    await store.close();
  });

  it("manages customer-service knowledge tags, review state, enablement, and deletion", async () => {
    const store = await SqliteAppStore.open(dir);
    const record = await store.saveGovernedKnowledge({
      kind: "customer_service",
      shopId: "shop-1",
      title: "物流说明",
      content: "默认 48 小时内发货",
      tags: ["logistics", "shipping"],
      sourceType: "manual",
      enabled: true,
      reviewState: "draft",
    });

    expect(await store.listGovernedKnowledge({ kind: "customer_service", shopId: "shop-1", tag: "shipping" })).toHaveLength(1);
    const reviewed = await store.setGovernedKnowledgeState(record.citationId, { reviewState: "reviewed", enabled: true });
    expect(reviewed).toMatchObject({ reviewState: "reviewed", enabled: true });
    expect(await store.listGovernedKnowledge({ kind: "customer_service", shopId: "shop-1", eligibleOnly: true })).toHaveLength(1);

    const disabled = await store.setGovernedKnowledgeState(record.citationId, { enabled: false });
    expect(disabled).toMatchObject({ enabled: false });
    expect(await store.listGovernedKnowledge({ kind: "customer_service", shopId: "shop-1", eligibleOnly: true })).toHaveLength(0);

    expect(await store.deleteGovernedKnowledge(record.citationId)).toBe(true);
    expect(await store.listGovernedKnowledge({ kind: "customer_service", shopId: "shop-1" })).toHaveLength(0);
    await store.close();
  });

  it("batch imports customer-service knowledge rows and skips duplicates", async () => {
    const store = await SqliteAppStore.open(dir);

    const result = await store.importCustomerServiceKnowledgeRows({
      shopId: "shop-1",
      rows: [
        { title: "发票", content: "可联系客服开票", tags: ["invoice"] },
        { title: "发票", content: "可联系客服开票", tags: ["invoice"] },
      ],
      reviewState: "reviewed",
    });

    expect(result).toEqual({ created: 1, skippedDuplicates: 1, failed: 0 });
    expect(await store.listGovernedKnowledge({ kind: "customer_service", shopId: "shop-1", eligibleOnly: true })).toMatchObject([
      { title: "发票", sourceType: "import", reviewState: "reviewed", enabled: true },
    ]);
    await store.close();
  });
});

function buildMessage(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: "msg-1",
    channel: "pinduoduo",
    type: "text",
    content: "sanitized buyer text",
    shopId: "shop-1",
    accountId: "account-1",
    buyerId: "buyer-1",
    receivedAt: "2026-06-24T10:00:00.000Z",
    state: "received",
    updatedAt: "2026-06-24T10:00:00.000Z",
    ...overrides,
  };
}
