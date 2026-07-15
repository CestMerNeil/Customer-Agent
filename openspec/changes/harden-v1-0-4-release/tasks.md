## 1. Release Identity and Gate Integrity

- [x] 1.1 Add release-gate tests for tag/package-version equality, existing-version rejection, unrelated commits, accepted exact commits, allowlisted evidence-only descendants, and forbidden application/build/dependency changes.
- [x] 1.2 Replace the unconditional ancestor bypass with explicit `acceptedCommit`/`releaseCommit` validation and a narrow evidence/readiness path allowlist.
- [x] 1.3 Generate release metadata that records package version, tag, accepted commit, release commit, platform, artifact names, update metadata, and checksums without secrets.
- [x] 1.4 Make manual workflow dispatch build temporary artifacts only; allow formal publication only for a new `v*` tag whose version and checked-out SHA pass the release gate.
- [x] 1.5 Make the publish job reject an existing tag, GitHub Release, or asset set instead of overwriting it.

## 2. Electron and PDD Browser Security

- [x] 2.1 Upgrade Electron from 34 to the current supported target line (Electron 43 for this change), resolve compatibility issues, and verify the resolved major in CI.
- [x] 2.2 Remove `--no-sandbox` from every headed and headless PDD Playwright launch path and add focused launch-option coverage.
- [x] 2.3 Add a restrictive renderer Content Security Policy and block unexpected navigation and new-window creation.
- [x] 2.4 Validate sender origin in the shared IPC handler wrapper before every privileged request and add allowed/denied sender tests.
- [ ] 2.5 Run typecheck, focused security tests, desktop build, and real PDD login/session calibration after the Electron and sandbox changes; keep the path blocked if real login fails.

## 3. OS-Backed Secret Key Migration

- [x] 3.1 Extend SecretBox initialization so Electron main supplies a master key protected with `safeStorage` while deterministic package tests can supply an explicit test key.
- [x] 3.2 Implement idempotent migration from the legacy plaintext `session-secret.key`: rewrap, verify existing encrypted sessions/API keys, then remove the plaintext key only on success.
- [ ] 3.3 Add tests for new installs, successful legacy migration, interrupted migration, unavailable OS protection, unreadable stored secrets, and logout removal of account cookies/profile data.
- [ ] 3.4 Verify migration and rollback using a copied sanitized local data set on macOS and Windows without exposing or committing session material.

## 4. Dependency and Package Hygiene

- [x] 4.1 Remove unused runtime dependencies/packages and move Vite/React build tooling out of production dependencies where runtime callers do not exist.
- [x] 4.2 Upgrade remaining affected production dependencies to patched versions, including the updater YAML path, and upgrade the critical affected test tooling.
- [x] 4.3 Add release CI gates for `pnpm audit --prod --audit-level high` and `pnpm audit --audit-level critical`, with no generic waiver path.
- [x] 4.4 Clean the renderer output directory before each build so local packages do not retain obsolete hashed bundles, then verify packaged inputs contain only the current renderer build.

## 5. Authoritative UI Metadata and Update Mode

- [ ] 5.1 Add a minimal app-info IPC response for the real user-data path and distribution mode; reuse main-process `app.getVersion()` as the version source of truth.
- [ ] 5.2 Replace the Settings `v0.0.0` fallback and hardcoded macOS data path with main-process metadata, with macOS and Windows renderer tests.
- [ ] 5.3 Disable macOS automatic download/install for unsigned prerelease builds and present the manual-update limitation in Settings.
- [ ] 5.4 Add main-process updater tests for disabled unsigned macOS mode, supported Windows mode, error handling, download state, and explicit restart/install.

## 6. Packaged Runtime Verification

- [x] 6.1 Add a packaged-app smoke entry that launches the generated executable, emits an explicit ready signal after storage/IPC/resource initialization, and exits cleanly without invoking business side effects.
- [x] 6.2 Update macOS ARM64 CI to run the generated `.app`, verify Playwright/update resources and the ready signal, then terminate it cleanly.
- [x] 6.3 Update Windows x64 CI to install or launch the generated package, verify Playwright/update resources and the ready signal, then terminate it cleanly.
- [x] 6.4 Keep packaged smoke labeled as local runtime proof only and ensure it cannot generate business acceptance records.

