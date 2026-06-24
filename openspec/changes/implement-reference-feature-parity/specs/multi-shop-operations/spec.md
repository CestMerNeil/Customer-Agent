## ADDED Requirements

### Requirement: Multi-account and multi-shop isolation
The system SHALL isolate accounts, connections, messages, products, knowledge, Agent state, audits, acceptance records, and UI context by channel, shop, and account.

#### Scenario: Operator switches shop
- **WHEN** an operator changes the selected shop
- **THEN** the UI reloads only that shop's conversations, products, knowledge, Agent audits, connection state, and acceptance status

#### Scenario: Agent searches knowledge
- **WHEN** the Agent searches knowledge for a buyer conversation
- **THEN** the system uses only the shop scope associated with that conversation

### Requirement: Cross-shop safety
The system SHALL prevent cross-shop replies, product recommendations, knowledge citations, and acceptance evidence reuse.

#### Scenario: Product belongs to another shop
- **WHEN** the Agent attempts to recommend or send a goods card for a product outside the active conversation's shop
- **THEN** the system blocks the tool call and records a cross-shop safety violation

#### Scenario: Release evidence is checked
- **WHEN** release gates evaluate acceptance records
- **THEN** the records must identify the accepted shop/account scope and cannot be reused for an unrelated target scope

### Requirement: Multi-account connection management
The system SHALL support starting, stopping, and monitoring multiple real Pinduoduo accounts independently.

#### Scenario: One account fails
- **WHEN** one account enters relogin-required or error state
- **THEN** other accounts continue operating unless they share the same affected shop dependency
