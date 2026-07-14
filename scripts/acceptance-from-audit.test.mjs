import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregate,
  defaultDbCandidates,
  deriveRecord,
} from "./acceptance-from-audit.mjs";

/** Minimal blocked PDD record used to exercise evidence derivation. */
const pddRecord = {
  capability: "pdd-real-merchant-operations",
  commitSha: "candidate",
  platform: "darwin-arm64",
  accountAlias: "pdd-account-a",
  shopAlias: "shop-a",
  outcome: "blocked",
  actor: "generated",
  acceptedAt: "1970-01-01T00:00:00.000Z",
  evidenceSummary: "Awaiting real acceptance.",
  blockers: ["real-acceptance-not-recorded"],
};

const workflowRecord = {
  ...pddRecord,
  capability: "auditable-agent-workflow",
};

const citation = {
  scope: "shop",
  documentId: "customer_service:shop-a:return",
  chunkId: "v1",
  score: 1,
};

function customerServiceChain(messageId = "message-1") {
  const common = { shopId: "real-shop-a", messageId };
  return [
    { ...common, eventType: "tool_call", toolName: "list_customer_service_knowledge" },
    { ...common, eventType: "tool_result", toolName: "list_customer_service_knowledge", ok: true, citations: [] },
    { ...common, eventType: "tool_call", toolName: "get_customer_service_knowledge" },
    { ...common, eventType: "tool_result", toolName: "get_customer_service_knowledge", ok: true, citations: [citation] },
    { ...common, eventType: "final", ok: true, citations: [citation] },
    { ...common, eventType: "pdd_send_success", ok: true, citations: [] },
  ];
}

test("derives blocked workflow evidence from one ordered grounded and delivered message", () => {
  const stats = aggregate(customerServiceChain(), new Map([["real-shop-a", "shop-a"]]));
  const derived = deriveRecord(
    workflowRecord,
    stats.get("shop-a"),
    stats,
    "2026-07-12T00:00:00.000Z",
    "2026-07-12T01:00:00.000Z",
  );

  assert.equal(stats.get("shop-a")?.groundedAgentWorkflows, 1);
  assert.equal(derived?.outcome, "blocked");
  assert.equal(derived?.actor, "generated");
  assert.match(derived?.evidenceSummary ?? "", /Grounded customer-service workflows completed/);
});

test("does not join workflow stages across message ids", () => {
  const events = customerServiceChain().map((event, index) => ({
    ...event,
    messageId: index < 3 ? "message-1" : "message-2",
  }));
  const stats = aggregate(events, new Map([["real-shop-a", "shop-a"]]));

  assert.equal(stats.get("shop-a")?.groundedAgentWorkflows, 0);
  assert.equal(deriveRecord(workflowRecord, stats.get("shop-a"), stats, "since", "at"), null);
});

test("requires the final event to repeat a detail citation", () => {
  const events = customerServiceChain();
  events[4] = { ...events[4], citations: [] };
  const stats = aggregate(events, new Map([["real-shop-a", "shop-a"]]));

  assert.equal(stats.get("shop-a")?.groundedAgentWorkflows, 0);
  assert.equal(deriveRecord(workflowRecord, stats.get("shop-a"), stats, "since", "at"), null);
});

test("counts a delivered no-knowledge path without using it as grounded evidence", () => {
  const common = { shopId: "real-shop-a", messageId: "message-1" };
  const stats = aggregate([
    { ...common, eventType: "tool_call", toolName: "list_customer_service_knowledge" },
    { ...common, eventType: "tool_result", toolName: "list_customer_service_knowledge", ok: true, citations: [] },
    { ...common, eventType: "final", ok: true, citations: [] },
    { ...common, eventType: "pdd_send_success", ok: true, citations: [] },
  ], new Map([["real-shop-a", "shop-a"]]));

  assert.equal(stats.get("shop-a")?.noKnowledgePaths, 1);
  assert.equal(stats.get("shop-a")?.groundedAgentWorkflows, 0);
  assert.equal(deriveRecord(workflowRecord, stats.get("shop-a"), stats, "since", "at"), null);
});

test("does not treat a generated final response as successful PDD delivery", () => {
  const stats = aggregate([
    { shopId: "real-shop-a", messageId: "message-1", eventType: "final", citations: [] },
  ], new Map([["real-shop-a", "shop-a"]]));

  assert.equal(
    deriveRecord(pddRecord, stats.get("shop-a"), stats, "2026-07-12T00:00:00.000Z", "2026-07-12T01:00:00.000Z"),
    null,
  );
});

test("summarizes a persisted PDD send as blocked candidate evidence", () => {
  const stats = aggregate([
    { shopId: "real-shop-a", messageId: "message-1", eventType: "pdd_send_success", ok: true, citations: [] },
  ], new Map([["real-shop-a", "shop-a"]]));
  const derived = deriveRecord(
    pddRecord,
    stats.get("shop-a"),
    stats,
    "2026-07-12T00:00:00.000Z",
    "2026-07-12T01:00:00.000Z",
  );

  assert.equal(derived?.outcome, "blocked");
  assert.equal(derived?.actor, "generated");
  assert.deepEqual(derived?.blockers, ["operator-review-required"]);
  assert.match(derived?.evidenceSummary ?? "", /PDD text sends completed/);
});

test("checks the scoped Electron user-data path before legacy locations", () => {
  const [candidate] = defaultDbCandidates("darwin", "/Users/operator", {});

  assert.equal(
    candidate,
    "/Users/operator/Library/Application Support/@customer-agent/desktop/data/customer-agent.sqlite",
  );
});
