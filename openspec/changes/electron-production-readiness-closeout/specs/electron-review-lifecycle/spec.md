## ADDED Requirements

### Requirement: Human-review draft actions persist state
The Electron app SHALL persist send, ignore, and escalate actions for human-review drafts and their source messages.

#### Scenario: Draft is ignored
- **WHEN** a user ignores a human-review draft
- **THEN** the system marks the draft `ignored`, marks the source message `ignored`, updates timestamps, and removes the item from pending-review counts

#### Scenario: Draft is escalated
- **WHEN** a user escalates a human-review draft
- **THEN** the system marks the draft `escalated`, marks the source message `escalated`, records an operational log, and keeps the item visible for manual follow-up

#### Scenario: Draft action target is missing
- **WHEN** a user sends, ignores, or escalates a draft id that does not exist
- **THEN** the system returns a failed IPC response without changing any message or draft state

### Requirement: Review lifecycle state transitions remain valid
The Electron app SHALL only apply review lifecycle actions that are valid for the current message and draft state.

#### Scenario: Terminal draft is acted on again
- **WHEN** a user attempts to send, ignore, or escalate a draft that is already `sent`, `ignored`, or `escalated`
- **THEN** the system returns an explicit failure and preserves the existing terminal state

#### Scenario: Failed draft is retried
- **WHEN** a user retries a failed draft by sending, ignoring, or escalating it
- **THEN** the system applies the requested valid transition and records the updated state
