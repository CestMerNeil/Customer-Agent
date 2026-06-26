import { createDefaultAcceptanceScopes } from "./acceptance.js";

export type PddCalibrationStatus =
  | "supported"
  | "blocked_by_account_permission"
  | "blocked_by_endpoint_drift"
  | "blocked_by_test_path"
  | "blocked_by_local_model"
  | "blocked_unknown";

export type PddCalibrationPurpose =
  | "anti-content-header"
  | "conversation-transfer"
  | "customer-service-list"
  | "goods-card-send"
  | "image-send"
  | "login-session"
  | "online-offline-status"
  | "product-detail"
  | "product-list"
  | "rate-limit-retry-signatures"
  | "session-expiry-signatures"
  | "shop-info"
  | "text-send"
  | "user-info"
  | "websocket-receive"
  | "chat-token";

export type PddCalibrationActor = "generated" | "operator" | "ci";
export type AntiContentHandling = "not-tested" | "query-param" | "header-only" | "header-plus-query";
export type BrowserHeaderProfile = "not-tested" | "pinduoduo-web" | "pinduoduo-mobile" | "custom-browser-like";
export type FailureSignature =
  | "session-expiry-43001"
  | "cookie-invalid"
  | "rate-limit-429"
  | "retryable-5xx"
  | "retryable-network"
  | "manual-relogin-required";

export interface PddCalibrationRecord {
  commitSha: string;
  version?: string;
  tag?: string;
  platform: string;
  accountAlias: string;
  shopAlias: string;
  purpose: PddCalibrationPurpose;
  status: PddCalibrationStatus;
  actor: PddCalibrationActor;
  recordedAt: string;
  evidenceSummary: string;
  parsedFieldMap: string[];
  referenceCommit: string;
  referenceComparison: "unknown" | "matched" | "drift";
  antiContentHandling?: AntiContentHandling;
  browserHeaderProfile?: BrowserHeaderProfile;
  failureSignatures?: FailureSignature[];
  errorSummary?: string;
  blockers?: string[];
  notes?: string;
}

export interface PddCalibrationValidationResult {
  ok: boolean;
  errors: string[];
}

export interface BuildPddCalibrationSkeletonRequest {
  commitSha: string;
  version?: string;
  tag?: string;
  platform: string;
  referenceCommit: string;
  recordedAt?: string;
}

export interface PddCalibrationSummary {
  commitSha: string;
  platform: string;
  referenceCommit: string;
  scopes: Array<{ accountAlias: string; shopAlias: string; recordCount: number }>;
  generatedAt: string;
  totalRecords: number;
  byStatus: Record<PddCalibrationStatus, number>;
  records: PddCalibrationRecord[];
}

const allowedStatuses = new Set<PddCalibrationStatus>([
  "supported",
  "blocked_by_account_permission",
  "blocked_by_endpoint_drift",
  "blocked_by_test_path",
  "blocked_by_local_model",
  "blocked_unknown",
]);
const allowedActors = new Set<PddCalibrationActor>(["generated", "operator", "ci"]);
const allowedReferenceComparison = new Set<PddCalibrationRecord["referenceComparison"]>(["unknown", "matched", "drift"]);
const allowedPurposes: ReadonlyArray<PddCalibrationPurpose> = [
  "anti-content-header",
  "conversation-transfer",
  "customer-service-list",
  "goods-card-send",
  "image-send",
  "login-session",
  "online-offline-status",
  "product-detail",
  "product-list",
  "rate-limit-retry-signatures",
  "session-expiry-signatures",
  "shop-info",
  "text-send",
  "user-info",
  "websocket-receive",
  "chat-token",
];
const disallowedSensitivePatterns = [
  /\bcookie\b/i,
  /\btoken\b/i,
  /\bapi[-_ ]?key\b/i,
  /\bpassword\b/i,
  /\banti[-_]?content\b/i,
  /\braw\s+payload\b/i,
  /\braw\s+buyer\b/i,
  /1[3-9]\d{9}/,
];

