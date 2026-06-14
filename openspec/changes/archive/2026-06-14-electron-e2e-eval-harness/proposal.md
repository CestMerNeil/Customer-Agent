## Why

The full message pipeline — receive a buyer message, run the agent, send a reply — terminates on both ends at Pinduoduo, an uncontrolled external system (browser login, captcha/risk control, live WebSocket). The only way to verify "does the pipe work end to end" today is the manual checklist in `electron-pdd-live-integration/manual-acceptance.md`: a real merchant account, a human passing the captcha, and a second account sending a buyer message. Nobody — least of all an AI assistant — can run that in a loop. As a result, the most basic questions are unanswered: can the system receive a message, and can it send a reply? Connectivity is unverified, so reply-quality evaluation has nothing to stand on.

This change builds the bottom of the evaluation pyramid first: an automated, deterministic, no-human, no-real-account proof that the pipe is connected, exposed as a single command with a machine-readable verdict so an AI assistant can close its own build/verify loop.

## What Changes

- Add a **Mock Pinduoduo edge** ("protocol twin") in `packages/pdd`, built from recorded real frame/response shapes, usable two ways from one source of fixtures:
  - **Library mode**: a fake `WebSocketCtor` and fake `fetchImpl` injected into the existing `PddService` seams (no production code change required).
  - **Process mode**: a standalone WebSocket + HTTP server the packaged app can be pointed at for end-to-end runs.
- Add an **inbound/outbound flow test (Seam A)**: push a buyer frame through `PddService` and assert a `received` message is persisted; call send and assert the mock send endpoint receives the correct body.
- Add an **application-glue flow test (Seam B)** in `apps/desktop`: drive `received → reply-workflow (mock inference) → draft → sendMessage` to verify the wiring between message receipt and reply generation, which currently lives in Electron main and is unverified.
- Add a **Playwright end-to-end run (Seam C)**: launch the app against the Mock PDD process and drive `received → approve → sent` through the real IPC + renderer.
- Add a **single verification entry point** `verify:flow` that runs the layers, emits a structured JSON verdict per layer plus an aggregate summary, and returns a non-zero exit code on any failure.
- Update `AGENTS.md` into an operational contract: which command verifies which seam, where the JSON report lives, and how to add fixtures — so an AI assistant can self-drive.
- Re-scope the existing real-account manual acceptance to a periodic **calibration** step that keeps the Mock from drifting away from real Pinduoduo.

This change deliberately excludes reply-quality evaluation (LLM-as-judge, golden datasets, scoring). Quality is a later layer that requires a verified pipe to attach to.

## Capabilities

### New Capabilities

- `electron-e2e-eval-harness`: a mock-driven, deterministic, single-command end-to-end verification of the receive → generate → send pipeline, runnable without a real Pinduoduo account and consumable by an AI assistant.

### Modified Capabilities

- None. (`pdd-live-session` behavior is unchanged; this change exercises it through injected seams.)

## Impact

- Affects `packages/pdd` (mock edge + Seam A test), `apps/desktop` (Seam B test, Playwright Seam C, `verify:flow` script, JSON report), and `AGENTS.md`.
- Adds no production runtime dependencies; reuses the existing `WebSocketCtor`/`fetchImpl` injection points and the already-installed Playwright.
- Surfaces a likely existing defect: the `received → reply generation` glue in Electron main is not covered today and may be the actual break in the pipe.
- Real Pinduoduo accounts move from "the only acceptance path" to "periodic mock-calibration only."
