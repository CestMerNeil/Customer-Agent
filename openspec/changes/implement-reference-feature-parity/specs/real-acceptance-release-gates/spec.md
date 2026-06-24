## ADDED Requirements

### Requirement: Real acceptance records
The system SHALL define sanitized acceptance records that bind capability outcomes to commit SHA, version/tag when applicable, platform, account alias, shop scope, acceptance date, actor, and evidence summary.

#### Scenario: Acceptance record is stored
- **WHEN** a real acceptance run is recorded
- **THEN** the record includes required metadata and excludes passwords, cookies, tokens, raw buyer payloads, and private contact data

### Requirement: No mock completion evidence
The system SHALL reject mock, fixture, simulated PDD, simulated LLM, simulated Agent tool, and generated buyer payload evidence for business-critical completion.

#### Scenario: Task is marked complete
- **WHEN** a business-critical task depends on PDD, LLM, Agent tools, knowledge search, product sync, or transfer behavior
- **THEN** it can be marked complete only with real acceptance evidence or non-business pure-unit evidence for non-external logic

### Requirement: GitHub Actions release gate
The release workflow SHALL fail unless sanitized acceptance records cover the release commit or tag and all release-blocking capabilities pass.

#### Scenario: Acceptance record is stale
- **WHEN** a release workflow runs for a commit or tag not covered by acceptance evidence
- **THEN** the workflow fails before publishing artifacts

#### Scenario: Required capability failed
- **WHEN** any release-blocking capability record has outcome other than pass
- **THEN** the workflow fails before publishing artifacts

### Requirement: macOS and Windows release automation
The system SHALL build, package, and publish macOS and Windows desktop artifacts through GitHub Actions after passing code, package, secret, and acceptance gates.

#### Scenario: Release tag is pushed
- **WHEN** a valid release tag is pushed or release workflow is manually dispatched for a covered version
- **THEN** CI builds macOS and Windows artifacts, uploads them to GitHub Releases, and records artifact checksums
- **AND** the first parity release does not require code signing or macOS notarization

### Requirement: Packaged app smoke and release metadata
The system SHALL run packaged runtime smoke checks and attach release metadata linking artifacts to commit, tag, acceptance records, and checksums.

#### Scenario: Packaged smoke fails
- **WHEN** a packaged app smoke check fails on a release platform
- **THEN** the release workflow fails and no artifact is published as release-ready
