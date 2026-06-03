## 1. Review Lifecycle

- [x] 1.1 Implement `reply.draft.ignore` IPC handling that persists draft and source message state as `ignored`.
- [x] 1.2 Implement `reply.draft.escalate` IPC handling that persists draft and source message state as `escalated` and appends an operational log.
- [x] 1.3 Reject invalid actions on missing drafts or terminal draft states without mutating persisted records.
- [x] 1.4 Update renderer pending-review counts and draft lists to reflect ignored and escalated records.
- [x] 1.5 Add tests for ignore, escalate, missing target, terminal state, and failed-state retry behavior.

## 2. Merchant Acceptance Evidence

- [x] 2.1 Add a sanitized acceptance evidence template or local record format with date, app version/commit, platform, account alias, shop id, outcomes, blockers, and notes.
- [x] 2.2 Record the 2026-06-03 real PDD acceptance partial pass for login, session extraction, account start, and account stop.
- [x] 2.3 Extend manual acceptance instructions to track each step independently: login, session extraction, start, receive message, generate reply, send reply, and stop.
- [x] 2.4 Add sensitive-data rules that prohibit storing passwords, plaintext cookies, tokens, raw private payloads, and private buyer contact details.
- [x] 2.5 Add readiness classification logic or documentation for `demo-ready`, `acceptance-ready`, and `release-ready`.

## 3. Release Readiness

- [x] 3.1 Add release preflight checks that fail production packaging when the update URL is still a placeholder.
- [x] 3.2 Add release preflight checks for required macOS signing and notarization environment values without printing secret values.
- [x] 3.3 Allow explicitly non-production CI packaging commands to build unpublished unsigned artifacts.
- [x] 3.4 Add packaged runtime smoke coverage for resolving the bundled Playwright browser path.
- [x] 3.5 Surface packaged Playwright runtime failures as release-blocking diagnostics.

## 4. Runtime Diagnostics

- [x] 4.1 Add PDD diagnostics for session expiry, token retrieval failure, WebSocket unexpected close, and send-message failure.
- [x] 4.2 Add inference diagnostics for missing or unhealthy OpenAI-compatible endpoint configuration.
- [x] 4.3 Add knowledge diagnostics for local vector index open/import/search failures.
- [x] 4.4 Surface diagnostics in account, dashboard, and log views with sanitized error messages.
- [x] 4.5 Ensure diagnostic records include timestamps and enough context to identify the failing subsystem.

## 5. Verification

- [x] 5.1 Run package tests for core, db, pdd, inference, knowledge, and agents.
- [x] 5.2 Run desktop renderer tests, typecheck, lint, build, and Electron runtime smoke.
- [x] 5.3 Run packaged macOS runtime smoke for Playwright browser availability.
- [x] 5.4 Complete real PDD receive-message and send-reply acceptance when a buyer/test-message path is available, or record the external blocker.
- [x] 5.5 Run `openspec status --change electron-production-readiness-closeout` and resolve any incomplete artifacts before implementation starts.
