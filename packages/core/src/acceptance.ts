export type AcceptanceCapability =
  | "pdd-real-merchant-operations"
  | "auditable-agent-workflow"
  | "local-model-runtime-provisioning"
  | "knowledge-product-governance"
  | "message-queue-concurrency"
  | "multi-shop-operations"
  | "desktop-operations-workspace"
  | "real-acceptance-release-gates"
  | "secret-safety-governance";

export type AcceptanceOutcome = "pass" | "fail" | "blocked";
export type AcceptanceActor = "generated" | "operator" | "ci";
export type RequiredAcceptanceScope = "two-shop" | "platform";

export interface AcceptanceScopeAlias {
  accountAlias: string;
  shopAlias: string;
}

export interface AcceptanceCapabilityMatrixRow {
  capability: AcceptanceCapability;
  releaseBlocking: true;
  requiredScopes: RequiredAcceptanceScope;
}

export interface AcceptanceRecord {
  capability: AcceptanceCapability;
  commitSha: string;
  version?: string;
  tag?: string;
  platform: string;
  accountAlias: string;
  shopAlias: string;
  outcome: AcceptanceOutcome;
  actor: AcceptanceActor;
  acceptedAt: string;
  evidenceSummary: string;
  blockers?: string[];
  notes?: string;
}

export interface AcceptanceValidationResult {
  ok: boolean;
  errors: string[];
}

export interface AcceptanceCommitResolutionResult {
  ok: boolean;
  commitSha?: string;
  errors: string[];
}

export interface BuildAcceptanceSkeletonRequest {
  commitSha: string;
  version?: string;
  tag?: string;
  platform: string;
  acceptedAt?: string;
}

export interface ValidateAcceptanceRecordSetRequest {
  commitSha: string;
  platform: string;
  records: AcceptanceRecord[];
}

const releaseCapabilityMatrix: AcceptanceCapabilityMatrixRow[] = [
  { capability: "pdd-real-merchant-operations", releaseBlocking: true, requiredScopes: "two-shop" },
  { capability: "auditable-agent-workflow", releaseBlocking: true, requiredScopes: "two-shop" },
  { capability: "local-model-runtime-provisioning", releaseBlocking: true, requiredScopes: "platform" },
  { capability: "knowledge-product-governance", releaseBlocking: true, requiredScopes: "two-shop" },
  { capability: "message-queue-concurrency", releaseBlocking: true, requiredScopes: "two-shop" },
  { capability: "multi-shop-operations", releaseBlocking: true, requiredScopes: "two-shop" },
  { capability: "desktop-operations-workspace", releaseBlocking: true, requiredScopes: "platform" },
  { capability: "real-acceptance-release-gates", releaseBlocking: true, requiredScopes: "platform" },
  { capability: "secret-safety-governance", releaseBlocking: true, requiredScopes: "platform" },
];

const allowedCapabilities = new Set<AcceptanceCapability>(releaseCapabilityMatrix.map((row) => row.capability));
const allowedOutcomes = new Set<AcceptanceOutcome>(["pass", "fail", "blocked"]);
const allowedActors = new Set<AcceptanceActor>(["generated", "operator", "ci"]);
export function createDefaultAcceptanceScopes(): AcceptanceScopeAlias[] {
  return [
    { accountAlias: "pdd-account-a", shopAlias: "shop-a" },
    { accountAlias: "pdd-account-b", shopAlias: "shop-b" },
  ];
}

export function createReleaseCapabilityMatrix(): AcceptanceCapabilityMatrixRow[] {
  return releaseCapabilityMatrix.map((row) => ({ ...row }));
}

