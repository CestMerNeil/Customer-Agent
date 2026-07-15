## Context

`v1.0.3` proved that this repository can build and publish macOS ARM64 and Windows x64 artifacts, but later workflow dispatches rebuilt branch HEAD and uploaded those binaries under the existing tag. The accepted implementation commit, tag commit, build commit, package version, and published assets therefore diverged. The current gate permits any descendant of an accepted commit, even when application or build behavior changed.

The release audit also found an end-of-life Electron runtime, unsandboxed Playwright Chromium contexts that load real PDD pages, missing renderer navigation/CSP/IPC sender restrictions, a master encryption key stored beside the encrypted database, production dependency advisories, a packaged version label that renders `0.0.0`, a macOS-only hardcoded data path, and smoke checks that do not launch the packaged app. The repository contract requires real sanitized evidence and does not allow Mock PDD or Seam A/B/C to substitute for business acceptance.

The first target is a zero-cost `v1.0.4` prerelease. Signed stable distribution remains a separate mode because certificate purchase and platform account setup are external decisions.

## Goals / Non-Goals

**Goals:**

- Make a release identity reproducible and prevent existing tags or versions from being overwritten.
- Preserve committed sanitized evidence without allowing arbitrary descendant code changes to inherit acceptance.
- Bring the shipped Electron/PDD browser boundary and secret storage to a defensible public-preview baseline.
- Make packaged smoke and real acceptance prove the final application behavior on supported platforms.
- Fix the two confirmed Settings metadata defects and document the actual user-facing distribution contract.
- Keep the implementation inside the existing Electron + TypeScript stack and reuse current scripts and validators.

**Non-Goals:**

- Add customer-service features or redesign the UI.
- Add Linux, Windows ARM, or Intel macOS artifacts.
- Purchase certificates or enroll in paid platform programs.
- Replace Playwright, electron-builder, GitHub Releases, or the current local-model architecture.
- Treat helper tests or mocked external boundaries as business acceptance.

## Decisions

### 1. Use an accepted implementation commit plus an evidence-only release commit

Real acceptance records cannot be committed into the same Git commit whose SHA they reference. The gate will therefore model two commits:

- `acceptedCommit`: the exact implementation/package candidate exercised by operators.
- `releaseCommit`: the tagged descendant containing only sanitized acceptance/calibration evidence and release-readiness documentation.

The gate will reject the relationship unless `acceptedCommit` is an ancestor and every changed path is in a small allowlist under the parity acceptance/calibration and release-readiness documentation directories. Application code, package manifests, lockfiles, workflows, scripts, icons, and builder inputs are never allowed between the two commits. The release manifest records both SHAs, while the packaged application inputs remain byte-equivalent to the accepted candidate.

Alternative considered: require acceptance records to reference the release commit itself. This creates an unsatisfiable self-reference when evidence is committed. External evidence storage would avoid that cycle but adds a new service and is unnecessary for this release.

### 2. Formal publishing is tag-driven and immutable

Manual workflow dispatch remains available for non-publishing build artifacts. A formal GitHub Release is created only from a new `v*` tag. The workflow validates that the tag equals `v${apps/desktop/package.json.version}`, that the tag resolves to the checked-out release commit, and that neither the tag nor release assets are being republished.

`v1.0.3` remains historical and is marked superseded; it is not moved or overwritten. A failed `v1.0.4` publish is withdrawn or followed by a new patch version rather than rebuilding the same version.

### 3. Keep unsigned preview and signed stable as explicit modes

`v1.0.4` is published as a GitHub prerelease when platform signing is unavailable. Release notes must state Gatekeeper/SmartScreen limitations and provide checksum/manual-install instructions. macOS automatic update is disabled for unsigned builds; users update manually from GitHub Releases. Windows update behavior remains enabled only if the packaged update path is verified.

Stable release mode requires Windows signing plus macOS Developer ID signing/notarization. Existing preflight and notarization scripts are reused rather than introducing another packaging system.

### 4. Upgrade and harden the existing runtime boundary

Electron moves from 34 to a currently supported stable line, targeting Electron 43 for this change. The upgrade is validated through the existing typecheck/test/build gates plus packaged launch checks.

All real PDD Playwright contexts stop passing `--no-sandbox`. The main renderer adds a restrictive CSP, denies unexpected navigation and new-window creation, and uses the shared IPC registration wrapper to validate the sender before privileged handlers run. These controls are centralized in the existing window/IPC setup instead of adding a security framework.

### 5. Protect the master key with Electron `safeStorage`

