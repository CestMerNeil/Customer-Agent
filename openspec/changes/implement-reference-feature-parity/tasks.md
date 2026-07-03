## 1. Scope Freeze and Reference Audit

- [x] 1.1 Record the reference repository commit, README feature list, audited core modules, and must/should/out-of-scope classification in the change notes.
- [x] 1.2 Map every reference must capability to the corresponding Electron package, service, IPC channel, UI surface, and acceptance evidence type.
- [x] 1.3 Identify existing Electron functionality that can be reused without mock-dependent assumptions.
- [x] 1.4 Update developer-facing docs to state that business parity means Electron + TypeScript business equivalence, not PyQt/Python structure equivalence.

## 2. Remove Mock and Seam Verification

- [x] 2.1 Remove Mock Pinduoduo source, process mode, recorded fixtures, and fixture-driven PDD test paths.
- [x] 2.2 Remove `verify:flow`, `verify:flow:fast`, Seam A/B/C scripts, reports, package scripts, and CI references.
- [x] 2.3 Remove or rewrite tests that mock PDD, PDD WebSocket, buyer messages, PDD product APIs, Agent tools, LLM, knowledge search, product sync, or transfer as business completion evidence.
- [x] 2.4 Keep or add pure unit tests only for non-business helpers such as parsers, redactors, state transitions, and deterministic validation logic.
- [x] 2.5 Update `AGENTS.md` and OpenSpec docs so the single verdict is real acceptance records plus release gates, not `report/flow/summary.json`.

## 3. Real Pinduoduo Calibration

- [x] 3.1 Add sanitized live-calibration procedures for login, user info, shop info, chat token, online status, text send, image send where supported, goods-card send, customer-service list, conversation transfer, product list, product detail, and WebSocket receive.
- [x] 3.2 Implement calibration scripts or guided UI flows that record endpoint purpose, status, parsed field maps, and sanitized errors without storing credentials, tokens, cookies, raw buyer payloads, or private buyer data.
- [x] 3.3 Calibrate `anti-content` and browser-like header handling for product and goods-card endpoints.
- [x] 3.4 Calibrate session-expiry, cookie refresh, relogin-required, rate-limit, and retryable failure signatures.
- [x] 3.5 Compare uncertain PDD endpoint behavior against the reference implementation before live calibration, then record whether each capability is supported, blocked by account permission, or blocked by endpoint drift.
- [x] 3.6 Store a real calibration summary tied to commit SHA and shop/account aliases.

## 4. PDD Real Operations

- [x] 4.1 Implement real PDD account login and encrypted session persistence for multi-account use.
- [x] 4.2 Implement real account start/stop, chat token retrieval, online/busy/offline customer-service status, and sanitized diagnostics.
- [x] 4.3 Implement real WebSocket receive and normalization for text, image, video, emotion, goods card, goods inquiry, goods spec, order info, withdraw, auth, transfer, mall/system messages, and unsupported types.
- [x] 4.4 Implement real text send and image send where supported with retry, result persistence, and sanitized failure states.
- [x] 4.5 Implement real goods-card send using real goods IDs and guard against using list indexes as goods IDs.
- [x] 4.6 Implement real assigned customer-service list retrieval and conversation transfer.
- [x] 4.7 Implement real product list and product detail API services with parsed field maps and source metadata.
- [x] 4.8 Complete real PDD acceptance for login, session extraction, start, online/busy/offline status changes, receive, text send, goods-card send, transfer, product list/detail, and stop.

## 5. Connection Governance

- [x] 5.1 Implement heartbeat and connection-health tracking for each account connection.
- [x] 5.2 Implement bounded exponential reconnect with jitter, max attempts, manual stop semantics, and per-account state.
- [x] 5.3 Implement cookie/session health checks and safe refresh/relogin flow with concurrency guard and cooldown.
- [x] 5.4 Classify network, PDD token, cookie, session expiry, account offline, risk-control, and manual relogin failures.
- [x] 5.5 Surface connection state, reconnect count, heartbeat state, last error, and required operator action in the UI.
- [x] 5.6 Verify connection recovery and relogin-required paths against real PDD.

## 6. Queue, Handler Chain, and Concurrency

- [x] 6.1 Implement a persistent queue for inbound real PDD messages before Agent or handoff processing.
- [x] 6.2 Enforce per-buyer conversation ordering while allowing configurable multi-conversation concurrency.
- [x] 6.3 Implement deduplication by real PDD message identity and safe fallback identity when needed.
- [x] 6.4 Implement handler chain ordering: immediate system handlers, keyword/intent handoff, AI Agent, and fallback/diagnostic handling.
- [x] 6.5 Add retry, backoff, dead-letter state, queue pause/resume, and operator-visible failure reason.
- [x] 6.6 Add PDD, LLM, embedding/vector, and product-sync rate limits and circuit breakers.
- [x] 6.7 Add queue depth, processing latency, retry count, failure count, and dependency-health metrics.
- [x] 6.8 Verify queue and concurrency behavior with real PDD messages and real downstream dependencies.

