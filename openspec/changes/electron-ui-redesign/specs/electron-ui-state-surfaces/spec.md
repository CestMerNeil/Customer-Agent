## ADDED Requirements

### Requirement: Every page handles all data states
Each renderer page SHALL explicitly render loading, empty, error, and populated states for the data it reads.

#### Scenario: Data is loading
- **WHEN** a page's underlying IPC read has not yet resolved
- **THEN** the page shows a loading indication rather than an empty or misleading populated layout

#### Scenario: Data read fails
- **WHEN** a page's IPC read returns an error
- **THEN** the page shows a sanitized inline error with a retry affordance rather than failing silently or showing stale data

#### Scenario: Data is empty
- **WHEN** a read succeeds with no records
- **THEN** the page shows a guidance empty state describing what will appear and how to populate it

### Requirement: No placeholder or fabricated values
The renderer SHALL NOT display fabricated metrics or progress values; status indicators SHALL reflect real system reads.

#### Scenario: Model readiness reflects real health
- **WHEN** the dashboard shows model/inference readiness
- **THEN** the value is derived from a real inference health/status read, not a hardcoded constant

### Requirement: All controls are wired or removed
Every actionable control the renderer presents SHALL perform a real action; non-functional placeholder controls SHALL NOT be shown.

#### Scenario: Dashboard primary actions work
- **WHEN** an operator activates the dashboard "view pending" or "refresh" actions
- **THEN** each performs its real effect (navigating to pending review or refreshing the relevant reads)

#### Scenario: Log view controls
- **WHEN** an operator activates a control in the log view (such as refresh or clear)
- **THEN** the control performs a real effect, or it is not presented if no real effect is available
