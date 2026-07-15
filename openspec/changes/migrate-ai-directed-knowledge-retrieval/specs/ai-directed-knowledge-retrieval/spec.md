## ADDED Requirements

### Requirement: Agent-controlled customer-service retrieval
The system SHALL let the customer Agent decide whether customer-service knowledge is needed and which governed knowledge entries to read without embeddings or application keyword ranking.

#### Scenario: Policy knowledge may be needed
- **WHEN** a buyer asks a policy, logistics,售前, or售后 question requiring merchant knowledge
- **THEN** the Agent may inspect the eligible current-shop knowledge catalog and select exact knowledge IDs

#### Scenario: Knowledge is not needed
- **WHEN** the buyer message can be answered without merchant facts
- **THEN** the Agent may respond without invoking customer-service knowledge tools

### Requirement: Compact governed knowledge catalog
The catalog tool SHALL return only current-shop, reviewed, enabled, non-stale, non-conflicting knowledge metadata in deterministic bounded pages.

#### Scenario: Agent lists knowledge
- **WHEN** the Agent calls the catalog tool for a page
- **THEN** it receives citation IDs, titles, tags, versions, and pagination state without full knowledge content

### Requirement: Exact knowledge fetch with citations
The detail tool SHALL fetch full content only for exact eligible citation IDs selected by the Agent and SHALL attach governed citations.

#### Scenario: Agent selects valid knowledge IDs
- **WHEN** the Agent requests one or more IDs from the current-shop catalog
- **THEN** the tool returns their full content and version-bound citations for final grounding and audit

#### Scenario: Agent supplies an invalid or cross-shop ID
- **WHEN** an ID is not eligible in the current shop
- **THEN** the tool excludes it and reports that no eligible matching knowledge was found

### Requirement: Existing business boundaries remain unchanged
The migration SHALL NOT change product knowledge tools, document ingestion, Model Provider selection, or knowledge persistence.

#### Scenario: Migration is deployed
- **WHEN** the new customer-service tools become available
- **THEN** product recommendation, product detail, goods-card, transfer, ingestion, and governance paths retain their existing contracts
