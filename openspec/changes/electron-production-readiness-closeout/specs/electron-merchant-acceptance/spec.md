## ADDED Requirements

### Requirement: Merchant acceptance evidence is recorded
The Electron app SHALL provide a repeatable acceptance evidence record for real Pinduoduo merchant validation runs.

#### Scenario: Acceptance run is recorded
- **WHEN** a tester completes any real PDD acceptance step
- **THEN** the system records the date, app version or commit, platform, account alias, shop id, step outcomes, blockers, and sanitized notes

#### Scenario: Sensitive values are excluded
- **WHEN** an acceptance record is created
- **THEN** the record MUST NOT include passwords, plaintext cookies, tokens, full raw PDD payloads, or private buyer contact details

### Requirement: PDD live acceptance steps are tracked independently
The Electron app SHALL track PDD live acceptance as independent step outcomes rather than a single all-or-nothing result.

#### Scenario: Login and account lifecycle pass
- **WHEN** a real merchant login succeeds, account metadata is persisted, `account.start` succeeds, and `account.stop` succeeds
- **THEN** the acceptance record marks login, session extraction, start, and stop as passed with shop id and account alias evidence

#### Scenario: Buyer message validation is blocked
- **WHEN** no buyer/test-message path is available
- **THEN** the acceptance record marks receive-message and send-reply validation as blocked with the external dependency reason

### Requirement: Readiness classification is derived from evidence
The Electron app SHALL classify readiness from current acceptance, diagnostics, and release preflight evidence.

#### Scenario: Demo-ready
- **WHEN** core package tests pass and the app can launch with local persistence
- **THEN** the readiness state is at least `demo-ready`

#### Scenario: Acceptance-ready
- **WHEN** real PDD login, session extraction, account start, and account stop have passing evidence
- **THEN** the readiness state is at least `acceptance-ready`

#### Scenario: Release-ready
- **WHEN** all required merchant acceptance steps pass, production release preflight passes, packaged runtime smoke passes, and no critical diagnostics remain open
- **THEN** the readiness state is `release-ready`