## 7. Knowledge and Product Sync Governance

- [x] 7.1 Split product knowledge and customer-service knowledge into governed shop-scoped stores.
- [x] 7.2 Add source tracking, versioning, enabled/disabled state, review state, rollback, conflict detection, staleness detection, and citation IDs.
- [x] 7.3 Implement customer-service knowledge add/edit/delete, tag filtering, batch import, duplicate detection, review, and disable/enable.
- [x] 7.4 Implement real PDD product incremental and full sync with pagination, source metadata, failure recording, cancellation, and retry.
- [x] 7.5 Implement real multimodal LLM product extraction for structured fields, selling points, usage, and FAQ.
- [x] 7.6 Add merchant review, diff view, approve, disable, and rollback for product extraction results.
- [x] 7.7 Ensure Agent knowledge search returns only eligible shop-scoped reviewed versions unless explicitly overridden by an operator.
- [x] 7.8 Complete real product sync and multimodal extraction acceptance for at least one real shop.

## 8. Auditable Agent Workflow

- [x] 8.1 Replace the single-prompt/text-JSON reply path with a multi-turn tool-call loop using the shared Responses API-compatible model contract.
- [x] 8.2 Implement typed real tools for `get_shop_products`, `send_goods_link`, `get_product_knowledge`, `search_customer_service_knowledge`, and `transfer_conversation`.
- [x] 8.3 Persist conversation memory per shop/account/buyer and implement LLM-backed summary compression.
- [x] 8.4 Add tool retry, tool failure handling, loop limit handling, and final-response fallback without hiding failures.
- [x] 8.5 Persist sanitized Agent audit events for prompts, tool calls, tool results, citations, recommendations, transfer decisions, retries, and failures.
- [x] 8.6 Expose Agent audit records through IPC and UI.
- [x] 8.7 Complete real Agent acceptance for product question, policy question, product recommendation with goods card, transfer, and insufficient-knowledge paths.
- [x] 8.8 Align Agent message construction with the reference Agent: inject current shop product-list context or perform an equivalent `get_shop_products` step before recommendation final replies.
- [x] 8.9 Remove the model-authored plain-text JSON tool protocol as the primary Agent tool mechanism after the Responses-compatible loop is available.

## 8A. Local Model Runtime Provisioning

- [x] 8A.1 Define approved local model profiles for chat and multimodal extraction, using Qwen2.5-VL 3B as the default local multimodal profile and Qwen2.5-VL 7B as the higher-quality option, recording exact model IDs, file sizes, checksums, licenses, and platform support.
- [x] 8A.2 Replace manual runtime-command setup with managed runtime provisioning from bundled resources or checksummed platform manifests.
- [x] 8A.3 Replace manual model URL/path setup for the default profile with first-launch or first-use app-managed download, resume, checksum verification, cache reuse, and disk-space checks.
- [x] 8A.4 Add runtime lifecycle governance for local process start/stop, health checks, port conflicts, model-load errors, and sanitized diagnostics.
- [x] 8A.5 Add UI states for local provisioning progress, model/runtime health, recoverable failures, and explicit local model-profile selection.
- [x] 8A.6 Ensure Agent, memory summarization, and embeddings can use the managed local Responses API-compatible endpoint when the selected local profile supports the required capability.
- [x] 8A.7 Gate multimodal product extraction on an explicitly selected local model profile, or approved chain of local model profiles, that declares image support.
- [x] 8A.8 Add macOS and Windows packaged smoke checks for local runtime provisioning and startup.
- [x] 8A.9 Produce sanitized local-model acceptance records with runtime version, model manifest, platform, commit SHA, and health-check results.
- [x] 8A.10 Define the minimum Responses API-compatible runtime contract for local and remote providers, including tool definitions, tool calls, tool-result continuation, final response extraction, and multimodal input support.
- [x] 8A.11 Spike local runtime candidates against the contract; reject or replace `llama-server` if it cannot satisfy required native Agent tool-call behavior without prompt-only JSON emulation.
- [x] 8A.12 Record the chosen local runtime decision, rejected alternatives, supported capabilities, unsupported capabilities, packaging impact, and acceptance evidence in the runtime/model manifest.

## 9. Human Handoff

- [x] 9.1 Implement keyword rule configuration with add/edit/delete/import and per-shop scope.
- [x] 9.2 Implement intent-based handoff through the Agent with explainable reason.
- [x] 9.3 Implement business-hours strategy for AI reply, handoff, and unavailable-human paths.
- [x] 9.4 Implement real PDD transfer when the customer-service list and move-conversation endpoint are available.
- [x] 9.5 Implement fallback human takeover state that stops AI auto-reply when real transfer is unavailable or fails.
- [x] 9.6 Implement human handling status, notes, resume-AI action, and audit events.
- [x] 9.7 Complete real handoff acceptance for keyword, Agent intent, after-hours, transfer success, transfer failure, and resume-AI.

