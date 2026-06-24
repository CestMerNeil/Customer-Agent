## Why

The current Electron implementation proves a narrow mock receive -> reply -> send loop, but the referenced `JC0v0/Customer-Agent` project exposes a broader merchant assistant: real Pinduoduo operations, multi-turn tool-using AI, product and customer-service knowledge, keyword handoff, queue processing, reconnect governance, and Windows delivery. This change establishes business feature parity in the existing Electron + TypeScript architecture, using real Pinduoduo and real runtime evidence instead of mock verdicts.

## What Changes

- Implement business-function parity with the referenced repository at commit `59467291c64dd69335d3e52612e38556a1833865`, using the README as the primary scope and code audit to fill core-path gaps.
- Keep the current Electron + TypeScript architecture; do not migrate back to PyQt/Python or copy the reference repository structure.
- **BREAKING**: Remove the Mock Pinduoduo / Seam A-B-C verification harness and stop using `verify:flow` or fixture-driven PDD doubles as completion evidence.
- Require real Pinduoduo merchant-account verification for core PDD behaviors: login, session extraction, account start/stop, WebSocket receive, text send, image send where supported, goods-card send, product list/detail fetch, customer-service list fetch, conversation transfer, reconnect, and session-expiry recovery.
- Add calibrated real PDD API support for product list/detail, goods-card send, assigned customer-service list, conversation transfer, request retries, session-expiry detection, cookie refresh, and `anti-content`/header handling.
- Add production-grade WebSocket governance: heartbeat, classified reconnect, exponential backoff, cookie/session health checks, forced relogin prompts, and audited connection events.
- Add persistent message queue and handler-chain behavior equivalent to the reference project, upgraded with per-buyer ordering, multi-conversation concurrency, deduplication, retry/backoff, rate limits, queue visibility, timing metrics, circuit breakers, and human-handoff priority.
- Add an auditable multi-turn AI Agent that can choose and execute real tools: `get_shop_products`, `send_goods_link`, `get_product_knowledge`, `search_customer_service_knowledge`, and `transfer_conversation`.
- Add product and customer-service knowledge governance: separated stores, source tracking, versions, enabled/disabled state, review status, conflict and staleness checks, batch import, sync diffs, rollback, and reply citation tracing.
- Add automatic product-knowledge sync from real Pinduoduo product APIs plus real multimodal LLM extraction, with progress, cancel, retries, audit records, merchant review, disable, and rollback.
- Preserve and productize the Electron app's local-model advantage: the app must run with a managed local OpenAI-compatible runtime and model provisioning path that does not require users to manually install third-party LLM tools.
- Add complete human handoff workflow: keyword and intent triggers, business-hours strategy, real PDD transfer when available, AI stop/resume, reason tracking, handling state, and audit trail.
- Add production-grade multi-account and multi-shop isolation for accounts, connections, queues, products, knowledge, agent audit, acceptance records, and UI filtering.
- Add production-grade configuration and secret governance for PDD sessions, LLM credentials, logs, exports, acceptance records, and CI release gates.
- Add a production desktop operations UI covering conversation queues, human handoff, Agent audit, product sync, knowledge governance, connection health, queue health, acceptance status, release status, logs, and settings.
- Add GitHub Actions release automation for macOS and Windows artifacts. CI must verify code/build/package gates and enforce that a sanitized real-acceptance record covers the release commit/tag before publishing.
- Use GitHub Releases as the formal distribution channel for this change; code signing and macOS notarization are explicitly deferred from the first parity release.

## Capabilities

### New Capabilities

- `reference-feature-scope`: Scope control for README-first, code-audited business parity and explicit out-of-scope reference implementation details.
- `pdd-real-merchant-operations`: Real Pinduoduo login, session, HTTP API, WebSocket, send, transfer, product, reconnect, and session-recovery behavior.
- `auditable-agent-workflow`: Multi-turn tool-calling Agent behavior with conversation memory, real tools, retries, decisions, citations, and audit trail.
- `local-model-runtime-provisioning`: Local OpenAI-compatible runtime preservation, bundled or automatically downloaded runtime binaries, managed model downloads, health checks, and platform release gates.
- `knowledge-product-governance`: Product knowledge, customer-service knowledge, product sync, multimodal extraction, versioning, review, rollback, and citation governance.
- `message-queue-concurrency`: Persistent queue, handler chain, concurrency, ordering, deduplication, retries, rate limiting, circuit breaking, and queue observability.
- `multi-shop-operations`: Multi-account and multi-shop isolation across sessions, queues, products, knowledge, Agent state, audits, and UI context.
- `desktop-operations-workspace`: Production-grade Electron UI for the merchant assistant operations workflow.
- `real-acceptance-release-gates`: Real acceptance records, no-mock completion gates, CI release checks, macOS/Windows packaging, and GitHub release automation.
- `secret-safety-governance`: Local secret encryption, rotation, health checks, sanitization, leak prevention, and CI-safe acceptance summaries.

### Modified Capabilities

- `electron-e2e-eval-harness`: Remove Mock Pinduoduo and Seam A/B/C requirements as completion gates; replace fixture-driven verdicts with real-acceptance evidence.

## Impact

- Affects `AGENTS.md`, `package.json`, `scripts/verify-flow.mjs`, `report/flow`, `packages/pdd`, `packages/core`, `packages/db`, `packages/agents`, `packages/knowledge`, `packages/inference`, `apps/desktop`, GitHub Actions workflows, release scripts, and OpenSpec specifications.
- Requires real Pinduoduo merchant credentials and a coordinated buyer/test-message path for acceptance runs, stored only as sanitized local or committed evidence records without passwords, cookies, tokens, raw buyer payloads, or private contact data.
- Requires real OpenAI-compatible chat, embedding, and local multimodal model endpoints for Agent and product-knowledge extraction acceptance. The default path is first-launch or first-use automatic download of a small approved local model profile. Product-image multimodal extraction must use a small Gemma-family local multimodal baseline candidate, or multiple approved local model profiles working together; remote multimodal fallback is out of scope. The exact model ID, license, file size, and checksum are finalized during model-profile implementation.
- Requires platform-specific local runtime and model distribution decisions for macOS and Windows, including checksums, licensing, disk-space checks, resumable downloads, and release metadata.
- Requires GitHub Releases configuration for production macOS/Windows release automation. Code signing, notarization, and signed auto-update credentials are not required for the first parity release.
