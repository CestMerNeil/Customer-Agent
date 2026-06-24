## ADDED Requirements

### Requirement: Review workspace presents draft context
The review workspace SHALL present, for a selected human-review draft, its source message, the matched knowledge used, and the editable draft reply.

#### Scenario: Operator selects a pending draft
- **WHEN** an operator selects a draft from the pending list
- **THEN** the workspace shows the source buyer message, any matched knowledge context available for that draft, and the draft reply text in an editable field

#### Scenario: No drafts are pending
- **WHEN** there are no pending human-review drafts
- **THEN** the workspace shows an explicit empty state explaining that pending drafts will appear here, with no fabricated rows

### Requirement: Operator edits a draft before action
The review workspace SHALL allow an operator to edit draft reply text prior to sending.

#### Scenario: Edited draft is sent
- **WHEN** an operator edits the draft text and chooses send
- **THEN** the workspace dispatches the send action for that draft with the edited text and reflects the resulting terminal state

### Requirement: Review workspace drives the full draft lifecycle
The review workspace SHALL drive send, ignore, and escalate actions for a draft through the existing reply-draft IPC and reflect the resulting state.

#### Scenario: Draft is sent
- **WHEN** an operator confirms send on a pending draft
- **THEN** the workspace invokes the send IPC, and on success removes the draft from the pending list and updates pending counts

#### Scenario: Draft is ignored
- **WHEN** an operator ignores a pending draft
- **THEN** the workspace invokes the ignore IPC and reflects the draft as ignored, removing it from pending counts

#### Scenario: Draft is escalated
- **WHEN** an operator escalates a pending draft
- **THEN** the workspace invokes the escalate IPC and reflects the draft as escalated while keeping it visible for follow-up

#### Scenario: Action fails
- **WHEN** a send, ignore, or escalate action returns a failed response
- **THEN** the workspace surfaces a sanitized inline error and leaves the draft actionable for retry without losing edited text
