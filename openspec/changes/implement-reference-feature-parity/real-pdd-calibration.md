# Real PDD Calibration Plan

Calibration records endpoint behavior without storing secrets or raw buyer data.
Each record is tied to commit SHA, platform, generated account alias, generated
shop alias, endpoint purpose, result, parsed field map, and sanitized blocker.

## Procedure

1. Compare the target endpoint against the reference project at commit
   `59467291c64dd69335d3e52612e38556a1833865`.
2. Run the local app or calibration helper with a real logged-in account.
3. Capture only sanitized schema summaries and parsed fields.
4. Classify the capability as:
   - `supported`
   - `blocked_by_account_permission`
   - `blocked_by_endpoint_drift`
   - `blocked_by_test_path`
   - `blocked_by_local_model`
5. Keep the corresponding OpenSpec task incomplete until real acceptance passes.

## Capabilities To Calibrate

- login and session extraction
- user info and shop info
- chat token retrieval
- online/offline status
- WebSocket receive
- text send
- image send where supported
- goods-card send
- customer-service list
- conversation transfer
- product list
- product detail
- session expiry and relogin-required signatures
- retryable network/server failures
- `anti-content` and browser-like header handling for product/goods-card APIs

## Redaction Rules

Never persist:

- passwords
- cookies
- raw tokens
- raw buyer payloads
- buyer contact details
- raw `anti-content`
- private message text
- LLM API keys

Use generated aliases such as `pdd-account-a`, `pdd-account-b`, `shop-a`, and
`shop-b` in committed records.
