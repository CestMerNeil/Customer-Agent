## 1. WebSocket Runtime

- [x] 1.1 Add a Node/Electron-compatible WebSocket fallback for `PddService` when no injected constructor or global constructor is available.
- [x] 1.2 Add tests proving injected `WebSocketCtor` remains authoritative and the fallback constructor is used when globals are absent.

## 2. Full Mock Flow

- [x] 2.1 Update Seam C or its runtime setup as needed so it reaches `received -> draft -> sent` through real IPC and the Mock Pinduoduo process.
- [x] 2.2 Update `AGENTS.md` and related OpenSpec notes so full Seam C is documented as a required green gate instead of an acceptable red state.

## 3. Verification

- [x] 3.1 Run `openspec validate --changes complete-mock-flow-websocket-runtime --strict`.
- [x] 3.2 Run `pnpm verify:flow` and confirm `report/flow/summary.json` reports all seams green.
- [x] 3.3 Run relevant package tests plus repo typecheck/lint/build after the runtime change.
