## ADDED Requirements

### Requirement: Immutable desktop release identity
The release system SHALL validate a new desktop release as one immutable identity containing the package version, Git tag, release commit, accepted implementation commit, platform, artifact names, update metadata, and checksums. It MUST NOT overwrite an existing release tag or published version.

#### Scenario: New release identity is valid
- **WHEN** a new tag equals `v${desktopPackageVersion}`, resolves to the checked-out release commit, and all artifacts and evidence reference the declared identity
- **THEN** the release gate permits publishing the new version

#### Scenario: Existing version is reused
- **WHEN** a tag, GitHub Release, or published artifact set already exists for the requested version
- **THEN** the release workflow fails before uploading or replacing assets

#### Scenario: Tag and package version differ
- **WHEN** the release tag does not equal `v${desktopPackageVersion}`
- **THEN** the release workflow fails before packaging or publishing

### Requirement: Evidence-only release descendants
The release gate SHALL require acceptance records to bind to the exact accepted implementation commit. A distinct release commit MUST be accepted only when every path changed after the accepted implementation commit is explicitly allowlisted as sanitized evidence or release-readiness documentation and is excluded from packaged application inputs.

#### Scenario: Evidence-only descendant is accepted
- **WHEN** the accepted implementation commit is an ancestor of the release commit and every intervening change is an allowlisted non-package evidence file
- **THEN** the gate records both SHAs and treats the packaged application inputs as equivalent to the accepted candidate

#### Scenario: Application change follows acceptance
- **WHEN** any application source, package manifest, lockfile, workflow, script, icon, builder input, or other non-allowlisted path changes after the accepted implementation commit
- **THEN** the release gate fails and requires new real acceptance evidence

#### Scenario: Acceptance commit is unrelated
- **WHEN** the accepted implementation commit is not an ancestor of the release commit
- **THEN** the release gate fails

### Requirement: Current real calibration and acceptance
The release system SHALL require sanitized real PDD calibration and passing release-blocking acceptance for the accepted implementation commit on every supported release platform. A blocked, failed, missing, stale, or generated-only business record MUST fail the release.

#### Scenario: Current evidence covers both platforms
- **WHEN** validated calibration and operator acceptance records cover the accepted implementation commit for macOS ARM64 and Windows x64 with all required capability scopes passing
- **THEN** the real-acceptance gate passes

#### Scenario: Calibration artifact is missing
- **WHEN** no validated PDD calibration report and summary exist for the accepted implementation commit
- **THEN** PDD-dependent release capabilities remain blocked and publishing fails

#### Scenario: Any business capability is blocked or failed
- **WHEN** a required scope contains a `blocked` or `fail` outcome or lacks an operator pass
- **THEN** publishing fails without substituting mock, fixture, or CI-generated evidence

### Requirement: Real packaged application verification
The release process SHALL distinguish automated packaged launch smoke from real business acceptance. CI MUST launch each supported packaged application and observe an explicit ready-and-clean-exit result; operators MUST separately validate real PDD and desktop workflows on the final candidate.

#### Scenario: Packaged application launches in CI
- **WHEN** the macOS ARM64 or Windows x64 artifact is built
- **THEN** CI launches the packaged application, observes its ready signal, verifies required packaged resources, and exits it cleanly

#### Scenario: Configuration files exist but app is not launched
- **WHEN** a smoke check only finds directories, browser resources, or update metadata without launching the application
- **THEN** the packaged launch requirement remains incomplete

#### Scenario: Clean-machine operator acceptance passes
- **WHEN** an operator installs the final candidate on a clean supported machine and completes launch, login, calibration, review edit-to-send, local-model, restart/update, logout, and uninstall/data-retention checks
- **THEN** a sanitized record is stored against the accepted implementation commit and platform

### Requirement: Supported and sandboxed Electron runtime
The desktop release SHALL use an Electron major version within the upstream supported window at release time. Renderer and real PDD browser contexts MUST preserve process sandboxing unless a documented platform limitation blocks the release.

#### Scenario: Electron line is supported
- **WHEN** release verification resolves the installed Electron version
- **THEN** its major version is within the current upstream supported window

#### Scenario: PDD browser context is launched
- **WHEN** the application opens a headed or headless Playwright Chromium context for login, refresh, product, or goods-card operations
- **THEN** the launch arguments do not disable the Chromium sandbox

### Requirement: Restricted renderer privilege boundary
The desktop application SHALL use context isolation, disabled Node integration, a restrictive Content Security Policy, denied unexpected navigation/new windows, and sender validation for every privileged IPC handler.

