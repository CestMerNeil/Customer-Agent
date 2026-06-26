# AGENTS.md

Operating contract for the Customer Agent parity work. The project no longer
uses Mock Pinduoduo, Seam A/B/C, or `verify:flow` as completion evidence.

For general coding behavior (simplicity, surgical changes, goal-driven
execution) follow **CLAUDE.md**; this file only defines repository-specific
verification rules.

## The single verdict

Business-critical completion is proven by sanitized real acceptance records plus
release gates, not by mock logs or fixture-driven tests.

| Layer | Command / artifact | Covers | When |
| --- | --- | --- | --- |
| OpenSpec | `pnpm exec openspec status --change implement-reference-feature-parity` | Task progress and active scope | Before and after implementation sessions |
| OpenSpec validation | `pnpm exec openspec validate implement-reference-feature-parity --strict` | Change artifact validity | Before declaring the change ready |
| Unit/helper tests | `pnpm test` or targeted package tests | Pure helpers and local deterministic state | Inner loop while editing |
| Build/package smoke | `pnpm build`, desktop smoke/package commands | Local build/runtime/package health | Before release gates |
| Real acceptance | Sanitized acceptance records | PDD, LLM, Agent tools, product sync, handoff, queue, multi-shop, release | Required before business tasks are complete |
| PDD calibration | `pnpm pdd:calibration:template` / `pnpm pdd:calibration:validate` / `pnpm pdd:calibration:summarize` | Reference comparison + real endpoint status, parsed field maps, blocked reason taxonomy, no-secrets evidence | When opening new PDD endpoint evidence and before marking PDD tasks complete |

## What must not be used

- Do not reintroduce Mock Pinduoduo, fixture PDD, Seam A/B/C, or `verify:flow`.
- Do not use mocked PDD, mocked WebSocket, mocked buyer messages, mocked LLM,
  mocked Agent tools, mocked knowledge search, mocked product sync, or mocked
  transfer as business completion evidence.
- Do not commit PDD passwords, cookies, tokens, raw buyer messages, private buyer
  contact data, raw payloads, `anti-content`, or LLM API keys.
- Do not put PDD login credentials or raw PDD session material in GitHub Actions.

## Allowed tests

Pure helper tests are still expected. Keep tests focused on deterministic local
logic such as:

- parsers and redactors
- state transitions
- request-shape construction
- local schema validation
- acceptance-record validation
- non-business UI state rendering

These tests can use local stubs for non-business boundaries, but they must not be
presented as evidence that real PDD, LLM, Agent, knowledge, product sync, or
handoff behavior works.

## Real acceptance records

Acceptance records must be sanitized and bound to commit SHA. They may include:

- capability id
- commit SHA and version/tag when applicable
- platform
- generated account/shop aliases such as `pdd-account-a` and `shop-a`
- actor
- timestamp
- outcome
- blockers
- concise evidence summary

They must exclude secrets, raw PDD payloads, and private buyer data. CI should
validate record shape and leak checks, but CI must not log in to Pinduoduo.

## Phase loop

Use this loop for parity implementation:

```
read OpenSpec task -> write failing helper test when applicable -> implement ->
run targeted verification -> update task checkbox -> repeat
```

For PDD-dependent work:

```
reference audit -> sanitized live calibration -> real acceptance record -> task completion
```

If a real account, buyer/test-message path, local model dependency, or PDD
permission is unavailable, keep the related task incomplete or blocked. Do not
substitute mock evidence.
