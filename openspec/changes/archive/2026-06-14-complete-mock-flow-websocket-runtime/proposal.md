## Why

The Mock Pinduoduo flow harness currently proves Seam A and Seam B, but the full `verify:flow` command fails at Seam C because Electron main lacks a WebSocket constructor. This leaves the requested receive -> reply -> send loop unclosed in the only end-to-end mock path.

## What Changes

- Provide a production-safe WebSocket runtime path for `PddService` when Electron/Node does not expose `globalThis.WebSocket`.
- Keep the existing `WebSocketCtor` injection seam for tests and mock library mode.
- Update the mock flow operating contract so Seam C is expected to pass, not documented as an acceptable red state.
- Verify the full `verify:flow` command exits zero and reports all seams green.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `electron-e2e-eval-harness`: Full Seam C must complete `received -> draft -> sent` through Electron IPC and renderer against the Mock Pinduoduo process.

## Impact

- Affects `packages/pdd` WebSocket runtime resolution and related tests.
- Affects `apps/desktop` full mock flow verification and `AGENTS.md` expectations.
- May add or use an existing WebSocket client dependency only if required by the Electron main runtime.
