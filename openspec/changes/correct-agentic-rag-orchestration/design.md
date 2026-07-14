## Context

The existing workflow exposes customer-service catalog and detail tools to the model with `tool_choice: auto`, but it does not expose any catalog metadata before the first model response. Product recommendations already use an application-level prefetch path, while customer-service knowledge requires two optional model decisions. Live audit records therefore show product-tool activity but no calls to the new customer-service catalog or detail tools.

## Goals / Non-Goals

**Goals:**

- Make compact governed knowledge metadata available before the Agent's first response.
- Keep the Agent responsible for selecting exact citation IDs and keep full text out of the initial prompt.
- Preserve shop, review, enabled, stale, and conflict eligibility boundaries.
- Carry gathered citations into the final Agent audit event.
- Persist Agent audit events in order before recording successful PDD delivery, without copying knowledge or reply text into audit summaries.
- Let an explicitly empty handoff keyword list disable keyword interception.

**Non-Goals:**

- Adding embeddings, vector search, reranking, a second model router, or a new framework.
- Automatically approving draft knowledge or injecting every full knowledge entry into every prompt.
- Changing product sync, document ingestion, PDD APIs, or Model Provider selection.

## Decisions

### 1. Reuse the existing catalog tool as a mandatory local prefetch

Before the first model request, the workflow calls `list_customer_service_knowledge` for page 1 through the existing prefetch event path and appends its compact result to the initial input. This guarantees that the model sees current-shop eligible metadata and that the audit records catalog exposure.

Alternative considered: force the model to call the list tool with `tool_choice`. Rejected because the catalog is a local deterministic read and does not need an extra model round trip.

### 2. Keep exact full-content retrieval Agent-directed

The existing `get_customer_service_knowledge` tool remains model-callable. The Agent selects exact citation IDs from the prefetched catalog, and the tool revalidates eligibility before returning content and citations.

Alternative considered: inject all eligible full text. Rejected because it scales poorly and removes the Agent's retrieval decision.

### 3. Reuse the workflow event result field for final grounding evidence

Final events include the reply text, success state, and deduplicated citations already gathered from successful tool results. Desktop persistence serializes event writes and waits for the final event before the caller can record successful PDD delivery. Audit summaries retain event status and citation counts, not raw knowledge or model output.

Alternative considered: add a separate grounding table or event type. Rejected because the existing event and audit contracts already carry citations.

### 4. Treat saved empty handoff keywords as an explicit operator choice

Fallback default keywords apply only when handoff settings are absent. A persisted empty array means keyword interception is disabled, so policy questions can reach the Agent and its knowledge workflow.

### 5. Separate deterministic proof from real acceptance

Focused tests prove catalog prefetch, exact retrieval, citation propagation, ordered persistence, and handoff configuration semantics. Release evidence only recognizes an `auditable-agent-workflow` candidate when one message has the ordered catalog → detail → final citation → PDD delivery chain. The generated candidate remains blocked until operator review, and a sanitized real record is still required before declaring the business behavior complete.

## Risks / Trade-offs

- [The first catalog page adds prompt tokens to every Agent turn] → Keep the existing 50-record metadata-only page; add routing only if measured catalog growth makes this material.
- [Relevant knowledge may be on a later page] → Preserve the list tool so the Agent can request subsequent pages.
- [The model may still decide no detail is relevant] → Audit now distinguishes catalog exposure from detail retrieval and final grounding, making that decision observable.
- [Changing empty-keyword semantics may allow more questions to reach AI] → This occurs only when the operator explicitly saved an empty list.

## Migration Plan

1. Deploy the workflow and handoff semantic changes without data migration.
2. Restart the desktop runtime so the rebuilt Agent package is loaded.
3. Run a sanitized real knowledge question that produces catalog, detail, final-citation, and PDD-send events.
4. Roll back the code change if prompt size or provider compatibility regresses; persisted knowledge and audit schemas remain compatible.

## Open Questions

None.
