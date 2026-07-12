## Context

The Agent currently exposes `search_customer_service_knowledge(query)`. After the model chooses that tool, application code tokenizes the query and ranks knowledge with substring matches. This conflicts with the embedding-free design because deterministic keyword code, rather than the AI, decides which knowledge reaches the answer.

## Goals / Non-Goals

**Goals:**

- Make the Agent the final relevance decision-maker for customer-service knowledge.
- Preserve strict current-shop, reviewed, enabled, non-stale, non-conflict eligibility.
- Keep full knowledge text out of the initial prompt until the Agent explicitly selects IDs.
- Preserve citation and audit evidence when selected knowledge is fetched.

**Non-Goals:**

- Embeddings, vector storage, semantic indexes, or reranking models.
- Changes to document parsing, knowledge persistence, product tools, or Model Provider routing.
- Automatically injecting customer-service knowledge into every conversation.

## Decisions

- Replace `search_customer_service_knowledge` with `list_customer_service_knowledge` and `get_customer_service_knowledge`.
- The list tool returns a compact current-shop catalog containing citation ID, title, tags, and version, but no knowledge citations because catalog inspection is not evidence use.
- The get tool accepts up to ten exact citation IDs, revalidates eligibility and shop scope, returns full content, and attaches citations.
- Catalog pages contain at most 50 records. The Agent may request a later page; the normal list → get → final path fits the existing tool-loop limit.
- Agent instructions require catalog inspection for policy questions and prohibit answering from catalog metadata alone.

## Risks / Trade-offs

- [A shop with many entries may need another catalog page] → expose page metadata and keep deterministic ordering.
- [The Agent may choose a wrong ID] → full content is returned before the final answer and remains visible in audit events.
- [The Agent may invent an ID] → the get tool rejects IDs outside the eligible current-shop set.
- [Catalog tokens grow with knowledge volume] → return only title, tags, ID, and version with a fixed page size.
