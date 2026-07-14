## ADDED Requirements

### Requirement: Persistent message queue
The system SHALL persist inbound buyer messages before Agent or human-handoff processing.

#### Scenario: Message arrives
- **WHEN** a real Pinduoduo WebSocket buyer message arrives
- **THEN** the system persists the normalized message and enqueues it before processing starts

#### Scenario: App restarts
- **WHEN** the app restarts with queued or in-flight messages
- **THEN** the system resumes eligible pending work without losing messages

### Requirement: Per-conversation ordering with multi-conversation concurrency
The system SHALL process messages concurrently across conversations while preserving order inside each buyer conversation.

#### Scenario: Same buyer sends multiple messages
- **WHEN** two messages from the same buyer conversation are queued
- **THEN** the second message is processed only after the first message reaches a terminal or retry-waiting state

#### Scenario: Different buyers send messages
- **WHEN** messages from different buyer conversations are queued
- **THEN** the system processes them concurrently subject to configured limits

### Requirement: Handler chain and human priority
The system SHALL process queued messages through a configurable handler chain with keyword/intent handoff priority before AI reply.

#### Scenario: Keyword handoff matches
- **WHEN** an inbound text contains a configured handoff keyword
- **THEN** the handoff handler runs before AI reply and the conversation enters human handoff workflow

#### Scenario: AI handles eligible message
- **WHEN** no higher-priority handler claims an eligible buyer message
- **THEN** the AI handler processes the message with the Agent workflow

### Requirement: Queue governance
The system SHALL provide deduplication, retry/backoff, rate limits, circuit breakers, dead-letter handling, queue depth, processing time, failure metrics, and operator-visible state.

#### Scenario: Duplicate message arrives
- **WHEN** the same real Pinduoduo message ID arrives more than once
- **THEN** the system deduplicates it without dropping a distinct buyer message

#### Scenario: Downstream dependency is unhealthy
- **WHEN** PDD, LLM, or knowledge search repeatedly fails
- **THEN** the appropriate circuit breaker opens, queued work is paused or rerouted, and the UI shows the affected dependency and recovery condition

### Requirement: Bounded durable local persistence
The system SHALL serialize and atomically replace SQL.js snapshots, preserve an unreadable database for diagnosis, and bound diagnostic log retention.

#### Scenario: Bursty diagnostics are appended
- **WHEN** connection or dependency failures emit many logs concurrently
- **THEN** persistence coalesces snapshot writes and retains only the configured newest diagnostic rows

#### Scenario: Existing database is unreadable
- **WHEN** startup integrity checks cannot open or validate the database
- **THEN** startup fails with a clear diagnostic and does not silently replace the file with an empty database