function createDefaultPddCalibrationRecords(): Array<Pick<PddCalibrationRecord, "accountAlias" | "shopAlias" | "purpose">> {
  return createDefaultAcceptanceScopes().flatMap((scope) =>
    allowedPurposes.map((purpose) => ({
      accountAlias: scope.accountAlias,
      shopAlias: scope.shopAlias,
      purpose,
    })),
  );
}

export function buildDefaultPddCalibrationSkeleton(request: BuildPddCalibrationSkeletonRequest): PddCalibrationRecord[] {
  const recordedAt = request.recordedAt ?? new Date(0).toISOString();
  return createDefaultPddCalibrationRecords().map((record) => {
    const calibrationRecord: PddCalibrationRecord = {
      commitSha: request.commitSha,
      ...(request.version ? { version: request.version } : {}),
      ...(request.tag ? { tag: request.tag } : {}),
      platform: request.platform,
      accountAlias: record.accountAlias,
      shopAlias: record.shopAlias,
      purpose: record.purpose,
      status: "blocked_by_test_path",
      actor: "generated",
      recordedAt,
      evidenceSummary: "No live calibration has been recorded for this PDD capability.",
      parsedFieldMap: [],
      referenceCommit: request.referenceCommit,
      referenceComparison: "unknown",
      failureSignatures: [],
      blockers: ["calibration-not-run"],
    };
    if (record.purpose === "anti-content-header") {
      calibrationRecord.antiContentHandling = "not-tested";
      calibrationRecord.browserHeaderProfile = "not-tested";
    }
    return calibrationRecord;
  });
}

export function summarizePddCalibrationRecords(records: PddCalibrationRecord[]): PddCalibrationSummary {
  const summaryMap: Record<PddCalibrationStatus, number> = {
    supported: 0,
    blocked_by_account_permission: 0,
    blocked_by_endpoint_drift: 0,
    blocked_by_test_path: 0,
    blocked_by_local_model: 0,
    blocked_unknown: 0,
  };
  for (const record of records) {
    summaryMap[record.status] += 1;
  }
  const firstRecord = records[0];
  const commitSha = firstRecord?.commitSha ?? "";
  const platform = firstRecord?.platform ?? "";
  const referenceCommit = firstRecord?.referenceCommit ?? "";
  const scopeMap = new Map<string, { accountAlias: string; shopAlias: string; recordCount: number }>();
  for (const record of records) {
    const scopeKey = `${record.accountAlias}/${record.shopAlias}`;
    const existing = scopeMap.get(scopeKey);
    if (existing) {
      existing.recordCount += 1;
    } else {
      scopeMap.set(scopeKey, {
        accountAlias: record.accountAlias,
        shopAlias: record.shopAlias,
        recordCount: 1,
      });
    }
  }
  const byStatus = { ...summaryMap };
  return {
    commitSha,
    platform,
    referenceCommit,
    scopes: Array.from(scopeMap.values()),
    generatedAt: new Date().toISOString(),
    totalRecords: records.length,
    byStatus,
    records,
  };
}

export function validatePddCalibrationRecordSet(records: PddCalibrationRecord[]): PddCalibrationValidationResult {
  return validatePddCalibrationRecordList(records);
}

