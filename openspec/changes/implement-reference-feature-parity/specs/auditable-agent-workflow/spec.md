## ADDED Requirements

### Requirement: Multi-turn tool-calling Agent
The system SHALL provide a multi-turn Agent that can call real tools, append tool results, and loop until a final reply or configured limit.

#### Scenario: Tool call loop completes
- **WHEN** the LLM requests one or more supported tools
- **THEN** the Agent executes the real tools, appends sanitized tool results, and continues until it returns a final answer or reaches the configured loop limit
- **AND** tool calls and tool results are exchanged through the shared Responses API-compatible model contract, not through model-authored plain-text JSON parsed from a normal assistant message

#### Scenario: Loop limit is reached
- **WHEN** the Agent reaches the maximum tool-call loop count
- **THEN** it stops further tool execution, asks the model for a final response based on gathered information, and records a loop-limit audit event

### Requirement: Reference-Equivalent Agent Message Construction
The system SHALL construct Agent requests in the same business shape as the reference Agent while preserving the Electron + TypeScript architecture.

#### Scenario: Product context is available before recommendation
- **WHEN** a buyer asks for a product recommendation, comparison, or help choosing what to buy
- **THEN** the Agent includes a current shop-scoped product-list context or performs the equivalent `get_shop_products` tool step before producing the final reply
- **AND** the final reply is grounded in real reviewed product knowledge and real goods IDs

#### Scenario: Tool protocol is provider-independent
- **WHEN** the Agent runs against a local runtime or a remote model provider
- **THEN** it uses the same internal Response model events for function calls, tool outputs, citations, and final text
- **AND** provider-specific differences are isolated in the model runtime layer rather than in Agent business logic

### Requirement: Required Agent tools
The system SHALL implement the real tools `get_shop_products`, `send_goods_link`, `get_product_knowledge`, `search_customer_service_knowledge`, and `transfer_conversation`.

#### Scenario: Product recommendation uses tools
- **WHEN** a buyer asks for a recommendation
- **THEN** the Agent can fetch real shop products, choose a real goods ID, send a real goods card when appropriate, and explain the recommendation source

#### Scenario: Product question uses product knowledge
- **WHEN** a buyer asks about a specific product
- **THEN** the Agent queries product knowledge scoped to the buyer's shop and product context before answering

#### Scenario: Policy question uses customer-service knowledge
- **WHEN** a buyer asks about logistics, refund, after-sales, invoice, or policy topics
- **THEN** the Agent queries customer-service knowledge scoped to the buyer's shop before answering

### Requirement: Conversation memory and compression
The system SHALL persist conversation history and maintain a bounded context window with summary compression when necessary.

#### Scenario: Existing buyer returns
- **WHEN** a buyer sends another message in an existing conversation
- **THEN** the Agent includes relevant prior conversation context without crossing shop or buyer boundaries

#### Scenario: Context window is exceeded
- **WHEN** the estimated conversation context exceeds the configured threshold
- **THEN** the system creates a summary with a real LLM and preserves the latest messages needed for continuity

### Requirement: Auditable Agent decisions
The system SHALL record and expose Agent decisions, tool calls, tool inputs, tool outputs, knowledge citations, goods-card decisions, handoff decisions, errors, and retries using sanitized data.

#### Scenario: Agent sends a reply
- **WHEN** the Agent creates or sends a reply
- **THEN** the UI and logs show which tools and knowledge versions influenced the reply

#### Scenario: Agent transfers conversation
- **WHEN** the Agent triggers human handoff
- **THEN** the system records the triggering keyword or intent, business-hours decision, selected transfer path, and result

### Requirement: No business-critical mocks for Agent completion
The system SHALL NOT use mocked LLM responses, mocked Agent tools, mocked knowledge search, or mocked Pinduoduo tool results as completion evidence.

#### Scenario: Agent acceptance is run
- **WHEN** Agent parity is evaluated
- **THEN** the run uses a real LLM endpoint, real knowledge stores, and real Pinduoduo operations for any PDD-dependent tool
