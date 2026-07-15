/** Describes the commits and metadata that identify one desktop release. */
export interface ReleaseIdentityInput {
  acceptedCommit: string;
  releaseCommit: string;
  tag: string;
  packageVersion: string;
  changedPaths: string[];
}

/** Reports whether a release identity can safely reuse real acceptance evidence. */
export interface ReleaseIdentityValidationResult {
  ok: boolean;
  errors: string[];
}

/** Describes the GitHub state that must be true before creating a release. */
export interface ReleasePublishTargetInput {
  tag: string;
  tagCommit: string;
  workflowCommit: string;
  existingReleaseStatus: string;
}

/** Lists the only paths permitted after real acceptance has completed. */
const evidenceOnlyPathPrefixes = [
  "openspec/changes/implement-reference-feature-parity/acceptance/",
  "openspec/changes/implement-reference-feature-parity/calibration/",
  "openspec/changes/implement-reference-feature-parity/calibration-summary/",
] as const;

/** Matches the versioned readiness document allowed after real acceptance. */
const readinessDocumentPattern = /^openspec\/changes\/implement-reference-feature-parity\/release-readiness-v[^/]+\.md$/;

/**
 * Validates the relationship between an accepted implementation and its tagged release commit.
 *
 * @param input - The release commits, version metadata, and paths changed between them.
 * @returns Validation errors when the tag, version, or evidence-only diff is unsafe.
 */
export function validateReleaseIdentity(input: ReleaseIdentityInput): ReleaseIdentityValidationResult {
  const errors: string[] = [];
  const expectedTag = `v${input.packageVersion}`;
  if (input.tag !== expectedTag) {
    errors.push(`release tag ${input.tag || "<missing>"} must equal ${expectedTag}`);
  }
  if (!input.acceptedCommit.trim()) {
    errors.push("accepted implementation commit is required");
  }
  if (!input.releaseCommit.trim()) {
    errors.push("release commit is required");
  }
  for (const changedPath of input.changedPaths) {
    if (!isEvidenceOnlyReleasePath(changedPath)) {
      errors.push(`release commit contains non-evidence change: ${changedPath}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Returns whether a changed path is safe to add after real acceptance is complete.
 *
 * @param filePath - Repository-relative path changed between accepted and release commits.
 * @returns Whether the path contains only sanitized evidence or release-readiness content.
 */
export function isEvidenceOnlyReleasePath(filePath: string): boolean {
  return evidenceOnlyPathPrefixes.some((prefix) => filePath.startsWith(prefix)) || readinessDocumentPattern.test(filePath);
}

/**
 * Validates that a workflow targets its tag commit and no GitHub Release already exists.
 *
 * @param input - Tag, workflow commit, and GitHub release lookup result.
 * @returns Validation errors when publishing could overwrite or mislabel a release.
 */
export function validateReleasePublishTarget(input: ReleasePublishTargetInput): ReleaseIdentityValidationResult {
  const errors: string[] = [];
  if (!input.tag.trim()) {
    errors.push("release tag is required");
  }
  if (input.tagCommit !== input.workflowCommit) {
    errors.push(`release tag ${input.tag} does not resolve to the workflow commit`);
  }
  if (input.existingReleaseStatus !== "404") {
    errors.push(`GitHub Release already exists for ${input.tag} (HTTP ${input.existingReleaseStatus})`);
  }
  return { ok: errors.length === 0, errors };
}