## 10. Multi-Shop Operations

- [x] 10.1 Enforce shop/account scoping across PDD sessions, queues, products, knowledge, Agent memory, audits, acceptance records, logs, and UI filters.
- [x] 10.2 Add cross-shop guards for knowledge citations, product recommendations, goods-card sends, and conversation actions.
- [x] 10.3 Support independent start/stop/reconnect/error states for multiple accounts.
- [x] 10.4 Add UI shop/account selectors that make the active operation context explicit.
- [x] 10.5 Verify that one shop/account failure does not corrupt or stop unrelated shop/account flows.

## 11. Production Operations UI

- [x] 11.1 Build conversation queue and message workflow views with state, retry, handoff, and Agent action visibility.
- [x] 11.2 Build human handoff workspace with reason, owner/state, notes, transfer result, stop-AI, and resume-AI actions.
- [x] 11.3 Build Agent audit view with tool path, sanitized inputs, results, citations, and recommendation/transfer rationale.
- [x] 11.4 Build product sync and extraction review UI with progress, cancel, retry, diff, approve, disable, and rollback.
- [x] 11.5 Build governed knowledge UI for product and customer-service knowledge with tags, review, import, conflict, stale, and rollback states.
- [x] 11.6 Build connection health, queue health, acceptance status, release status, log filtering, and settings surfaces.
- [x] 11.7 Ensure all production surfaces support loading, empty, error, retry, success, confirmation, redaction, keyboard navigation, and focus states.
- [x] 11.8 Run interactive desktop acceptance for all UI surfaces on macOS and Windows package builds.

## 12. Secret Safety and Data Protection

- [x] 12.1 Encrypt PDD sessions, cookies, tokens, LLM API keys, and runtime credentials at rest.
- [x] 12.2 Add secret rotation and health-check flows for PDD and LLM credentials.
- [x] 12.3 Add redaction for logs, diagnostics, exports, acceptance records, release metadata, and UI displays.
- [x] 12.4 Add leak scans for committed acceptance records, logs, exported artifacts, and release metadata.
- [x] 12.5 Fail release gates when disallowed secret-shaped or private buyer-data patterns are detected.
- [x] 12.6 Verify CI does not require or accept PDD passwords, cookies, tokens, or buyer private data.

## 13. Real Acceptance Evidence

- [x] 13.1 Define the sanitized acceptance record schema for commit SHA, tag/version, platform, account alias, shop scope, capability, outcome, actor, timestamp, blockers, and notes.
- [x] 13.2 Add a validator that fails when required fields are missing or sensitive fields are present.
- [x] 13.3 Add release-blocking capability matrix for PDD, Agent, knowledge/product sync, handoff, queue/concurrency, multi-shop, UI, secrets, and packaging.
- [x] 13.4 Generate default sanitized account aliases, shop aliases, test-run labels, acceptance skeletons, and capability-matrix rows without requiring the operator to provide low-sensitive naming data.
- [x] 13.5 Record real acceptance for each release-blocking capability against the current implementation commit.
- [x] 13.6 Keep blocked capabilities incomplete when real login, real send authorization, a real buyer/test-message path, or required local model dependency is unavailable.

## 14. Release Automation

- [x] 14.1 Update GitHub Actions to run lint, typecheck, tests, build, package smoke, acceptance-record validation, leak scan, and release preflight.
- [x] 14.2 Build macOS artifacts and Windows artifacts through GitHub Actions.
- [x] 14.3 Configure GitHub Releases as the production distribution channel, including macOS/Windows package outputs, artifact checksums, and release metadata; defer code signing and macOS notarization.
- [x] 14.4 Fail release when acceptance evidence does not cover the release commit/tag and required capability matrix.
- [x] 14.5 Validate local runtime/model manifests, checksums, license metadata, platform compatibility, and packaged provisioning smoke results.
- [x] 14.6 Publish release artifacts to GitHub Releases only after all release gates pass.
- [ ] 14.7 Verify a tagged release dry run and a real release run.

## 15. Final Parity Closeout

- [x] 15.1 Run OpenSpec validation for this change.
- [x] 15.2 Run the full non-mock repository verification suite.
- [x] 15.3 Confirm no active docs, scripts, CI jobs, or specs still name Mock Pinduoduo or Seam A/B/C as acceptance.
- [x] 15.4 Compare final implementation against the reference README and audited must-scope code paths.
- [x] 15.5 Complete final real PDD merchant acceptance on packaged macOS and Windows artifacts.
- [x] 15.6 Update release/readiness docs with the real acceptance summary and residual should/out-of-scope items.
