# Electron Production Readiness Manual Acceptance

## Sensitive data rules

All acceptance, diagnostic, and operator traces must follow these hard rules:

- Do not store raw passwords.
- Do not store plaintext cookies, session tokens, authentication tokens, or bearer secrets.
- Do not store raw private message payloads from buyers.
- Do not store private buyer contact details (phone, email, full name, address, account IDs).
- Only store sanitized notes and identifiers required for readiness evidence.

If a source record contains sensitive data, redact before writing:
- Replace account or buyer references with deterministic aliases.
- Replace IDs/UIDs with tokenized placeholders.
- Remove cookies/tokens from payload snapshots.
- Keep only business-level outcomes and error summaries in logs.

## Acceptance evidence template

Use one record per acceptance run or per independently verified step.

```text
date: YYYY-MM-DD
app_version_or_commit: <version or git sha>
platform: <macOS version / runtime>
account_alias: <sanitized alias>
shop_id: <shop id or "unknown">
step: <login | session-extraction | start | receive-message | generate-reply | send-reply | stop>
outcome: <pass | fail | blocked>
blocker: <short external blocker or "none">
notes: <sanitized notes only>
```

Rules:
- Keep account aliases sanitized and non-identifying.
- Do not store passwords, plaintext cookies, tokens, raw private payloads, or private buyer contact details.
- Record one blocker per step when a step is blocked instead of folding it into a single overall result.

## 2026-06-03 real PDD acceptance record

- date: 2026-06-03
- app_version_or_commit: real PDD merchant acceptance run; version or commit not captured in the source record
- platform: macOS desktop runtime
- account_alias: sanitized merchant alias
- shop_id: captured in the local acceptance record, omitted here for sanitization
- login: pass
- session_extraction: pass
- start: pass
- receive_message: blocked
- generate_reply: blocked
- send_reply: blocked
- stop: pass
- blocker: buyer/test-message path was not available for receive and send validation
- notes: real merchant acceptance confirmed the login/session extraction/account lifecycle path; buyer-message validation remains pending external coordination

## Manual acceptance instructions

Track each step independently and record a result for each one:

1. Login
2. Session extraction
3. Start
4. Receive message
5. Generate reply
6. Send reply
7. Stop

For each step, capture:
- the step outcome
- any blocker that prevented completion
- sanitized notes that explain what was observed

Keep the record granular. A single successful login/start/stop run does not imply receive-message or send-reply validation passed.

## Readiness classification

Classify readiness from evidence rather than a single status flag:

- `demo-ready`: core package tests pass and the app can launch with local persistence.
- `acceptance-ready`: real PDD login, session extraction, account start, and account stop each have passing evidence.
- `release-ready`: all required merchant acceptance steps pass, release preflight passes, packaged runtime smoke passes, and no critical diagnostics remain open.

If receive-message or send-reply are blocked by an external buyer/test-message dependency, the record can still support `acceptance-ready` as long as the login/session/start/stop evidence is present and clearly recorded.