export function buildDefaultAcceptanceSkeleton(request: BuildAcceptanceSkeletonRequest): AcceptanceRecord[] {
  const acceptedAt = request.acceptedAt ?? new Date(0).toISOString();
  return createReleaseCapabilityMatrix().flatMap((row) =>
    createDefaultAcceptanceScopes().map((scope) => ({
      capability: row.capability,
      commitSha: request.commitSha,
      ...(request.version ? { version: request.version } : {}),
      ...(request.tag ? { tag: request.tag } : {}),
      platform: request.platform,
      accountAlias: scope.accountAlias,
      shopAlias: scope.shopAlias,
      outcome: "blocked" as const,
      actor: "generated" as const,
      acceptedAt,
      evidenceSummary: `Awaiting real acceptance for ${row.capability}.`,
      blockers: ["real-acceptance-not-recorded"],
    })),
  );
}

export function validateAcceptanceRecord(record: AcceptanceRecord): AcceptanceValidationResult {
  const errors: string[] = [];
  requireNonEmpty(errors, record.capability, "capability");
  requireNonEmpty(errors, record.commitSha, "commitSha");
  requireNonEmpty(errors, record.platform, "platform");
  requireNonEmpty(errors, record.accountAlias, "accountAlias");
  requireNonEmpty(errors, record.shopAlias, "shopAlias");
  requireNonEmpty(errors, record.acceptedAt, "acceptedAt");
  requireNonEmpty(errors, record.evidenceSummary, "evidenceSummary");

  if (!allowedCapabilities.has(record.capability)) {
    errors.push(`capability is not release-gated: ${record.capability}`);
  }
  if (!allowedOutcomes.has(record.outcome)) {
    errors.push(`outcome is invalid: ${record.outcome}`);
  }
  if (!allowedActors.has(record.actor)) {
    errors.push(`actor is invalid: ${record.actor}`);
  }
  if (Number.isNaN(Date.parse(record.acceptedAt))) {
    errors.push("acceptedAt must be an ISO date string");
  }

  for (const [field, value] of Object.entries(flattenRecordText(record))) {
    if (containsSensitiveData(value)) {
      errors.push(`${field} contains disallowed sensitive data`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function validateAcceptanceRecordSet(request: ValidateAcceptanceRecordSetRequest): AcceptanceValidationResult {
  const errors = request.records.flatMap((record, index) =>
    validateAcceptanceRecord(record).errors.map((error) => `records[${index}].${error}`),
  );
  const matchingRecords = request.records.filter(
    (record) => record.commitSha === request.commitSha && record.platform === request.platform,
  );

  for (const row of releaseCapabilityMatrix) {
    if (row.requiredScopes === "platform") {
      const hasPlatformPass = matchingRecords.some((record) => record.capability === row.capability && record.outcome === "pass");
      if (!hasPlatformPass) {
        errors.push(`${row.capability} is missing passing platform evidence`);
      }
      continue;
    }

    for (const scope of createDefaultAcceptanceScopes()) {
      const hasScopedPass = matchingRecords.some(
        (record) =>
          record.capability === row.capability &&
          record.accountAlias === scope.accountAlias &&
          record.shopAlias === scope.shopAlias &&
          record.outcome === "pass",
      );
      if (!hasScopedPass) {
        errors.push(`${row.capability} is missing passing evidence for ${scope.accountAlias}/${scope.shopAlias}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function resolveAcceptanceCommitSha(records: AcceptanceRecord[]): AcceptanceCommitResolutionResult {
  const commits = [...new Set(records.map((record) => record.commitSha).filter((commitSha) => commitSha.trim().length > 0))].sort();
  if (commits.length !== 1) {
    return {
      ok: false,
      errors: [`acceptance evidence must reference exactly one implementation commit; found ${commits.join(", ") || "none"}`],
    };
  }
  const [commitSha] = commits as [string];
  return { ok: true, commitSha, errors: [] };
}

function requireNonEmpty(errors: string[], value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${field} is required`);
  }
}

function flattenRecordText(record: AcceptanceRecord): Record<string, string> {
  return {
    accountAlias: record.accountAlias,
    shopAlias: record.shopAlias,
    evidenceSummary: record.evidenceSummary,
    notes: record.notes ?? "",
    blockers: record.blockers?.join(" ") ?? "",
  };
}

function containsSensitiveData(value: string): boolean {
  return containsSensitiveText(value);
}
import { containsSensitiveText } from "./redaction.js";
