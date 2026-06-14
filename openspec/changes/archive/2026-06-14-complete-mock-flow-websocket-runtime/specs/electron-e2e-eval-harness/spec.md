## ADDED Requirements

### Requirement: Electron main WebSocket runtime
The system SHALL provide a WebSocket constructor for Pinduoduo live-session connections in Electron main when the runtime does not expose `globalThis.WebSocket`, while preserving explicit constructor injection for tests.

#### Scenario: Fallback constructor is used in Electron main
- **WHEN** `PddService.startAccount` is called without an injected `WebSocketCtor` and `globalThis.WebSocket` is unavailable
- **THEN** the service opens the configured Pinduoduo WebSocket URL using the fallback runtime constructor instead of failing with a missing WebSocket error

#### Scenario: Injected constructor remains authoritative
- **WHEN** `PddService` is created with an explicit `WebSocketCtor`
- **THEN** the service uses the injected constructor and does not replace it with the fallback runtime constructor

### Requirement: Full mock flow closes through Seam C
The system SHALL make the full Mock Pinduoduo verification command complete the receive -> reply -> send loop through Electron IPC and renderer.

#### Scenario: Full flow verdict passes
- **WHEN** `pnpm verify:flow` runs against the Mock Pinduoduo process
- **THEN** the command exits zero and `report/flow/summary.json` reports `passed: true` with Seam A, Seam B, and Seam C all having zero failures

#### Scenario: Seam C reaches sent state
- **WHEN** the Seam C harness pushes a buyer message through the Mock Pinduoduo process
- **THEN** the app receives the message, generates a human-review draft, sends the draft through the mock `send_message` endpoint, and persists the source message as `sent`
