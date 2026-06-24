## ADDED Requirements

### Requirement: Separate governed knowledge stores
The system SHALL maintain logically separate product knowledge and customer-service knowledge stores, scoped by shop.

#### Scenario: Product knowledge is searched
- **WHEN** the Agent searches product knowledge
- **THEN** only enabled, reviewed, shop-scoped product knowledge versions are eligible unless the operator explicitly selects draft material

#### Scenario: Customer-service knowledge is searched
- **WHEN** the Agent searches customer-service knowledge
- **THEN** only enabled, reviewed, shop-scoped customer-service policy entries are eligible

### Requirement: Product sync from real Pinduoduo
The system SHALL synchronize product knowledge from real Pinduoduo product list and detail APIs.

#### Scenario: Incremental sync runs
- **WHEN** an operator starts incremental product sync
- **THEN** the system fetches real product pages, skips unchanged products, and records a sync run with counts, failures, and source metadata

#### Scenario: Full sync runs
- **WHEN** an operator starts full product sync
- **THEN** the system refreshes all available real products for the selected shop and records added, updated, removed, and failed items

### Requirement: Multimodal product extraction
The system SHALL use a real multimodal LLM to extract structured product knowledge from real product text, specs, and images where available.

#### Scenario: Extraction succeeds
- **WHEN** a product has source text or image data
- **THEN** the system extracts structured fields such as brand, origin, ingredients or material, specification, suitable users, shelf life when available, selling points, usage, and FAQ

#### Scenario: Extraction fails
- **WHEN** the multimodal model or product detail API fails
- **THEN** the system records a retryable failure, preserves the product source record, and does not promote unreviewed guessed knowledge

### Requirement: Knowledge lifecycle governance
The system SHALL support source tracking, versioning, review status, enabled/disabled state, conflict detection, staleness detection, bulk import, diff review, rollback, and citation tracing.

#### Scenario: Knowledge is updated
- **WHEN** product sync, LLM extraction, manual edit, or import changes a knowledge entry
- **THEN** the system creates a new version with source, actor, timestamp, diff, and review state

#### Scenario: Operator rolls back
- **WHEN** an operator rolls back a knowledge entry
- **THEN** the prior reviewed version becomes active and future Agent citations reference the restored version

#### Scenario: Agent cites knowledge
- **WHEN** the Agent uses knowledge in a reply
- **THEN** the reply audit stores the knowledge entry ID, version, scope, and source type

### Requirement: Customer-service knowledge management
The system SHALL support merchant-managed customer-service knowledge with tags, enabled state, batch import, duplicate detection, and review.

#### Scenario: Batch import runs
- **WHEN** the operator imports customer-service knowledge rows
- **THEN** the system validates rows, skips duplicates or conflicts, reports counts, and creates reviewed or pending entries according to the import mode
