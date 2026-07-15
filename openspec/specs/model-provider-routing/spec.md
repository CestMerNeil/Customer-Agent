# Model Provider Routing

## Purpose

Define the single selected-provider boundary for all desktop model operations, including multimodal product extraction and visible failure handling.

## Requirements

### Requirement: Unified Model Provider routing
The application SHALL route chat, Responses, health, and multimodal model requests through the operator-selected Model Provider. Business features MUST NOT select a provider by reading local runtime fields or vendor-specific configuration.

#### Scenario: Remote provider performs product extraction
- **WHEN** the operator selects a configured remote Model Provider and starts product sync
- **THEN** product text and images are sent through that remote provider's OpenAI-compatible multimodal endpoint
- **AND** the product-sync business path does not inspect local model profiles, `mmproj`, or managed runtime paths

#### Scenario: Local provider performs product extraction
- **WHEN** the operator selects a local Model Provider with declared multimodal capability and starts product sync
- **THEN** the provider layer ensures the managed local runtime is ready and performs extraction through the same internal multimodal contract

### Requirement: No implicit provider fallback
The application SHALL use only the selected Model Provider for a model operation and MUST NOT silently send data to another provider when the selected provider lacks a capability or fails.

#### Scenario: Selected local provider lacks vision support
- **WHEN** product sync requests multimodal extraction from a selected local provider without declared vision support
- **THEN** the operation fails with an actionable local capability error
- **AND** no remote endpoint is called

#### Scenario: Selected remote provider rejects image input
- **WHEN** the configured remote provider rejects or cannot complete a multimodal request
- **THEN** the operation records and displays the sanitized provider failure
- **AND** no local runtime is started as fallback

### Requirement: Provider failure visibility
The application SHALL preserve and display the actionable sanitized failure produced by the selected Model Provider for background product-sync operations.

#### Scenario: Product extraction fails in the background
- **WHEN** the selected provider fails after product sync has started
- **THEN** the knowledge UI displays the recorded failure reason instead of only a generic retry message
- **AND** diagnostics identify the selected provider kind without exposing API keys, raw payloads, or private product data
