## 1. Remote Qwen generation setting

- [x] 1.1 Add the optional non-secret `enableThinking` inference setting and expose it in the existing remote settings form.
- [x] 1.2 Forward an explicit setting as top-level `enable_thinking` for chat, multimodal, and Agent requests, with focused payload tests.

## 2. Agent loop finalization

- [x] 2.1 Send no tools in the loop-limit final request while preserving prior tool outputs and citations.
- [x] 2.2 Add a focused workflow assertion for tool-free loop-limit finalization.

## 3. Verification and live configuration

- [x] 3.1 Run focused tests, typecheck, build, and strict OpenSpec validation.
- [x] 3.2 Save `qwen3.6-flash` with thinking disabled, then run one sanitized non-business remote latency check without sending a PDD message.
