## ADDED Requirements

### Requirement: Proactive governed catalog exposure
The system SHALL expose the first compact page of eligible current-shop customer-service knowledge metadata to the Agent before its first model response.

#### Scenario: Agent turn starts with eligible knowledge
- **WHEN** an AI-eligible buyer message reaches the Agent
- **THEN** the system calls the existing customer-service catalog tool before the first model request
- **AND** the initial model input includes citation IDs, titles, tags, versions, and pagination state without full knowledge text
- **AND** the catalog call and result are recorded in Agent audit events

#### Scenario: Current shop has no eligible knowledge
- **WHEN** the catalog contains no reviewed, enabled, non-stale, non-conflicting entries for the current shop
- **THEN** the initial model input explicitly states that no customer-service knowledge is available
- **AND** the Agent does not receive knowledge from another shop

### Requirement: Agent-selected exact knowledge retrieval
The system SHALL keep full customer-service knowledge content behind exact Agent-selected citation IDs.

#### Scenario: Agent selects relevant catalog entries
- **WHEN** the Agent selects one or more citation IDs from the exposed catalog
- **THEN** it calls the existing detail tool
- **AND** the tool revalidates current-shop eligibility before returning full content and version-bound citations

#### Scenario: Agent decides knowledge is irrelevant
- **WHEN** the buyer message does not require merchant knowledge after catalog inspection
- **THEN** the Agent may answer without a detail-tool call
- **AND** the audit trail still proves that the governed catalog was exposed

### Requirement: Citation-bound final audit
The system SHALL bind every final Agent audit event to the deduplicated citations gathered during that Agent turn.

#### Scenario: Knowledge detail grounds the reply
- **WHEN** a successful detail or product tool returns citations before the final reply
- **THEN** the final Agent audit event includes those citations
- **AND** the operator can distinguish catalog exposure, content retrieval, and final grounding
- **AND** the event is durably persisted before successful PDD delivery is recorded
- **AND** the audit summary does not copy the knowledge body or model reply text

#### Scenario: Final reply has no gathered citations
- **WHEN** no successful tool returned citations during the Agent turn
- **THEN** the final audit event contains an empty citation list rather than implying knowledge use

### Requirement: Explicit empty handoff configuration
The system SHALL treat a persisted empty handoff-keyword list as disabling keyword interception.

#### Scenario: Operator clears all handoff keywords
- **WHEN** handoff settings exist with an empty keyword list
- **THEN** the system does not restore fallback default keywords
- **AND** an otherwise AI-eligible policy question proceeds to the Agent workflow

### Requirement: Real Agentic RAG acceptance
The system SHALL require sanitized real acceptance evidence before declaring Agentic RAG orchestration complete.

#### Scenario: Knowledge-grounded real reply is accepted
- **WHEN** an operator verifies a real current-shop knowledge question
- **THEN** the same-message acceptance evidence shows ordered catalog exposure, exact detail retrieval, matching final citations, and successful real PDD delivery without storing raw knowledge, buyer content, or secrets
- **AND** machine-generated evidence remains blocked until operator review

#### Scenario: No-knowledge path is accepted
- **WHEN** an operator verifies a real question for which no eligible knowledge applies
- **THEN** the evidence shows catalog exposure, no false detail citation, and a safe final response or handoff
