## Why

The current remote model is a hybrid-thinking `qwen3.7-plus` model, but the client never sends an explicit thinking-mode choice. Every Agent turn therefore waits for default reasoning and, in the loop-limit fallback, is still offered tools that the workflow will not execute.

## What Changes

- Persist an explicit remote generation setting and forward Qwen's top-level `enable_thinking` parameter for chat, multimodal, and Agent tool requests.
- Switch the configured remote chat model to `qwen3.6-flash` with thinking disabled through the existing settings surface.
- Make the loop-limit Agent fallback request a direct final reply without callable tools.
- Verify the request payloads locally and run one sanitized, non-business remote latency comparison after the switch.

## Capabilities

### New Capabilities

- `agent-reply-latency`: Bounded Agent finalization that avoids another unusable tool-selection turn after the workflow reaches its loop limit.

### Modified Capabilities

- `model-provider-routing`: The selected remote provider configuration carries an explicit, non-secret Qwen thinking-mode option to every supported model operation.

## Impact

- Affected packages: `@customer-agent/core`, `@customer-agent/inference`, and `@customer-agent/agents`.
- Affected desktop surfaces: model settings and the existing provider factory path.
- No new dependency, provider kind, PDD behavior, or business acceptance claim is introduced.
