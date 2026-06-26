import { describe, expect, it } from "vitest";
import {
  buildDefaultPddCalibrationSkeleton,
  summarizePddCalibrationRecords,
  validatePddCalibrationRecord,
  validatePddCalibrationRecordSet,
} from "./calibration.js";
import type { PddCalibrationRecord } from "./calibration.js";

describe("pdd calibration evidence", () => {
  const request = {
    commitSha: "0123456789abcdef",
    platform: "darwin-arm64",
    referenceCommit: "59467291c64dd69335d3e52612e38556a1833865",
  };

  it("builds a default template for all scope/purpose combinations", () => {
    const records = buildDefaultPddCalibrationSkeleton(request);
    expect(records).toHaveLength(32);
    expect(records[0]?.referenceCommit).toBe(request.referenceCommit);
    expect(records.some((record) => record.purpose === "login-session")).toBe(true);
    expect(records.some((record) => record.purpose === "anti-content-header" && record.antiContentHandling === "not-tested")).toBe(true);
    expect(records[0]?.status).toBe("blocked_by_test_path");
  });

  it("validates a generated template as valid", () => {
    const records = buildDefaultPddCalibrationSkeleton(request);
    const result = validatePddCalibrationRecordSet(records);
    expect(result.ok).toBe(true);
  });

  it("rejects records with sensitive text in evidence", () => {
    const records = buildDefaultPddCalibrationSkeleton(request);
    const recordIndex = records.findIndex((record) => record.purpose === "login-session");
    const targetRecord = requireRecord(records[recordIndex]);
    records[recordIndex] = {
      ...targetRecord,
      evidenceSummary: "token=abc found on login",
      status: "supported",
      parsedFieldMap: ["goods_id"],
      referenceComparison: "matched",
    };
    const result = validatePddCalibrationRecordSet(records);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/evidenceSummary contains disallowed sensitive data/);
  });

  it("rejects supported calibration without parsed fields", () => {
    const records = buildDefaultPddCalibrationSkeleton(request);
    const invalid: PddCalibrationRecord = {
      ...requireRecord(records[0]),
      status: "supported",
      parsedFieldMap: [],
    };
    const result = validatePddCalibrationRecord(invalid);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("supported status requires parsedFieldMap entries");
  });

  it("requires anti-content handling details when anti-content is marked supported", () => {
    const records = buildDefaultPddCalibrationSkeleton(request);
    const antiContentRecord = requireRecord(records.find((record) => record.purpose === "anti-content-header"));
    const withUnsupportedState: PddCalibrationRecord = {
      ...antiContentRecord,
      status: "supported",
      parsedFieldMap: ["anti_content", "browser_headers"],
      antiContentHandling: "not-tested",
      browserHeaderProfile: "not-tested",
      referenceComparison: "matched",
    };
    const result = validatePddCalibrationRecord(withUnsupportedState);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("anti-content-header requires a concrete antiContentHandling value");
  });

  it("validates rate-limit/session signatures with blocked reasons", () => {
    const records = buildDefaultPddCalibrationSkeleton(request);
    const rateLimitRecord = requireRecord(records.find((record) => record.purpose === "rate-limit-retry-signatures"));
    const updated: PddCalibrationRecord = {
      ...rateLimitRecord,
      status: "blocked_by_endpoint_drift",
      blockers: ["request-limits-unknown"],
      failureSignatures: ["rate-limit-429", "retryable-network"],
      parsedFieldMap: ["status", "retry_after"],
    };
    const result = validatePddCalibrationRecord(updated);
    expect(result.ok).toBe(true);

    const invalidSignature = {
      ...updated,
      failureSignatures: ["unknown_signature"],
    } as unknown as PddCalibrationRecord;
    const invalidResult = validatePddCalibrationRecord(invalidSignature);
    expect(invalidResult.ok).toBe(false);
    expect(invalidResult.errors).toContain("failureSignatures contains invalid value: unknown_signature");
  });

  it("builds a summary that counts status buckets", () => {
    const records = buildDefaultPddCalibrationSkeleton(request);
    requireRecord(records[0]).status = "supported";
    requireRecord(records[1]).status = "supported";
    requireRecord(records[2]).status = "blocked_by_endpoint_drift";
    const summary = summarizePddCalibrationRecords(records);
    expect(summary.totalRecords).toBe(32);
    expect(summary.byStatus.supported).toBe(2);
    expect(summary.byStatus.blocked_by_endpoint_drift).toBe(1);
    expect(summary.byStatus.blocked_by_test_path).toBe(29);
    expect(summary.scopes).toHaveLength(2);
  });
});

function requireRecord(record: PddCalibrationRecord | undefined): PddCalibrationRecord {
  if (!record) {
    throw new Error("Expected calibration record to exist.");
  }
  return record;
}