#### Scenario: Local renderer calls an allowed IPC channel
- **WHEN** the packaged local renderer invokes a registered IPC operation
- **THEN** the shared handler validates the sender and processes the typed request

#### Scenario: Unexpected frame or navigation requests privilege
- **WHEN** an untrusted frame, unexpected origin, navigation, or new window attempts to access the desktop privilege boundary
- **THEN** the application denies the action and exposes no privileged response

### Requirement: OS-backed persisted secret protection
The desktop application SHALL protect the SecretBox master key with the operating system credential-protection facility and SHALL NOT keep a plaintext master key beside the encrypted database after a successful migration.

#### Scenario: Existing plaintext key is migrated
- **WHEN** an upgraded installation contains the legacy plaintext key
- **THEN** the app rewraps it with OS-backed protection, verifies stored secrets can be decrypted, and only then removes the plaintext key

#### Scenario: Key migration cannot be verified
- **WHEN** OS-backed protection is unavailable or stored secrets cannot be verified after rewrap
- **THEN** credential-dependent operations stop with a recoverable diagnostic and the legacy key is not destroyed

#### Scenario: Account logout completes
- **WHEN** an operator logs out a PDD account
- **THEN** the encrypted session value and the persistent PDD browser profile for that account are removed

### Requirement: Release dependency security gate
The release workflow SHALL fail on high or critical production dependency advisories and on critical full-tree advisories unless a committed release-specific exception proves the vulnerable path is unreachable. Unused runtime dependencies MUST be removed rather than waived.

#### Scenario: Patched or removed dependencies
- **WHEN** production and full-tree audits run for the release candidate
- **THEN** the configured severity gates pass with no unreviewed advisory

#### Scenario: Unused vulnerable dependency remains
- **WHEN** a vulnerable package has no runtime caller but remains in the packaged dependency graph
- **THEN** the release remains blocked until the package is removed or a specific necessity is demonstrated

### Requirement: Authoritative packaged application metadata
The Settings UI SHALL display the version and user-data directory reported by the Electron main process. It MUST NOT use a build-time fallback version or hardcoded platform path as user-visible truth.

#### Scenario: Settings opens on a packaged build
- **WHEN** the operator opens Settings on macOS or Windows
- **THEN** the page displays `app.getVersion()` and the actual `app.getPath("userData")` value for that installation

### Requirement: Honest distribution mode
The release process SHALL distinguish unsigned prerelease distribution from signed stable distribution. An unsigned macOS build MUST NOT claim automatic update support, notarization, or trusted public installation.

#### Scenario: Unsigned artifacts are published
- **WHEN** required signing or notarization credentials are unavailable
- **THEN** the release is marked prerelease and documents manual installation, manual macOS update, Gatekeeper/SmartScreen warnings, checksums, and support limitations

#### Scenario: Stable release is requested
- **WHEN** a release is marked stable
- **THEN** macOS signing/notarization and Windows signing gates pass before publication

### Requirement: Least-privilege release automation
The build workflow SHALL grant read-only repository access to package jobs and write access only to the publish job. Formal publishing MUST be tag-driven and protected by repository release controls.

#### Scenario: Package jobs run
- **WHEN** macOS and Windows packages are built
- **THEN** their workflow tokens have `contents: read` and cannot publish or replace release assets

#### Scenario: Manual workflow is dispatched from a branch
- **WHEN** an operator manually runs the desktop workflow against a branch
- **THEN** the workflow may upload temporary CI artifacts but does not create or modify a GitHub Release

#### Scenario: Publish job runs for a protected tag
- **WHEN** all release gates pass for a new protected `v*` tag
- **THEN** only the publish job receives `contents: write` and creates the immutable release

### Requirement: Supported-platform and data lifecycle documentation
Every desktop release SHALL document supported operating-system architectures, installer/signing status, artifact size, first-use runtime/model download and storage requirements, update method, checksum verification, local data location, retention/deletion behavior, privacy boundary, known limitations, and support channel.

#### Scenario: User reads release notes before installation
- **WHEN** a user opens the release page or installation guide
- **THEN** the user can determine whether their platform is supported, what will be downloaded/stored, how updates work, and how local data is removed

### Requirement: Consistent OpenSpec release state
Release closeout SHALL leave OpenSpec tasks, calibration records, acceptance records, active specifications, and readiness documentation consistent. Active specifications and tracked reports MUST NOT require Mock Pinduoduo, Seam A/B/C, or `verify:flow` as completion evidence.

#### Scenario: Release change is ready to archive
- **WHEN** the v1.0.4 evidence and release gates pass
- **THEN** completed parity deltas are applied to the active specs, stale Mock/Seam reports are removed, the remaining UI manual task is complete, and strict OpenSpec validation passes