The database continues to use the existing AES-256-GCM `SecretBox`; only key custody changes. Electron main creates or loads a random master key whose stored form is encrypted with `safeStorage`. On first upgraded launch, a legacy plaintext `session-secret.key` is read once, rewrapped, verified by decrypting stored secrets, and removed only after successful migration. If OS-backed encryption is unavailable or migration fails, the app stops credential-dependent operations and shows a recoverable diagnostic instead of silently generating a new key.

This is smaller than replacing the database or adding a native credential dependency, and it preserves existing encrypted values.

### 6. Remove avoidable dependency risk before adding machinery

The implementation first deletes unused dependencies and moves build-only packages out of production dependencies. Remaining affected packages are upgraded to patched versions. Release CI runs production audit at high severity and the full tree at critical severity; an exception requires a committed, capability-specific rationale and is not the default path.

### 7. Expose authoritative application metadata through IPC

The renderer uses the main process as the source of truth. The existing update status supplies the application version, and a minimal app-info IPC response supplies `app.getPath("userData")` and distribution mode. No platform path or build version is hardcoded in the renderer.

### 8. Separate automated package launch from real business acceptance

Packaged smoke on both CI platforms must launch the generated application, wait for an explicit ready signal, verify packaged Playwright/update resources, and exit cleanly. It does not claim PDD, model, or Agent acceptance.

Operators then execute sanitized clean-machine acceptance for install, launch, PDD calibration, review-workspace edit-to-send, local model, update/restart, logout, and uninstall/data-retention behavior. Records bind to `acceptedCommit`, tag candidate, platform, aliases, actor, and timestamp.

### 9. Apply least privilege to the release workflow

Package jobs receive `contents: read`; only the publish job receives `contents: write`. The repository default workflow permission moves to read, and a protected release environment plus main/tag protection is documented as an external configuration gate. Existing action versions are pinned to immutable SHAs during implementation.

### 10. Reconcile governance only after evidence is real

Stale Mock/Seam reports and active main-spec requirements are removed through the already completed parity delta and archive workflow, not by creating another competing delta. Completed legacy changes are archived only after current calibration, acceptance, UI task 5.5, and release-readiness documents agree.

## Risks / Trade-offs

- [Risk] Electron 43 introduces breaking runtime behavior. → Upgrade in a dedicated task, run the existing suite after each required code adjustment, then repeat packaged launch and real PDD login/session checks.
- [Risk] Removing `--no-sandbox` changes PDD automation behavior on some machines. → Treat any platform failure as blocked and diagnose the launch environment; do not restore the flag as a release shortcut.
- [Risk] Secret-key migration could make stored sessions unreadable. → Keep the legacy key until rewrap and decrypt verification succeed, make migration idempotent, and document rollback before deletion.
- [Risk] Allowlisted evidence-only descendants can drift if the allowlist is broad. → Allow explicit files/directories only and add negative tests for application, workflow, package, lockfile, script, and asset changes.
- [Risk] Unsigned prerelease installation is confusing and macOS auto-update is unavailable. → Label the release as prerelease, show manual steps, and avoid claiming trusted or automatic macOS distribution.
- [Risk] Real acceptance requires accounts, test-buyer paths, and operator actions. → Leave capabilities blocked when prerequisites are unavailable; never replace them with mocks.

## Migration Plan

1. Implement runtime, dependency, Settings, workflow, and release-gate changes while keeping package version pre-release-only.
2. Upgrade existing local data through the safeStorage key migration and verify rollback on copied test data without committing secrets.
3. Set package version `1.0.4`, produce fresh unsigned candidate artifacts, and identify `acceptedCommit`.
4. Run current PDD calibration and full macOS ARM64/Windows x64 packaged acceptance against `acceptedCommit`.
5. Commit only sanitized evidence/readiness files as the evidence-only `releaseCommit`; run strict diff, audit, OpenSpec, build, packaged launch, leak, manifest, calibration, and release gates.
6. Create a new `v1.0.4` tag at `releaseCommit` and publish it as a prerelease. Do not overwrite `v1.0.3` or any existing asset.
7. Verify release assets, checksums, update metadata, install instructions, and the GitHub release page; mark `v1.0.3` superseded.
8. Reconcile and archive completed OpenSpec changes after the release evidence and active specs agree.

Rollback: before publication, delete only the failed draft release/tag and fix forward. After any public download, do not move or reuse the tag; mark the release withdrawn and publish the next patch version.

## Open Questions

- None for proposal readiness. Intel macOS and paid signing remain explicit later decisions rather than blockers for the unsigned `v1.0.4` prerelease.
