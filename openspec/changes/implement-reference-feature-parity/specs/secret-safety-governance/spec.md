## ADDED Requirements

### Requirement: Local secret encryption and rotation
The system SHALL encrypt PDD session material, cookies, tokens, LLM API keys, and other credentials at rest and support operator-managed rotation or refresh.

#### Scenario: Secret is saved
- **WHEN** the operator saves PDD or LLM credentials
- **THEN** the stored value is encrypted and never written to logs or acceptance records in plaintext

#### Scenario: Secret is rotated
- **WHEN** the operator rotates a credential or refreshes a session
- **THEN** the system replaces the encrypted value, records a sanitized rotation event, and invalidates stale runtime caches

### Requirement: Sanitized logs, exports, and acceptance records
The system SHALL redact secrets and private buyer data from logs, diagnostics, exports, release metadata, and acceptance records.

#### Scenario: Diagnostic includes sensitive fields
- **WHEN** a diagnostic context contains fields such as password, cookie, token, API key, access token, anti-content, buyer contact, or raw payload
- **THEN** the system redacts those fields before persistence or display

### Requirement: Secret leak prevention gates
The system SHALL include release-blocking checks that scan committed acceptance records, logs, and exportable artifacts for disallowed sensitive fields.

#### Scenario: Leak scan finds secret-shaped data
- **WHEN** CI detects a disallowed secret or private buyer-data pattern in release-gated artifacts
- **THEN** the release workflow fails and reports the file and category without printing the secret value

### Requirement: CI-safe release configuration
The system SHALL allow GitHub Actions to use GitHub Release credentials while prohibiting PDD login credentials and raw PDD session material in CI.

#### Scenario: PDD credential is configured in CI
- **WHEN** a workflow attempts to use PDD username, password, cookies, tokens, or buyer private data as GitHub Secrets for acceptance
- **THEN** the workflow configuration is invalid for this change and must fail validation

#### Scenario: Signing is deferred
- **WHEN** the first parity release workflow runs
- **THEN** it does not require macOS signing, macOS notarization, or Windows signing secrets
