## ADDED Requirements

### Requirement: Reference parity scope
The system SHALL define feature parity against the referenced repository using the README as the primary scope and audited core code paths as supplements.

#### Scenario: README feature is included
- **WHEN** a feature is explicitly listed in the reference README
- **THEN** the feature is included in the parity scope unless this change marks it out of scope

#### Scenario: Code-only core path is included
- **WHEN** the reference code contains a behavior that affects Pinduoduo connection, message handling, Agent tools, knowledge, product sync, human handoff, queue processing, or release delivery
- **THEN** the behavior is included in the parity scope even if the README does not name it

### Requirement: Electron architecture remains authoritative
The system SHALL implement parity in the current Electron + TypeScript architecture.

#### Scenario: Technology stack differs from reference
- **WHEN** the reference uses PyQt, Python, SQLAlchemy, or PyInstaller
- **THEN** the Electron implementation maps the business behavior to TypeScript services, Electron IPC, SQLite/local storage, and electron-builder packaging instead of copying the reference technology stack

### Requirement: Non-core reference code exclusion
The system SHALL exclude reference implementation details that are experimental, unused, deprecated, or unrelated to business parity.

#### Scenario: Placeholder channel enum is found
- **WHEN** the reference code exposes channel enum values for JD, Taobao, Douyin, or Kuaishou without a live implementation
- **THEN** the parity scope records them as out of scope and only implements Pinduoduo

#### Scenario: Auxiliary feature is found
- **WHEN** reference code contains an auxiliary management feature that improves operations but is not required for the receive -> reply -> recommend -> handoff loop
- **THEN** the feature is classified as should-scope rather than a release-blocking must unless the specs promote it
