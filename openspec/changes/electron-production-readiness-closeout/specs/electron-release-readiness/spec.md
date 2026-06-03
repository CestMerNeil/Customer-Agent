## ADDED Requirements

### Requirement: Production release preflight
The Electron release flow SHALL fail before publishing production artifacts when required release configuration is missing or placeholder values remain.

#### Scenario: Placeholder update URL remains
- **WHEN** a production package or publish command runs while the update feed URL is a placeholder
- **THEN** the release preflight fails with a message identifying the update feed configuration

#### Scenario: Signing environment is missing
- **WHEN** a signed macOS production release is requested without required signing or notarization environment values
- **THEN** the release preflight fails before artifact publishing and lists the missing environment keys without printing secret values

#### Scenario: CI package build disables publishing
- **WHEN** a CI packaging command is explicitly configured with publish disabled
- **THEN** the release preflight allows unsigned or unnotarized artifacts only when the command is marked non-production

### Requirement: Packaged Playwright runtime validation
The packaged desktop app SHALL validate that the bundled Playwright browser runtime is available for PDD login flows.

#### Scenario: Bundled browser exists
- **WHEN** packaged runtime smoke runs
- **THEN** the app resolves the packaged Playwright browser path and reports the browser runtime as available

#### Scenario: Bundled browser is missing
- **WHEN** packaged runtime smoke cannot find the bundled Playwright browser
- **THEN** the app reports a release-blocking diagnostic and does not claim PDD login readiness

### Requirement: Runtime diagnostics are surfaced
The Electron app SHALL surface operator-facing diagnostics for PDD, inference, knowledge, and release readiness.

#### Scenario: PDD session expires
- **WHEN** chat token retrieval or send-message fails because a PDD session is invalid or expired
- **THEN** the account is marked `error`, a relogin-required diagnostic is recorded, and the UI surfaces the failure reason

#### Scenario: WebSocket disconnects unexpectedly
- **WHEN** a started PDD WebSocket closes without an explicit stop request
- **THEN** the system records a warning diagnostic and removes the active runtime connection

#### Scenario: Inference endpoint is missing
- **WHEN** reply generation, knowledge import, or inference health requires an OpenAI-compatible endpoint that is not configured
- **THEN** the system records a model-configuration diagnostic and the UI shows inference as not ready

#### Scenario: Knowledge index is unavailable
- **WHEN** knowledge import or search cannot open the local vector index
- **THEN** the system records a knowledge diagnostic and preserves existing app state
