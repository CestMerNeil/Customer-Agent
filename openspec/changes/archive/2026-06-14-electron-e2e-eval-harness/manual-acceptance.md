# Manual Acceptance: Mock Calibration

This change is verified automatically by `verify:flow`. The only manual step is periodic
calibration so the Mock Pinduoduo edge does not drift from the live protocol.

Run on macOS with a real Pinduoduo merchant account, only when recalibrating.

1. Start the app and log in to a real Pinduoduo merchant account (per `electron-pdd-live-integration` manual steps).
2. Capture a live buyer text frame received over the real WebSocket and the live responses of `chats/getToken`, `janus/api/new/userinfo`, `queryMerchantInfoByMallId`, `set_csstatus`, and `send_message`.
3. Compare the captured shapes against the current mock fixtures (`mockFixtures` in `packages/pdd/src/mock-pdd.ts`).
4. If anything differs, record the refreshed shapes back into `mockFixtures` and re-run `verify:flow`.
5. Confirm `verify:flow` still passes with the refreshed fixtures and the JSON summary reports all seams green.
