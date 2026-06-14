## ADDED Requirements

### Requirement: Mock Pinduoduo edge
The system SHALL provide a Mock Pinduoduo edge that emulates the Pinduoduo WebSocket and HTTP endpoints from recorded fixtures, usable both as injectable library doubles and as a standalone process, without contacting real Pinduoduo.

#### Scenario: Library doubles injected into the service
- **WHEN** the Mock Pinduoduo `WebSocketCtor` and `fetchImpl` are injected into `PddService`
- **THEN** no production source change is required and the service operates against the mock for receive, token, status, and send

#### Scenario: Process mode serves the same behavior
- **WHEN** the Mock Pinduoduo process is started on a configured port
- **THEN** it serves WebSocket frames and the five HTTP endpoints from the same fixtures used by the library doubles

#### Scenario: Fixtures derive from recorded shapes
- **WHEN** a mock inbound frame or endpoint response is defined
- **THEN** it matches a recorded real Pinduoduo shape (seeded from `normalizer.test.ts` and captured samples) rather than an invented shape

### Requirement: Seam A — transport, normalization, and service flow
The system SHALL verify, deterministically and without a real account, that an injected buyer frame is normalized and persisted, and that a reply is sent through the Pinduoduo send endpoint.

#### Scenario: Buyer message is received
- **WHEN** the mock pushes a buyer text frame into `PddService`
- **THEN** the system persists a message record with state `received` and the correct buyer id, buyer nickname, shop id, account id, and content

#### Scenario: Reply reaches the send endpoint
- **WHEN** a reply or approved draft is sent for a received message
- **THEN** the mock `send_message` endpoint receives the correct buyer uid and content, and the source message or draft becomes `sent`

#### Scenario: Send failure is surfaced
- **WHEN** the mock send endpoint returns an error
- **THEN** the source message or draft is left unsent and the failure is recorded and returned

### Requirement: Seam B — receive-to-reply glue
The system SHALL verify that a received message drives reply generation and reaches the send path, exercising the wiring between message receipt and the reply workflow with mocked inference.

#### Scenario: Received message produces a reply that reaches send
- **WHEN** the mock pushes a buyer frame through the wired service, glue, and reply workflow with mocked inference
- **THEN** a reply or draft is produced and reaches `sendMessage` for the originating buyer

#### Scenario: Disconnected glue fails the verdict
- **WHEN** the receive-to-reply glue is not connected
- **THEN** the Seam B verification fails and identifies the missing step rather than reporting overall success

### Requirement: Seam C — end-to-end IPC and renderer flow
The system SHALL verify the receive-to-sent flow through the real IPC and renderer by driving the packaged app against the Mock Pinduoduo process.

#### Scenario: Approve-and-send through the UI
- **WHEN** the app is launched against the mock process and a buyer message is pushed
- **THEN** the message appears with state `received`, and approving and sending the reply transitions it to `sent` through the real IPC and renderer

### Requirement: Single verification verdict
The system SHALL expose a single `verify:flow` entry point that runs the flow seams, emits a machine-readable verdict, and returns a non-zero exit code on any failure, so an automated assistant can close a build/verify loop.

#### Scenario: Aggregate JSON verdict on pass
- **WHEN** `verify:flow` runs and all seams pass
- **THEN** it writes per-layer and aggregate JSON reports with the fixed schema and exits zero

#### Scenario: Non-zero exit on failure
- **WHEN** any seam fails
- **THEN** the aggregate summary records the failing layer and failures, and the command exits non-zero

#### Scenario: Fast inner loop separated from full run
- **WHEN** the fast tier is requested
- **THEN** only the deterministic in-process seams (A and B) run, leaving the Playwright seam to the full run

### Requirement: Mock calibration against real Pinduoduo
The system SHALL retain a periodic calibration step that refreshes recorded fixtures from a real Pinduoduo account so the mock does not drift from the live protocol.

#### Scenario: Calibration refreshes fixtures
- **WHEN** the periodic real-account calibration is performed
- **THEN** refreshed real frame and endpoint shapes are recorded back into the mock fixtures and any mismatch with the current mock is reported
