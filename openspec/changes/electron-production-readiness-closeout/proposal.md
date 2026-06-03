## Why

The Electron app now has the core merchant assistant path implemented, and a real Pinduoduo merchant login/start/stop acceptance pass has been completed. The remaining gap is release-candidate readiness: recorded acceptance evidence, complete review-state handling, production release checks, packaged runtime validation, and operator-facing diagnostics.

## What Changes

- Complete the human-review draft lifecycle by persisting ignore and escalate actions instead of returning no-op success.
- Add repeatable merchant acceptance evidence records that capture real PDD login, session extraction, account start/stop, receive, reply generation, send, and known blockers without storing secrets.
- Add production release readiness checks for placeholder update configuration, signing/notarization environment, and packaged Playwright browser availability.
- Add runtime diagnostics for PDD login, token retrieval, WebSocket lifecycle, send failures, inference configuration, and knowledge readiness.
- Classify readiness into demo-ready, acceptance-ready, and release-ready states so remaining blockers are explicit.

## Capabilities

### New Capabilities

- `electron-review-lifecycle`: Complete persisted handling for sending, ignoring, and escalating human-review drafts and their source messages.
- `electron-merchant-acceptance`: Repeatable real-merchant acceptance evidence and readiness classification for the Electron app.
- `electron-release-readiness`: Production release preflight checks, packaged runtime validation, and operator diagnostics.

### Modified Capabilities

- None.

## Impact

- Affects `apps/desktop` IPC handlers, renderer account/dashboard/log views, release scripts, and packaging configuration.
- Affects `packages/core` state contracts, `packages/db` persistence records, and `packages/pdd` diagnostics around login/start/send failures.
- Requires at least one real Pinduoduo merchant account for acceptance validation and a separate buyer/test message path for receive/send completion.
- Requires release environment values for production update hosting and macOS signing/notarization validation.
- Does not introduce new customer-service product features beyond readiness, lifecycle completion, diagnostics, and validation evidence.
