## Context

The selected remote provider already flows through one `InferenceConfig` into the shared OpenAI-compatible client. It is currently configured with a hybrid-thinking Qwen model, but the contract has no thinking-mode field, so every request relies on the provider default. The Agent's loop-limit final request also receives its normal tool definitions even though the workflow ignores any tool calls from that request.

## Goals / Non-Goals

**Goals:**

- Let the operator persist a non-secret explicit thinking choice and propagate it only when configured.
- Use the existing remote model settings to select `qwen3.6-flash` with thinking disabled.
- Make loop-limit finalization deterministic and tool-free while preserving prior tool results and citations.
- Verify payload construction locally and measure one generic, sanitized remote request after the switch.

**Non-Goals:**

- Streaming UI, a new provider abstraction, a model fallback, or a database migration.
- Parallelizing Agent tools, changing the normal loop limit, or moving memory compression off the critical path.
- Treating the performance check as PDD or business acceptance evidence.

## Decisions

### 1. Reuse the existing optional inference configuration

Add `enableThinking?: boolean` to the existing core and client configuration contracts. The settings UI saves it, and the shared request builder emits top-level `enable_thinking` only when it is defined. This covers normal, multimodal, and Agent requests without provider-specific business code.

Alternative: force the field for every provider. Rejected because it is a non-standard Qwen parameter and could break unrelated OpenAI-compatible endpoints.

### 2. Preserve the existing selected-provider factory

The provider factory already passes the selected remote configuration unchanged to the shared client. No provider registry, migration, or secret-bearing renderer response is needed.

Alternative: add a Qwen provider class. Rejected because there is one existing factory and one optional request field.

### 3. Make the loop-limit request final by construction

Pass an empty tool list to the existing final model request. The request builder consequently uses `tool_choice: "none"`; prior tool outputs, continuation state, and gathered citations remain intact.

Alternative: parallelize tools or lower the normal loop cap. Rejected because real PDD send and transfer tools have ordering and audit semantics, and no measurement shows that the normal cap is the current bottleneck.

## Risks / Trade-offs

- [A non-Qwen endpoint may reject `enable_thinking`] → Omit the field unless the operator explicitly saves a preference.
- [Flash quality may be weaker for complex cases] → Keep tool verification, handoff, and the current fallback behavior unchanged.
- [The loop-limit optimization is low-frequency] → Treat it as a safe cleanup, not the claimed source of the primary latency gain.

## Migration Plan

1. Add the optional setting and focused request/loop tests.
2. Rebuild, open model settings, save `qwen3.6-flash` with thinking disabled, then run the existing thorough health check.
3. Run one generic non-business latency request and compare it with the saved baseline; do not send a PDD message.
4. Roll back by restoring the previous model or removing the optional thinking preference; stored business data is unchanged.

## Open Questions

None.
