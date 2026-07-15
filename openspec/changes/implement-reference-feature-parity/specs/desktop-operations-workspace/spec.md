## ADDED Requirements

### Requirement: Production operations workspace
The Electron UI SHALL provide production-grade pages for conversations, human handoff, Agent audit, product sync, knowledge governance, accounts, connection health, queue health, logs, settings, acceptance status, and release status.

#### Scenario: Operator opens app
- **WHEN** the desktop app launches
- **THEN** the operator can navigate to each production operations surface without relying on placeholder values or unwired controls

### Requirement: Conversation and handoff UI
The UI SHALL show conversation queue state, message status, AI draft/reply state, handoff state, human handling state, and resume-AI actions.

#### Scenario: Conversation is handed off
- **WHEN** a conversation enters human handoff
- **THEN** the UI shows reason, trigger, assigned path, current owner/state, and available next actions

### Requirement: Agent audit UI
The UI SHALL show Agent tool calls, sanitized tool inputs, result status, retries, knowledge citations, goods-card decisions, and transfer decisions.

#### Scenario: Reply is inspected
- **WHEN** an operator opens an Agent-generated reply
- **THEN** the UI shows the evidence and tool path used to generate it

### Requirement: Knowledge and product sync UI
The UI SHALL support product sync progress/cancel/retry, extraction review, version diff, enable/disable, rollback, customer-service knowledge import/edit/delete, tag filtering, and stale/conflict indicators.

#### Scenario: Product sync is running
- **WHEN** product sync is active
- **THEN** the UI shows phase, progress, current item, success count, failure count, cancel action, and sanitized errors

### Requirement: Standard UI states and safety
Every production workspace surface SHALL provide loading, empty, error, retry, success, destructive confirmation, sensitive-data redaction, and accessible keyboard/focus behavior.

#### Scenario: Page load fails
- **WHEN** a page fails to load its data
- **THEN** the UI shows a sanitized error and a retry path without exposing secrets or private buyer data

### Requirement: Bounded desktop lifecycle
The desktop application SHALL run as one instance and SHALL release owned background resources when its last window closes or the application quits.

#### Scenario: Last window closes
- **WHEN** the operator closes the last application window on macOS or Windows
- **THEN** Electron quits and cancels queue wakeups and product sync work, disposes PDD resources, stops the local model process, and flushes the database

#### Scenario: A second instance starts
- **WHEN** another application instance is launched
- **THEN** it focuses the existing window instead of starting duplicate background workers
