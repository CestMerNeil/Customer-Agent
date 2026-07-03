# Real PDD Calibration

Calibration records endpoint behavior without storing secrets or raw buyer data.
Each record is tied to commit SHA, platform, generated account/shop alias, endpoint
purpose, status, parsed field map, and sanitized errors.

## Procedure

1. Compare target endpoint behavior against reference at commit
   `59467291c64dd69335d3e52612e38556a1833865`.
2. Run the local app or calibration helper with a real logged-in account.
3. Capture only sanitized schema summaries and parsed fields.
4. Classify each capability using one status:
   - `supported`
   - `blocked_by_account_permission`
   - `blocked_by_endpoint_drift`
   - `blocked_by_local_model`
   - `blocked_by_test_path`
   - `blocked_unknown`
5. Record the result and reference comparison in a calibration report.
6. Keep the corresponding OpenSpec task incomplete until real acceptance passes.

## Command workflow

Generate a sanitized calibration template:

```bash
pnpm pdd:calibration:template \
  -- --commit <sha> \
  --platform <darwin-arm64|win32-x64> \
  --out calibration/pdd-calibration-<sha>.json
```

Validate completed calibration evidence:

```bash
pnpm pdd:calibration:validate \
  -- --file calibration/pdd-calibration-<sha>.json \
  --commit <sha>
```

Summarize a completed calibration run:

```bash
pnpm pdd:calibration:summarize \
  -- --file calibration/pdd-calibration-<sha>.json \
  --out calibration-summary/pdd-calibration-summary-<sha>.json
```

## Reference comparison record

- `referenceCommit` must be recorded for all entries.
- `referenceComparison` must be `unknown`, `matched`, or `drift`.
- `status` is `supported` only when parsed fields are available and the endpoint
  behaves as required.
- `errorSummary` is required for blocked statuses and must be sanitized.
- `antiContentHandling` captures how `anti-content` was handled (`query-param`, `header-only`, `header-plus-query`).
- `browserHeaderProfile` captures the browser-like header strategy used for product/goods-card endpoints.
- `failureSignatures` captures session-expiry, cookie refresh, relogin-required, rate-limit, and retry behavior observed from real live runs.

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

## Capabilities To Calibrate

- login and session extraction
- user info and shop info
- chat token retrieval
- online/busy/offline customer-service status
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
