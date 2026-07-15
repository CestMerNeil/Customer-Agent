## Why

The desktop app can already build and publish macOS and Windows artifacts, but the current `v1.0.3` release does not preserve a verifiable relationship between package version, Git tag, source commit, real acceptance evidence, and published binaries. The next release must close that provenance gap and address the concrete security, packaged-runtime, and user-visible defects found in the release audit before the app is promoted beyond preview use.

## What Changes

- Prepare `v1.0.4` as a new immutable release instead of overwriting `v1.0.3`; validate package version, release tag, build SHA, checksums, update metadata, and accepted implementation SHA as one release identity.
- Make formal release gates reject stale ancestor evidence by default; an evidence-only descendant is allowed only when every intervening path is explicitly allowlisted and excluded from packaged application inputs.
- Require current, sanitized PDD calibration plus macOS and Windows acceptance records for the final candidate.
- Complete real packaged-app verification: clean install, launch, review-workspace edit-to-send flow, update behavior, restart, and uninstall/data-retention checks on the supported platforms.
- Move Electron onto a currently supported release line, remove `--no-sandbox` from real PDD browser contexts, add renderer navigation/CSP/IPC-sender protections, and use OS-backed protection for persisted secrets.
- Resolve production dependency advisories and remove or demote unused build/runtime dependencies instead of carrying avoidable vulnerable code into the package.
- Fix the packaged Settings page so it displays the real application version and the real platform-specific user-data directory.
- Define two honest distribution modes: unsigned builds are published only as prereleases with manual-install/update warnings; a stable public release requires the configured platform signing and macOS notarization gates.
- Tighten GitHub release permissions and prevent manual workflows from publishing branch HEAD artifacts into an existing tag.
- Reconcile OpenSpec tasks, calibration/acceptance records, active specifications, and stale Mock/Seam reports before archiving completed changes.

## Capabilities

### New Capabilities

- `desktop-release-integrity`: Defines immutable release identity, exact-SHA evidence, supported-runtime security, packaged acceptance, distribution modes, and end-user release metadata for desktop releases.

### Modified Capabilities

None. Existing completed parity deltas will be reconciled and archived rather than duplicated in this change.

## Impact

- Affected release automation: `.github/workflows/build-desktop.yml`, repository/tag protections, release-gate and calibration scripts.
- Affected desktop runtime: Electron version, BrowserWindow security, PDD Playwright launch options, IPC validation, secret storage, updater behavior, Settings UI, and packaging metadata.
- Affected verification: current-commit PDD calibration, exact-SHA acceptance records, clean-machine packaged acceptance, dependency audit, and OpenSpec closeout.
- Affected documentation: release notes, supported platform/architecture matrix, first-use download and storage requirements, unsigned-install limitations, privacy/data-retention guidance, and checksum instructions.
- Out of scope: new customer-service features, broad UI redesign, Linux support, Intel macOS support unless explicitly selected, purchasing certificates, or replacing the Electron + TypeScript architecture.