## 7. Workflow and Repository Release Controls

- [x] 7.1 Set workflow/package permissions to `contents: read` and grant `contents: write` only to the tag-driven publish job.
- [ ] 7.2 Pin release workflow actions to immutable commit SHAs and preserve the repository-pinned pnpm/Node setup.
- [ ] 7.3 Configure and record repository default read permissions, protected `main`/`v*` rules, and a protected release environment without adding PDD credentials to GitHub.
- [ ] 7.4 Publish unsigned artifacts as GitHub prereleases and require Windows signing plus macOS signing/notarization before a release can be marked stable.

## 8. v1.0.4 Documentation and Candidate Build

- [ ] 8.1 Update release/user documentation with supported architectures, unsigned status, install steps, artifact size, first-use runtime/model download size, storage requirements, update method, checksums, data location/retention/deletion, privacy boundary, known limitations, and support channel.
- [ ] 8.2 Document `v1.0.3` as superseded without moving its tag or replacing its remaining assets.
- [ ] 8.3 Set the desktop package version to `1.0.4`, generate fresh candidate artifacts, and record the candidate as `acceptedCommit` before any acceptance run.
- [ ] 8.4 Run lint, typecheck, all helper tests, build, production/full dependency audits, secret scan, local-model manifest validation, OpenSpec strict validation, and both platform package launch smokes on the candidate.

## 9. Current Real Calibration and Acceptance

- [ ] 9.1 Generate, execute, validate, and summarize sanitized PDD calibration for `acceptedCommit`, including endpoint status, parsed field maps, reference comparison, anti-content/header handling, and failure signatures.
- [ ] 9.2 Complete clean-machine macOS ARM64 real acceptance for PDD, Agent, local model, knowledge/product sync, queue/concurrency, multi-shop isolation, desktop workspace, release gate, secrets, install/update/restart, logout, and uninstall/data retention.
- [ ] 9.3 Complete the equivalent clean-machine Windows x64 real acceptance against the same `acceptedCommit`.
- [ ] 9.4 Complete `electron-ui-redesign` task 5.5 by launching the packaged app, confirming the default review workspace, driving a real draft through edit-to-send, and checking for unwired controls or fabricated values.
- [ ] 9.5 Keep every unavailable or unsuccessful capability marked blocked or failed; do not create passing records from mocks, fixtures, helper tests, or CI smoke.

## 10. Evidence-Only Release Commit and Publication

- [ ] 10.1 Reconcile tasks, calibration summaries, acceptance records, manual checklists, and release-readiness documentation, then commit only sanitized evidence/readiness files as `releaseCommit`.
- [ ] 10.2 Run the evidence-only diff gate and confirm no application source, package/lockfile, workflow, script, icon, builder input, or other packaged behavior changed after `acceptedCommit`.
- [ ] 10.3 Run the full final gate set for both platforms and verify every required operator record passes for `acceptedCommit` and `v1.0.4`.
- [ ] 10.4 Create the new `v1.0.4` tag at `releaseCommit` and publish once as an unsigned prerelease; do not overwrite `v1.0.3` or republish `v1.0.4`.
- [ ] 10.5 Verify the GitHub release page, artifact set, update metadata, checksums/digests, install instructions, and manual macOS update behavior.

## 11. OpenSpec and Historical Cleanup

- [ ] 11.1 Apply and archive the completed parity deltas so active specs no longer require Mock Pinduoduo, Seam A/B/C, or `verify:flow` as completion evidence.
- [ ] 11.2 Remove tracked stale `report/flow` artifacts and resolve contradictory remaining-task/checklist text without deleting valid sanitized historical evidence.
- [ ] 11.3 Archive other completed legacy Electron changes only after confirming their requirements are represented in active specs and current release evidence.
- [ ] 11.4 Run `pnpm exec openspec validate --all --strict`, confirm only genuinely unfinished changes remain active, and leave this change ready for archive.
