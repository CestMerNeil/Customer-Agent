import { describe, expect, it } from "vitest";
import {
  buildDefaultAcceptanceSkeleton,
  createDefaultAcceptanceScopes,
  createReleaseCapabilityMatrix,
  resolveAcceptanceCommitSha,
  validateAcceptanceRecord,
  validateAcceptanceRecordSet,
} from "./acceptance.js";

describe("acceptance evidence", () => {
  it("generates deterministic sanitized account and shop aliases", () => {
    expect(createDefaultAcceptanceScopes()).toEqual([
      { accountAlias: "pdd-account-a", shopAlias: "shop-a" },
      { accountAlias: "pdd-account-b", shopAlias: "shop-b" },
    ]);
  });

  it("creates a release capability matrix without passing business evidence by default", () => {
    const matrix = createReleaseCapabilityMatrix();

    expect(matrix).toContainEqual({
      capability: "pdd-real-merchant-operations",
      releaseBlocking: true,
      requiredScopes: "two-shop",
    });
    expect(matrix).toContainEqual({
      capability: "local-model-runtime-provisioning",
      releaseBlocking: true,
      requiredScopes: "platform",
    });
    expect(matrix.every((row) => row.releaseBlocking)).toBe(true);
  });

  it("builds blocked acceptance skeletons bound to commit and aliases", () => {
    const skeleton = buildDefaultAcceptanceSkeleton({
      commitSha: "81bf519",
      version: "0.1.0",
      platform: "darwin-arm64",
    });

    expect(skeleton).toHaveLength(createReleaseCapabilityMatrix().length * 2);
    expect(skeleton[0]).toMatchObject({
      commitSha: "81bf519",
      version: "0.1.0",
      platform: "darwin-arm64",
      accountAlias: "pdd-account-a",
      shopAlias: "shop-a",
      outcome: "blocked",
      actor: "generated",
    });
    expect(skeleton[0]?.evidenceSummary).toContain("Awaiting real acceptance");
  });

  it("accepts sanitized real acceptance records", () => {
    const result = validateAcceptanceRecord({
      capability: "pdd-real-merchant-operations",
      commitSha: "81bf519",
      platform: "darwin-arm64",
      accountAlias: "pdd-account-a",
      shopAlias: "shop-a",
      outcome: "pass",
      actor: "operator",
      acceptedAt: "2026-06-24T08:00:00.000Z",
      evidenceSummary: "Real login, WebSocket start, text send, and stop passed in a controlled buyer conversation.",
    });

    expect(result.ok).toBe(true);
  });

  it("rejects records containing secrets or private buyer payloads", () => {
    const result = validateAcceptanceRecord({
      capability: "pdd-real-merchant-operations",
      commitSha: "81bf519",
      platform: "darwin-arm64",
      accountAlias: "pdd-account-a",
      shopAlias: "shop-a",
      outcome: "pass",
      actor: "operator",
      acceptedAt: "2026-06-24T08:00:00.000Z",
      evidenceSummary: "cookie=abc; raw buyer phone 13800138000",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("evidenceSummary contains disallowed sensitive data");
  });

  it("fails release coverage when blocking capabilities lack passing evidence", () => {
    const result = validateAcceptanceRecordSet({
      commitSha: "81bf519",
      platform: "darwin-arm64",
      records: buildDefaultAcceptanceSkeleton({
        commitSha: "81bf519",
        platform: "darwin-arm64",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("pdd-real-merchant-operations is missing passing evidence for pdd-account-a/shop-a");
  });

  it("rejects generated-only pass records until an operator approves them", () => {
    const records = buildDefaultAcceptanceSkeleton({
      commitSha: "81bf519",
      platform: "darwin-arm64",
    }).map((record) => ({
      ...record,
      outcome: "pass" as const,
      actor: "generated" as const,
      evidenceSummary: "Machine-observed candidate evidence.",
    }));

    const result = validateAcceptanceRecordSet({
      commitSha: "81bf519",
      platform: "darwin-arm64",
      records,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("pdd-real-merchant-operations is missing passing evidence for pdd-account-a/shop-a");
  });

  it("resolves a single accepted implementation commit from release-scoped evidence", () => {
    const records = buildDefaultAcceptanceSkeleton({
      commitSha: "accepted-commit",
      tag: "v1.0.3",
      platform: "darwin-arm64",
    }).map((record) => ({ ...record, outcome: "pass" as const, actor: "operator" as const, evidenceSummary: "Passed." }));

    expect(resolveAcceptanceCommitSha(records)).toEqual({ ok: true, commitSha: "accepted-commit", errors: [] });
  });

  it("rejects release-scoped evidence that mixes accepted implementation commits", () => {
    const records = buildDefaultAcceptanceSkeleton({
      commitSha: "accepted-commit-a",
      tag: "v1.0.3",
      platform: "darwin-arm64",
    }).map((record, index) => ({
      ...record,
      commitSha: index === 0 ? "accepted-commit-b" : record.commitSha,
      outcome: "pass" as const,
      actor: "operator" as const,
      evidenceSummary: "Passed.",
    }));

    expect(resolveAcceptanceCommitSha(records)).toEqual({
      ok: false,
      errors: ["acceptance evidence must reference exactly one implementation commit; found accepted-commit-a, accepted-commit-b"],
    });
  });
});
