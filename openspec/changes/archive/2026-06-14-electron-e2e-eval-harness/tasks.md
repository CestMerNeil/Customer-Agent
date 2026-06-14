## 1. Mock Pinduoduo Edge (Library Mode)

- [x] 1.1 Add `packages/pdd/src/mock-pdd.ts` with a fake `WebSocketCtor` exposing `pushBuyerMessage(frame)` and lifecycle (`open`/`close`) hooks.
- [x] 1.2 Add a fake `fetchImpl` that routes the five PDD endpoints by URL: `chats/getToken`, `janus/api/new/userinfo`, `queryMerchantInfoByMallId`, `set_csstatus`, `send_message`, and records received request bodies.
- [x] 1.3 Add recorded fixtures (inbound frames + endpoint responses) seeded from `normalizer.test.ts` and captured real shapes; keep them as the single source for both modes.

## 2. Seam A — Transport / Normalize / Service Flow

- [x] 2.1 Add a flow test injecting `mock-pdd` into `PddService`: `pushBuyerMessage` → assert `saveMessage` called with `state:"received"` and correct buyer/shop/account fields.
- [x] 2.2 Extend the test: call `sendMessage`/`sendDraft` → assert the mock `send_message` endpoint received the correct buyer uid and content, and the source message/draft becomes `sent`.
- [x] 2.3 Assert failure handling: mock send returns an error → message/draft left unsent and error surfaced.

## 3. Seam B — Application Glue (received → reply → send)

- [x] 3.1 Locate the `received → reply-workflow → draft` wiring in `apps/desktop/src/main`; document whether it is currently connected.
- [x] 3.2 Add a flow test wiring real `PddService` + `mock-pdd` + mock inference + reply-workflow: `pushBuyerMessage` → assert a draft/reply is produced and reaches `sendMessage`.
- [x] 3.3 If the glue is disconnected, wire it (or fix it) until the Seam B test passes; keep changes surgical.

## 4. Seam C — Mock Process + Playwright End to End

- [x] 4.1 Add `mock-pdd` process mode: a standalone WS + HTTP server backed by the same fixtures, with a configurable port. (`packages/pdd/src/mock-pdd-server.ts`, control endpoint `POST /__control/push`; unit test `mock-pdd-server.test.ts`.)
- [x] 4.2 Add a Playwright run that launches the app pointed at the mock process and drives `received → approve → sent` through real IPC + renderer. (`apps/desktop/scripts/e2e-seam-c.mjs`, npm script `e2e:seam-c`; URL override seam `packages/pdd/src/endpoints.ts` via `PDD_HTTP_BASE_URL`/`PDD_WS_BASE_URL`.) Seam C is the full-flow gate and must reach `sent` for the Mock Pinduoduo loop to be considered closed.

## 5. Single Verdict Entry Point

- [x] 5.1 Add `verify:flow` script that runs Seams A and B (fast inner loop) and, in full mode, Seam C. (`scripts/verify-flow.mjs`; root scripts `verify:flow` / `verify:flow:fast`.)
- [x] 5.2 Emit `report/flow/<layer>.json` and `report/flow/summary.json` with the fixed verdict schema; exit non-zero on any failure. (`report/` gitignored.)
- [x] 5.3 Wire `verify:flow` (fast tier) into CI alongside the existing lint/typecheck/test/build. (`.github/workflows/ci.yml` runs `verify:flow:fast`; Seam C excluded from CI.)

## 6. Operating Contract and Calibration

- [x] 6.1 Rewrite `AGENTS.md` to state command-per-seam, report location, verdict schema, and how to add a fixture.
- [x] 6.2 Re-scope manual acceptance to a periodic mock-calibration checklist (record refreshed real shapes back into `mockFixtures`). (`manual-acceptance.md`.)
- [x] 6.3 Run typecheck, lint, package tests, `verify:flow`, and confirm the JSON summary and exit code behave for both pass and induced-fail cases. (Repo-wide build/typecheck/lint green; `verify:flow` exits 0 when Seam A/B/C are green; induced-fail verified exit 1.)
