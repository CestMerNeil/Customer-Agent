## Why

The current customer-service knowledge flow asks the model to decide whether to inspect a catalog it cannot see. Real audit evidence shows zero calls to the new catalog/detail tools, so the implementation behaves as optional tool calling rather than Agentic RAG.

## What Changes

- Automatically place the compact, eligible, current-shop customer-service knowledge catalog into every Agent turn before the first model response.
- Keep full knowledge content behind exact Agent-selected citation IDs through the existing detail tool.
- Bind final Agent audit events to the citations gathered from successful detail and product tools.
- Respect an explicitly empty handoff-keyword list so policy questions are not silently intercepted by fallback defaults before the Agent runs.
- Require sanitized real acceptance evidence for catalog exposure, exact detail retrieval, final grounding, and a legitimate no-knowledge path.
- Do not add embeddings, vector databases, rerankers, or a new RAG framework.

## Capabilities

### New Capabilities

- `agentic-rag-orchestration`: Proactive governed catalog exposure, Agent-selected exact retrieval, citation-bound final replies, and knowledge-aware routing evidence.

### Modified Capabilities

None.

## Impact

- Affects `packages/agents` workflow orchestration and focused tests.
- Affects `apps/desktop/src/main/reply.ts` handoff semantics, Agent audit persistence, and focused tests.
- Affects sanitized manual acceptance and `scripts/acceptance-from-audit.mjs` release evidence for knowledge-grounded replies.
- Adds no dependencies and does not change knowledge persistence, ingestion, Model Provider routing, or PDD APIs.
