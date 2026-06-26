## ADDED Requirements

### Requirement: Preserve Local Model Operation
The system SHALL preserve local-model operation as a first-class supported inference mode in the Electron + TypeScript application.

#### Scenario: Agent uses local inference
- **GIVEN** the operator selects the managed local inference profile
- **AND** the required local runtime and model are available or provisionable
- **WHEN** the Agent generates a reply, summarizes memory, or creates embeddings
- **THEN** the request is served through the managed local runtime owned by the desktop app
- **AND** the acceptance record includes the local runtime name, runtime version, model identifier, model checksum or manifest version, platform, and commit SHA

### Requirement: Responses API-Compatible Runtime Contract
The system SHALL use a Responses API-compatible model contract for both local and remote inference providers.

#### Scenario: Agent uses model tools
- **GIVEN** the Agent needs model-driven tool use
- **WHEN** it sends a request to either a local runtime or a remote model provider
- **THEN** the request uses the same Responses-style contract for messages, tool definitions, tool calls, tool outputs, and final responses
- **AND** the Agent does not depend on model-authored plain-text JSON as the primary tool-call mechanism

#### Scenario: Local runtime candidate lacks required Responses behavior
- **GIVEN** a local runtime candidate is being evaluated
- **WHEN** it cannot natively support the required tool-call round trip, tool-result continuation, final response, or required multimodal input behavior
- **THEN** the runtime candidate is rejected or marked blocked for the affected capability
- **AND** the implementation evaluates or selects another runtime instead of hiding the gap behind prompt-only JSON parsing inside the Agent

#### Scenario: Runtime selection is recorded
- **WHEN** a local runtime is approved for release
- **THEN** the model/runtime manifest records the runtime name, version, supported Responses contract features, unsupported features, model formats, platform support, license constraints, and acceptance evidence references

### Requirement: Managed Runtime Provisioning
The system SHALL provide a managed runtime provisioning path that does not require the user to install `llama-server`, Ollama, LM Studio, Python, or other external LLM tools manually.

#### Scenario: Runtime is missing on first launch or first local inference setup
- **GIVEN** the packaged desktop app is launched on macOS or Windows
- **AND** no compatible runtime binary exists in the app resources or user cache
- **WHEN** the operator enables local inference
- **THEN** the app downloads or installs the platform-approved runtime binary from a checksummed manifest
- **AND** it verifies checksum and signature where available before execution
- **AND** it records a sanitized provisioning event without exposing local paths beyond diagnostic-safe metadata

### Requirement: Managed Model Provisioning
The system SHALL provide managed model provisioning with a reviewed model manifest, resumable downloads, integrity checks, cache reuse, and disk-space validation.

#### Scenario: Default local model is missing
- **GIVEN** the selected local inference profile references a default model
- **AND** the model file is not present in the local cache
- **WHEN** first-launch or first-use provisioning starts
- **THEN** the app checks available disk space, downloads the model with visible progress and retry/resume support, verifies the expected checksum, and stores it under the app-managed data directory
- **AND** the user does not need to paste a model URL, choose a `.gguf` path, or install a separate model manager

### Requirement: Local Runtime Health and Recovery
The system SHALL manage local runtime lifecycle, health checks, port allocation, failure recovery, and safe local-profile recovery states.

#### Scenario: Local runtime fails to start
- **GIVEN** local inference is selected
- **WHEN** the runtime process cannot start, bind a port, load the model, or pass the OpenAI-compatible health check
- **THEN** the UI shows a specific recoverable state and a sanitized error
- **AND** the app does not silently switch to another model profile unless the operator has explicitly selected that local profile
- **AND** the failed attempt is recorded in diagnostics and release acceptance evidence when relevant

### Requirement: Multimodal Capability Declaration
The system SHALL declare whether each configured local model profile supports chat, embeddings, and multimodal extraction.

#### Scenario: Product sync requires image extraction
- **GIVEN** product-knowledge sync needs multimodal extraction from real product images
- **WHEN** the selected local model profile lacks multimodal support
- **THEN** the app blocks the sync or asks the operator to select an approved local multimodal profile or approved chain of local model profiles
- **AND** the acceptance record identifies which real model profile performed the extraction
- **AND** the system does not offer or execute remote multimodal fallback

#### Scenario: Release baseline is selected
- **WHEN** the release model profile is defined
- **THEN** the default candidate is a small Gemma-family local multimodal model unless model licensing, runtime compatibility, or platform viability disqualifies it
- **AND** the selected profile records exact model ID, license, file size, checksum, supported capabilities, and platform runtime requirements

### Requirement: Platform Release Packaging
The system SHALL include local-runtime provisioning in macOS and Windows release gates.

#### Scenario: GitHub Actions builds release artifacts
- **GIVEN** a tagged release workflow builds macOS and Windows desktop packages
- **WHEN** the workflow validates release readiness
- **THEN** it verifies the runtime/model manifest, checksums, license metadata, packaged resource paths or download URLs, and a packaged runtime smoke test for each target platform
- **AND** the release metadata links the packaged app, runtime manifest, model manifest, acceptance records, commit SHA, tag, and checksums
