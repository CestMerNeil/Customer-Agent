## Context

The pipe is:

```
PDD WebSocket ─► pdd/client ─► normalizer ─► service ─► IPC(message.received)
                                                           │
                                                      renderer / agents
                                                           │
PDD ◄─ pdd/api ◄─ IPC(message.send / reply.draft.send) ◄───┘
```

Both ends terminate at Pinduoduo, which cannot be driven in CI (manual login, captcha, risk control, live socket). The seams to control it, however, already exist and were written test-first:

- `PddHttpClient` accepts `fetchImpl` — every `PddApi` call (`getChatToken`, `getUserInfo`, `getShopInfo`, `setOnlineStatus`, `sendText`) routes through it.
- `PddService` accepts `WebSocketCtor`, `fetchImpl`, and all persistence callbacks (`saveMessage`, `getMessage`, `saveDraft`, …).
- Inbound: `socket.onmessage → handleSocketMessage → normalizePddMessage → saveMessage({state:"received"})`.
- Outbound: `sendMessage → createApi → PddApi.sendText → http.postJson(".../send_message")`.

A real frame shape is already pinned in `packages/pdd/src/normalizer.test.ts`: `{ msg_id, message_type, content, from:{uid,nickname}, ts }`.

**Key finding:** `handleSocketMessage` stops at `saveMessage({state:"received"})`. Nothing in `packages/pdd` triggers reply generation. The `received → reply-workflow → draft` glue lives in `apps/desktop/src/main`, and is currently unverified. "Does the pipe work" therefore splits into distinct seams that must be tested separately, or a green Seam A will give a false sense that the whole pipe works.

## Goals / Non-Goals

**Goals:**
- Prove, deterministically and without a human or real account, that a buyer message produces a sent reply across the real transport, normalization, service, glue, IPC, and renderer code.
- Expose the proof as one command with a machine-readable verdict and a non-zero exit on failure, so an AI assistant can loop build → verify → fix unattended.
- Keep the mock faithful to real Pinduoduo by deriving fixtures from recorded shapes and re-calibrating periodically.

**Non-Goals:**
- Reply-quality evaluation (LLM-as-judge, golden datasets, rubric scoring, regression baselines). Later change.
- Bypassing or simulating Pinduoduo captcha/QR/risk control, or testing the real Playwright login flow against the mock.
- Replacing the real-account manual acceptance entirely; it is retained as calibration.
- Network-dependent or non-deterministic runs in CI.

## Decisions

- **One mock, two modes, one fixture source.** A single `mock-pdd` module exposes (a) a library form — a fake `WebSocketCtor` with `pushBuyerMessage(frame)` plus a fake `fetchImpl` that routes the five PDD endpoints by URL — and (b) a process form that serves the same behavior over a real WS + HTTP server for the packaged app. Both read the same recorded fixtures so the two modes cannot diverge. Alternative considered: swapping endpoint base URLs to a mock server only; rejected because library-mode injection needs no production change and runs in-process at unit speed.
- **Fixtures are recorded, not invented.** Inbound frames and endpoint responses are seeded from `normalizer.test.ts` and captured real shapes, not hand-imagined. A mock that encodes our guess of Pinduoduo would let the loop close against fiction while the real pipe stays broken.
- **Test the seams separately, then end to end.** Seam A (`packages/pdd`): transport + normalize + service. Seam B (`apps/desktop`): the receive→generate→send glue with mock inference. Seam C (Playwright): IPC + renderer through the mock process. A failing seam localizes the break instead of reporting a single opaque red.
- **Mock inference, never a real model, in flow tests.** Flow verification asserts wiring and message-state transitions, not text quality. Inference is mocked to keep the loop deterministic and fast. Real models belong to the future quality layer.
- **Single verdict surface.** `verify:flow` runs the layers and writes `report/flow/<layer>.json` + `report/flow/summary.json` with a fixed schema (`{ layer, passed, failed, failures:[{id, expected, actual, file}] }`) and exits non-zero on any failure. The AI reads JSON, not scrolled logs.
- **AGENTS.md is the operating manual.** It states the command-per-seam, the report location, the verdict schema, and how to add a fixture — turning behavioral guidance into an executable contract the assistant follows.

## Risks / Trade-offs

- **Mock drift from real Pinduoduo** → fixtures recorded from real shapes; the real-account manual run is retained as periodic calibration; endpoint constants stay localized in `packages/pdd`.
- **Green mock, broken reality** → mitigated by calibration; the harness proves *connectivity and wiring*, explicitly not that live Pinduoduo still accepts the same protocol.
- **Seam B may be genuinely disconnected today** → that is a feature of this change, not a blocker: the Seam B test is expected to fail first and expose the real gap before it is wired.
- **Playwright/Electron flakiness in CI** → Seam C asserts state transitions, not pixels; Seams A and B (the cheap, deterministic core) gate the fast inner loop, with Seam C in the fuller run.

## Migration Plan

1. Add `mock-pdd` (library mode) + recorded fixtures in `packages/pdd`; write the Seam A flow test.
2. Locate the `received → reply` glue in `apps/desktop/src/main`; write the Seam B flow test (expect it to fail first), then wire/fix until green.
3. Add `mock-pdd` process mode; add the Playwright Seam C run against it.
4. Add the `verify:flow` script, JSON report schema, and aggregate summary with non-zero exit.
5. Rewrite `AGENTS.md` into the operating contract; re-scope real-account acceptance to calibration.
