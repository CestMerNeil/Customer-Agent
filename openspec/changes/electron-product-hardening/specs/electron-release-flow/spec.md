## ADDED Requirements

### Requirement: Desktop release packaging
The Electron app SHALL include package scripts and configuration for building macOS release artifacts.

#### Scenario: Package config exists
- **WHEN** release scripts are inspected
- **THEN** the desktop package exposes a packaging command and electron-builder configuration

### Requirement: Signing and update hooks
The Electron app SHALL expose configuration placeholders for macOS signing, notarization, and update publishing.

#### Scenario: Credentials are supplied by environment
- **WHEN** packaging runs in a configured CI or developer environment
- **THEN** signing, notarization, and update publishing use environment-provided credentials and URLs
