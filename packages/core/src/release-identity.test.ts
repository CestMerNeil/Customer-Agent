import { describe, expect, it } from "vitest";
import {
  isEvidenceOnlyReleasePath,
  validateReleaseIdentity,
  validateReleasePublishTarget,
} from "./release-identity.js";

describe("release identity", () => {
  it("accepts an exact accepted commit with the matching tag", () => {
    expect(validateReleaseIdentity({
      acceptedCommit: "accepted",
      releaseCommit: "accepted",
      tag: "v1.0.4",
      packageVersion: "1.0.4",
      changedPaths: [],
    })).toEqual({ ok: true, errors: [] });
  });

  it("accepts only sanitized evidence and readiness paths after acceptance", () => {
    expect(validateReleaseIdentity({
      acceptedCommit: "accepted",
      releaseCommit: "evidence",
      tag: "v1.0.4",
      packageVersion: "1.0.4",
      changedPaths: [
        "openspec/changes/implement-reference-feature-parity/acceptance/release-v1.0.4-win32-x64.json",
        "openspec/changes/implement-reference-feature-parity/calibration/pdd-v1.0.4.json",
        "openspec/changes/implement-reference-feature-parity/calibration-summary/pdd-v1.0.4.json",
        "openspec/changes/implement-reference-feature-parity/release-readiness-v1.0.4.md",
      ],
    })).toEqual({ ok: true, errors: [] });
  });

  it("rejects tag mismatches and application changes after acceptance", () => {
    expect(validateReleaseIdentity({
      acceptedCommit: "accepted",
      releaseCommit: "release",
      tag: "v1.0.3",
      packageVersion: "1.0.4",
      changedPaths: ["apps/desktop/src/main/index.ts", "pnpm-lock.yaml"],
    })).toEqual({
      ok: false,
      errors: [
        "release tag v1.0.3 must equal v1.0.4",
        "release commit contains non-evidence change: apps/desktop/src/main/index.ts",
        "release commit contains non-evidence change: pnpm-lock.yaml",
      ],
    });
  });

  it("exposes the narrow evidence-only path boundary", () => {
    expect(isEvidenceOnlyReleasePath("openspec/changes/implement-reference-feature-parity/acceptance/record.json")).toBe(true);
    expect(isEvidenceOnlyReleasePath("apps/desktop/package.json")).toBe(false);
  });

  it("rejects reused releases and tag commits that differ from the workflow commit", () => {
    expect(validateReleasePublishTarget({
      tag: "v1.0.4",
      tagCommit: "tagged",
      workflowCommit: "built",
      existingReleaseStatus: "200",
    })).toEqual({
      ok: false,
      errors: [
        "release tag v1.0.4 does not resolve to the workflow commit",
        "GitHub Release already exists for v1.0.4 (HTTP 200)",
      ],
    });
  });
});
