## Why

Customer-service knowledge is currently filtered by application keyword scoring after the Agent decides to search, so the AI is not the actual retriever. The intended architecture rejects embeddings and requires the Agent itself to inspect governed knowledge and decide which approved entries to read.

## What Changes

- Replace the keyword-based customer-service search tool with a two-step AI-directed catalog/detail workflow.
- Let the Agent list compact metadata for eligible knowledge in the current shop and select exact citation IDs.
- Let the Agent fetch full content only for selected eligible citation IDs, producing citations for the final answer and audit trail.
- Update Agent instructions and tool schemas so policy answers use catalog selection before fetching knowledge.
- Preserve existing product knowledge tools, shop isolation, review/enabled gates, and Model Provider infrastructure.
- Do not add embeddings, vector databases, semantic indexes, or model-specific routing.

## Capabilities

### New Capabilities

- `ai-directed-knowledge-retrieval`: Embedding-free Agent-driven catalog inspection and exact governed knowledge retrieval.

### Modified Capabilities

None.

## Impact

- Customer Agent tool names, schemas, workflow instructions, audit events, and focused tests.
- No changes to knowledge ingestion, product synchronization, persistence schema, or shared inference clients.
