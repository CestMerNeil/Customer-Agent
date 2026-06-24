## REMOVED Requirements

### Requirement: Mock Pinduoduo edge
**Reason**: Business-critical mock Pinduoduo verification is no longer accepted because it can pass against fictional or stale protocol behavior.
**Migration**: Remove Mock Pinduoduo code, fixtures, process mode, and injectable doubles. Use real Pinduoduo calibration and sanitized real acceptance records.

### Requirement: Seam A — transport, normalization, and service flow
**Reason**: Seam A proves only fixture-driven behavior and is not acceptable completion evidence for real Pinduoduo operations.
**Migration**: Replace with real PDD transport/API acceptance tasks and pure unit tests only for non-business parsing helpers.

### Requirement: Seam B — receive-to-reply glue
**Reason**: Seam B uses mocked inference and mock PDD behavior, which conflicts with the no-business-critical-mock requirement.
**Migration**: Replace with real Agent, real LLM endpoint, real knowledge store, and real PDD acceptance evidence.

### Requirement: Seam C — end-to-end IPC and renderer flow
**Reason**: Seam C drives the app against the Mock Pinduoduo process and can misrepresent real PDD readiness.
**Migration**: Replace with packaged-app real acceptance records and release-gated smoke checks that do not fake PDD.

### Requirement: Single verification verdict
**Reason**: `verify:flow` and `report/flow/summary.json` are no longer the source of truth for product completion.
**Migration**: Remove `verify:flow` commands and update AGENTS/release docs to use real acceptance records, OpenSpec task status, package checks, and CI release gates.

### Requirement: Mock calibration against real Pinduoduo
**Reason**: Keeping a mock calibration process preserves a mock-based verification path that the new scope explicitly rejects.
**Migration**: Keep only real endpoint calibration notes and sanitized schema summaries that feed implementation and acceptance records, not mock fixtures.

### Requirement: Electron main WebSocket runtime
**Reason**: This requirement was attached to mock harness completion and explicit constructor injection for tests.
**Migration**: Re-specify real Electron WebSocket runtime behavior under `pdd-real-merchant-operations`, with no injected business WebSocket mock.

### Requirement: Full mock flow closes through Seam C
**Reason**: Full mock closure is not equivalent to real merchant operation.
**Migration**: Replace with real receive -> Agent/tool -> text/goods-card/transfer acceptance records.
