## ADDED Requirements

### Requirement: Explicit remote thinking-mode forwarding
The application SHALL allow an operator-selected remote inference configuration to carry an optional, non-secret thinking-mode preference and SHALL forward it as top-level `enable_thinking` for every supported OpenAI-compatible chat, multimodal, and Agent request.

#### Scenario: Operator disables thinking for a Qwen remote model
- **WHEN** the operator saves a remote Qwen model with `enableThinking` set to `false`
- **THEN** normal chat, multimodal, and Agent tool requests include top-level `enable_thinking: false`
- **AND** the selected-provider boundary and API-key redaction behavior remain unchanged

#### Scenario: Remote configuration has no thinking preference
- **WHEN** a remote inference configuration does not define `enableThinking`
- **THEN** the OpenAI-compatible request omits `enable_thinking`
- **AND** the application does not switch providers or add a vendor-specific fallback
