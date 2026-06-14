## Context

The archived `electron-e2e-eval-harness` change introduced a deterministic Mock Pinduoduo edge and a full `verify:flow` command, but the current full run fails before the mock buyer message is delivered. `PddService.startAccount` uses `globalThis.WebSocket` unless a test injects `WebSocketCtor`; Electron main currently provides no global WebSocket constructor in the runtime used by the app, so Seam C cannot reach `received`, `draft_ready`, or `sent`.

## Goals / Non-Goals

**Goals:**

- Make the Electron main process able to open the Mock Pinduoduo WebSocket during Seam C.
- Preserve the existing `WebSocketCtor` injection seam for unit tests and library-mode mock verification.
- Keep `verify:flow:fast` as the CI-friendly A/B tier while making full `verify:flow` pass locally with Seam C.
- Update the operating contract so Seam C is a required green gate for full mock closure.

**Non-Goals:**

- Replace the real Pinduoduo protocol or real-account calibration workflow.
- Add reply-quality evaluation or model-scoring.
- Change renderer UX beyond what is needed for the existing IPC-driven e2e harness.

## Decisions

- Use a real Node-compatible WebSocket implementation as the production fallback for Electron main when `globalThis.WebSocket` is absent. This keeps `PddService` responsible for transport construction and avoids special-casing mock-only behavior.
- Prefer an existing installed dependency if the workspace already contains a suitable WebSocket package; otherwise add the smallest runtime dependency to `@customer-agent/pdd`.
- Keep the constructor override order as `options.WebSocketCtor` first, fallback runtime second. Unit tests and library-mode mock remain deterministic and do not open real sockets.
- Treat full `verify:flow` as the proof of closure. A passing Seam A/B fast tier is useful but insufficient for the requested full Mock Pinduoduo loop.

## Risks / Trade-offs

- WebSocket client behavior may differ slightly from browser WebSocket behavior -> limit usage to the small API surface currently used by `PddService`: constructor, `onmessage`, `onclose`, `onerror`, and `close`.
- Adding a runtime dependency increases package surface -> use an already present dependency if available and verify package tests plus full flow.
- Seam C is slower and more environment-sensitive than A/B -> keep it out of fast CI while making it mandatory for local full closure.
