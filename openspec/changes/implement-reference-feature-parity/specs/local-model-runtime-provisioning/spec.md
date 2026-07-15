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
The system SHALL use a Responses API-compatible model contract for both kinds of ModelProvider. A ModelProvider is the supplier of models behind this unified contract and is one of exactly two kinds: a `remote` provider (any OpenAI-compatible cloud endpoint such as DashScope/Qwen) or a `local` provider (an app-managed `llama-server`). Both kinds expose the same chat, embedding, and multimodal surface; only the local kind additionally owns a managed runtime.

#### Scenario: Agent uses model tools
- **GIVEN** the Agent needs model-driven tool use
- **WHEN** it sends a request to either a local or a remote ModelProvider
- **THEN** the request uses the same Responses-style contract for messages, tool definitions, tool calls, tool outputs, and final responses
- **AND** the Agent does not depend on model-authored plain-text JSON as the primary tool-call mechanism

#### Scenario: Managed llama-server profile lacks required Responses behavior
- **GIVEN** an app-managed `llama-server` version and approved local profile are being evaluated
- **WHEN** the combination cannot natively support the required tool-call round trip, tool-result continuation, final response, or required multimodal input behavior
- **THEN** that combination is marked blocked for the affected capability and cannot pass release gates
- **AND** the app-managed runtime must be updated and revalidated instead of selecting a user-installed runtime or hiding the gap behind prompt-only JSON parsing inside the Agent

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

### Requirement: ModelScope-Only Managed Model Provisioning
The system SHALL provision local models only from a reviewed ModelScope manifest with resumable downloads, integrity checks, cache reuse, and disk-space validation. Product settings SHALL NOT accept an arbitrary model URL or local model path.

#### Scenario: Default local model is missing
- **GIVEN** the selected local inference profile references a default model
- **AND** the model file is not present in the local cache
- **WHEN** first-launch or first-use provisioning starts
- **THEN** the app checks available disk space, downloads the locked-revision GGUF and matching `mmproj` from ModelScope with visible progress and retry/resume support, verifies both expected checksums, and stores them under the app-managed data directory
- **AND** the user does not need to paste a model URL, choose a `.gguf` path, or install a separate model manager

#### Scenario: Manifest records model provenance
- **WHEN** an approved local profile is published
- **THEN** the manifest records the official Qwen base model ID separately from the locked-revision community GGUF repository used by `llama-server`
- **AND** it records the main GGUF and matching `mmproj` filenames, ModelScope revision, license, file sizes, and checksums

#### Scenario: Operator supplies an unreviewed source
- **WHEN** an operator attempts to use an arbitrary URL, an unlisted ModelScope artifact, or a local model path
- **THEN** the product rejects it and offers only the reviewed local profiles

### Requirement: Local Runtime Health and Recovery
The system SHALL manage local runtime lifecycle, health checks, port allocation, failure recovery, and safe local-profile recovery states.

#### Scenario: Local runtime fails to start
- **GIVEN** local inference is selected
- **WHEN** the runtime process cannot start, bind a port, load the model, or pass the OpenAI-compatible health check
- **THEN** the UI shows a specific recoverable state and a sanitized error
- **AND** the app does not silently switch to another model profile unless the operator has explicitly selected that local profile
- **AND** the failed attempt is recorded in diagnostics and release acceptance evidence when relevant

#### Scenario: UI polls local health
- **WHEN** the renderer requests a routine local-runtime health status
- **THEN** the system only inspects the owned runtime and endpoint
- **AND** it does not download a model, install a runtime, or start a child process

#### Scenario: Concurrent provisioning requests target one artifact
- **WHEN** two explicit operator actions request the same reviewed model artifact concurrently
- **THEN** they share one verified download and cannot race on the same partial or final file

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
- **THEN** the only selectable profiles are Qwen3.5-4B lightweight, Qwen3.5-9B default, and Qwen3.6-35B-A3B high-end
- **AND** every profile supports real image and text input through its matching GGUF and `mmproj`
- **AND** no approved profile exceeds Qwen3.6-35B-A3B, with 35B total parameters and approximately 3B activated per token

#### Scenario: High-end resource requirements are shown
- **WHEN** the UI displays Qwen3.6-35B-A3B
- **THEN** it identifies 35B total parameters and approximately 3B activated per token
- **AND** it states that `A3B` does not mean a 3B download or 3B memory requirement
- **AND** it presents the manifest download size and disk/memory guidance before provisioning

### Requirement: Platform Release Packaging
The system SHALL include local-runtime provisioning in macOS and Windows release gates.

#### Scenario: GitHub Actions builds release artifacts
- **GIVEN** a tagged release workflow builds macOS and Windows desktop packages
- **WHEN** the workflow validates release readiness
- **THEN** it verifies the runtime/model manifest, checksums, license metadata, packaged resource paths or download URLs, and a packaged runtime smoke test for each target platform
- **AND** the release metadata links the packaged app, runtime manifest, model manifest, acceptance records, commit SHA, tag, and checksums

### Requirement: Fresh Real Local-Model Acceptance
The system SHALL require fresh sanitized acceptance for the current commit and locked ModelScope artifact revisions before the three-profile local-model baseline is complete.

#### Scenario: Local profile capability acceptance is recorded
- **GIVEN** one of the three approved local profiles is provisioned from its real ModelScope GGUF and matching `mmproj`
- **WHEN** the profile is evaluated for release
- **THEN** acceptance proves real chat, native tool call, tool-result continuation, final response, and image-plus-text input through the app-managed `llama-server`
- **AND** the record is bound to the current commit SHA, runtime version, profile ID, artifact revisions, and checksums

#### Scenario: Packaged platform acceptance is recorded
- **GIVEN** packaged macOS and Windows applications for the current release candidate
- **WHEN** local-model release readiness is evaluated
- **THEN** each platform has a fresh sanitized record covering managed download, integrity verification, runtime launch, and real multimodal capability acceptance
- **AND** v1.0.3 evidence or any record that predates the current profile revisions is rejected