export function validatePddCalibrationRecord(record: PddCalibrationRecord): PddCalibrationValidationResult {
  const errors: string[] = [];
  requireNonEmpty(errors, record.commitSha, "commitSha");
  requireNonEmpty(errors, record.platform, "platform");
  requireNonEmpty(errors, record.accountAlias, "accountAlias");
  requireNonEmpty(errors, record.shopAlias, "shopAlias");
  requireNonEmpty(errors, record.recordedAt, "recordedAt");
  requireNonEmpty(errors, record.referenceCommit, "referenceCommit");
  requireNonEmpty(errors, record.evidenceSummary, "evidenceSummary");
  requireNonEmpty(errors, record.purpose, "purpose");
  if (record.parsedFieldMap.length === 0 && record.status === "supported") {
    errors.push("supported status requires parsedFieldMap entries");
  }
  validatePurposeConstraints(errors, record);
  if (!allowedStatuses.has(record.status)) {
    errors.push(`status is invalid: ${record.status}`);
  }
  if (!allowedActors.has(record.actor)) {
    errors.push(`actor is invalid: ${record.actor}`);
  }
  if (!allowedReferenceComparison.has(record.referenceComparison)) {
    errors.push(`referenceComparison is invalid: ${record.referenceComparison}`);
  }
  if (record.status === "supported" && record.referenceComparison === "drift") {
    errors.push("supported status cannot be marked as drift");
  }
  if (Number.isNaN(Date.parse(record.recordedAt))) {
    errors.push("recordedAt must be an ISO date string");
  }
  if (!allowedPurposes.includes(record.purpose)) {
    errors.push(`purpose is not allowed: ${record.purpose}`);
  }

  for (const [field, value] of Object.entries(flattenRecordText(record))) {
    if (containsSensitiveData(value)) {
      errors.push(`${field} contains disallowed sensitive data`);
    }
  }
  for (const parsedField of record.parsedFieldMap) {
    if (containsSensitiveData(parsedField)) {
      errors.push(`parsedFieldMap item contains disallowed sensitive data: ${parsedField}`);
    }
  }
  for (const signature of record.failureSignatures ?? []) {
    if (!allowedFailureSignatures.has(signature)) {
      errors.push(`failureSignatures contains invalid value: ${signature}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function validatePurposeConstraints(errors: string[], record: PddCalibrationRecord): void {
  if (record.purpose === "anti-content-header") {
    if (record.status !== "blocked_by_test_path" && (!record.antiContentHandling || record.antiContentHandling === "not-tested")) {
      errors.push("anti-content-header requires a concrete antiContentHandling value");
    }
    if (record.status !== "blocked_by_test_path" && (!record.browserHeaderProfile || record.browserHeaderProfile === "not-tested")) {
      errors.push("anti-content-header requires a concrete browserHeaderProfile value");
    }
  }
  if (record.purpose === "session-expiry-signatures" || record.purpose === "rate-limit-retry-signatures") {
    if ((record.status === "blocked_by_test_path" || record.status === "blocked_unknown") && !record.blockers?.length) {
      errors.push(`${record.purpose} requires blockers or failure signatures when still blocked`);
    }
    if (record.status === "supported" && !record.parsedFieldMap.length) {
      errors.push(`${record.purpose} requires parsedFieldMap entries when status is supported`);
    }
  }
}

const allowedFailureSignatures = new Set<FailureSignature>([
  "session-expiry-43001",
  "cookie-invalid",
  "rate-limit-429",
  "retryable-5xx",
  "retryable-network",
  "manual-relogin-required",
]);

function validatePddCalibrationRecordList(records: PddCalibrationRecord[]): PddCalibrationValidationResult {
  return {
    ok: records.flatMap((record, index) => validatePddCalibrationRecord(record).errors.map((error) => `records[${index}].${error}`))
      .length === 0,
    errors: records.flatMap((record, index) => validatePddCalibrationRecord(record).errors.map((error) => `records[${index}].${error}`)),
  };
}

function requireNonEmpty(errors: string[], value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${field} is required`);
  }
}

function flattenRecordText(record: PddCalibrationRecord): Record<string, string> {
  return {
    accountAlias: record.accountAlias,
    shopAlias: record.shopAlias,
    evidenceSummary: record.evidenceSummary,
    notes: record.notes ?? "",
    blockers: record.blockers?.join(" ") ?? "",
    errorSummary: record.errorSummary ?? "",
  };
}

function containsSensitiveData(value: string): boolean {
  return disallowedSensitivePatterns.some((pattern) => pattern.test(value));
}
