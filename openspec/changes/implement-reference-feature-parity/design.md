## Context

This repository is an Electron + TypeScript rebuild of the referenced `JC0v0/Customer-Agent` desktop assistant. The reference repository at commit `59467291c64dd69335d3e52612e38556a1833865` is a PyQt/Python app, but the requested target is business-function parity, not technology-stack parity.

The current Electron app already has pieces of login, PDD WebSocket startup, text sending, SQLite persistence, LanceDB knowledge search, OpenAI-compatible inference, model runtime management, review UI work, and release scaffolding. Its strongest automated proof is the Mock Pinduoduo Seam A/B/C harness. The new product direction rejects business-critical mocks because they can prove a fiction: completion must come from real Pinduoduo, real LLM endpoints, real local storage/vector indexes, and real desktop packages.

Reference audit found core behaviors beyond the README: PDD product list/detail APIs, `anti-content` request handling, goods-card send, assigned customer-service list, conversation transfer, session-expiry code `43001`, cookie refresh/relogin guard, request retry with backoff and jitter, WebSocket heartbeat, cookie health loop, connection status manager, queue/consumer/handler chain, keyword-first handoff, product/customer-service knowledge tables, product sync with multimodal extraction, and UI surfaces for accounts, auto-reply, keywords, knowledge, logs, and settings.

## Goals / Non-Goals

**Goals:**

- Preserve the Electron + TypeScript architecture while reaching business parity with the reference app.
- Treat the README as primary scope and the audited core code path as parity补漏.
- Remove Mock Pinduoduo and Seam A/B/C from the product completion contract.
- Require real merchant acceptance for every PDD-dependent capability.
- Build production-grade Agent, knowledge, queue, multi-shop, UI, secret, and release systems rather than a literal PyQt port.
- Support GitHub Actions release automation for macOS and Windows artifacts, gated by sanitized real-acceptance evidence for the release commit/tag.

**Non-Goals:**

- Rewriting the app in Python, PyQt, SQLAlchemy, or PyInstaller.
- Implementing reference enum placeholders for JD/Taobao/Douyin/Kuaishou as live channels.
- Keeping mock PDD, fixture PDD, or fake business dependency tests as acceptance evidence.
- Storing PDD passwords, plaintext cookies, raw tokens, raw buyer messages, or private buyer contact data in repository artifacts or CI.

## Decisions

### 1. One OpenSpec change with staged milestones

Use one change, `implement-reference-feature-parity`, because the user wants one final parity change. Internally split work into staged milestones: audit freeze, mock removal, real PDD calibration, connection governance, queue/concurrency, knowledge/product sync, Agent, multi-shop isolation, UI, acceptance records, release automation, and final real acceptance.

Alternative considered: many independent changes. Rejected because parity spans cross-cutting contracts and release evidence; splitting too early would obscure the final completion standard.

### 2. Real acceptance is the source of truth

Business-critical completion SHALL be proved by sanitized real acceptance records bound to commit SHA and, for release, tag/version. Unit tests can still cover pure functions and local state machines, but tests that fake PDD, LLM, Agent tools, knowledge search, product sync, or transfer are not completion evidence.

Alternative considered: keep mocks as a diagnostic tier. Rejected because the user explicitly does not want any mock PDD/seam harness retained.

### 3. Replace mock flow with calibrated live probes and acceptance records

PDD integration work starts with live endpoint calibration scripts that record only sanitized schema summaries, status, request purpose, and parsed field maps. These probes must not persist cookies, tokens, raw payloads, buyer identifiers, or private text. The implementation then uses those calibrated contracts and final manual/assisted acceptance runs.

Alternative considered: port reference API shapes directly. Rejected because PDD private endpoints drift and the reference README itself warns against guessed fields.

### 4. Agent tools are real product operations with audit

The Agent should expose the same business tools as the reference app, but implement them as TypeScript services with typed inputs, shop-scoped dependencies, retries, rate limits, and audit events. Tool calls must be visible in logs/UI with inputs sanitized, result status, citations, and handoff/recommendation rationale.

Alternative considered: current single RAG prompt. Rejected because it cannot send goods cards, transfer conversations, use product/customer-service stores separately, or explain multi-step decisions.

### 5. Preserve local LLM as a product advantage through a Responses API runtime contract

The current Electron app has experimented with a local `llama-server` runtime, app-managed model files, and inference settings. This capability must be preserved as a product advantage, but `llama-server` is not the architecture boundary. The architecture boundary is a Responses API-compatible model contract exposed by every **ModelProvider**.

A **ModelProvider** is the supplier of models behind that unified contract (chat, embedding, and multimodal/vision). It is one of exactly two kinds, and both expose the same interface so the Agent never branches on which one is active: a `remote` provider is any OpenAI-compatible cloud endpoint (for example DashScope/Qwen), configured by base URL, API key, and model names; a `local` provider is an app-managed `llama-server` that the app provisions and runs itself. The only difference between the two is provisioning — a local provider additionally has a managed runtime (download, launch, health) — not the request/response surface.

The target state is not "the user installs a separate LLM tool" and not "the Agent parses model-authored JSON from plain text." The target state is that the app can provision a reviewed platform runtime and model itself, verify integrity, start a local endpoint, and expose health/recovery states while the Agent talks to every ModelProvider through the same Responses-style interface: input messages, tool definitions, function/tool calls, function/tool outputs, multimodal inputs where supported, and final responses.

If the selected local runtime cannot natively satisfy the required Responses API behavior, including tool-call round trips needed by the Agent, the implementation SHALL replace that runtime candidate instead of adding fragile prompt-only, text-JSON, or model-specific compatibility layers inside the Agent.

Alternative considered: require users to install Ollama, LM Studio, llama.cpp, or another model tool before using the app. Rejected because it keeps the largest product differentiator dependent on manual setup and creates support variance across macOS and Windows.

Alternative considered: bundle every runtime and default model inside the installer. Partially accepted only where licensing, size, and distribution limits make sense. The default design is first-launch or first-use automatic download from a checksummed manifest, because quantized local models can make installers very large.

Alternative considered: keep `llama-server` as mandatory and hide missing Responses behavior behind an adapter that asks the model to emit JSON tool calls in natural-language completions. Rejected because real testing showed this makes Agent decisions brittle, allows product-recommendation turns to skip product tools, and diverges from the reference Agent's standard tool-call loop.

### 6. Knowledge is versioned and governed

Product knowledge and customer-service knowledge remain separate logical stores. Product knowledge comes from real PDD product APIs plus multimodal LLM extraction; customer-service knowledge comes from merchant authoring and imports. Both need source, version, review state, enabled state, rollback, conflict/staleness detection, and citation IDs used by Agent replies.

Local model profiles must declare supported capabilities. Chat can be satisfied by the managed local profile where the selected model supports it. Multimodal product extraction must use one approved local model profile that declares image capability. The release baseline is Qwen2.5-VL 3B as the default local multimodal profile with Qwen2.5-VL 7B as the higher-quality option, including exact model IDs, licenses, checksums, and platform viability in the model-profile manifest. If the selected local model lacks vision support, the UI must block extraction until the operator selects or provisions an approved local multimodal profile. Remote multimodal fallback is not provided.

Alternative considered: continue with flat document chunks. Rejected because product recommendation and policy answers need reviewable source lineage.

### 7. Queue and connection systems are first-class operational surfaces

Incoming buyer messages should pass through a persistent queue and ordered per-conversation handler chain. PDD/LLM/vector operations need independent rate limits, retry policies, backoff, and circuit breakers. WebSocket and cookie/session health must be visible, classifiable, and recoverable when possible.

Alternative considered: direct on-message reply generation. Rejected because high-concurrency real merchant usage requires ordering, retry, backpressure, and human-handoff priority.

### 8. Release CI gates read acceptance evidence, not PDD credentials

GitHub Actions builds and packages macOS/Windows artifacts, but it does not log in to PDD. Release workflows read sanitized acceptance records committed or attached in a defined location and fail when the record does not cover the release commit/tag and required capabilities.

Alternative considered: automated PDD acceptance in CI via secrets. Rejected because real PDD login has risk from CAPTCHA, account security, buyer coordination, and secret exposure.

### 9. GitHub Releases are the first distribution channel

The first parity release SHALL publish macOS and Windows artifacts through GitHub Releases after release gates pass. Code signing, macOS notarization, and signed auto-update credentials are deferred from this change so the first release can validate the product pipeline before certificate management is introduced.

Alternative considered: require signing/notarization before the first release. Rejected for this change because the user explicitly wants GitHub Releases as the official channel now and signing later.

### 10. Unknown PDD endpoint capability is resolved by reference audit and live calibration

For PDD capabilities whose account permission or endpoint behavior is unknown, implementation SHALL first compare the reference project and then run sanitized live calibration against the user's real accounts. If the real account or endpoint cannot support a capability, the capability remains blocked or conditionally documented; it is not completed through mocks or invented payloads.

## Risks / Trade-offs

- [Risk] PDD private endpoints drift or require browser-only anti-bot state -> Mitigation: add live calibration tasks, schema summaries, and release-blocking acceptance records.
- [Risk] Removing mocks slows inner-loop debugging -> Mitigation: keep pure unit tests and local deterministic state-machine tests, but forbid business-critical doubles and mock verdicts.
- [Risk] Local runtime/model packaging increases first-run time -> Mitigation: support checksummed manifests, resumable background downloads, disk-space checks, and optional bundled runtime resources by release channel.
- [Risk] Local model licensing or platform acceleration differs across macOS and Windows -> Mitigation: require license metadata, platform-specific runtime manifests, CPU-safe defaults, and explicit GPU/Metal/CUDA capability declarations.
- [Risk] Real acceptance depends on a buyer/test-message path -> Mitigation: mark affected tasks blocked until a real path exists; do not downgrade to mock completion.
- [Risk] Multimodal product extraction can hallucinate -> Mitigation: require review state, citations to product source/version, confidence/status, disable, and rollback before Agent use.
- [Risk] Multi-shop mistakes can cause wrong replies -> Mitigation: enforce shop-scoped data access, UI context, queue keys, and acceptance records.
- [Risk] CI release gate may be bypassed by stale evidence -> Mitigation: require commit SHA/tag/version matching and capability-level pass records.

## Migration Plan

1. Freeze reference audit and parity scope in OpenSpec artifacts.
2. Remove Mock Pinduoduo and Seam A/B/C scripts, tests, docs, package scripts, and existing archived spec requirements from active completion contracts.
3. Add real PDD calibration scripts and sanitized evidence schema.
4. Implement and verify PDD HTTP/WebSocket live operations before Agent, queue, and UI rely on them.
5. Define and validate the Responses API-compatible model runtime contract before further Agent parity work.
6. Evaluate local runtime candidates against the contract; replace `llama-server` if it cannot satisfy the required native tool-call, tool-result, and multimodal behavior.
7. Rebuild the Agent loop to match the reference architecture on top of the Responses contract, with real tools and product-list context rather than prompt-only JSON parsing.
8. Implement persistent queue/concurrency and Agent tools behind typed service interfaces.
9. Add product/customer-service knowledge governance and product sync.
10. Build the operations UI and acceptance/release status surfaces.
11. Add GitHub Actions release gates and artifact publishing.
12. Complete real PDD merchant acceptance for all must capabilities before marking the change complete.

Rollback strategy: each stage should keep the app launchable. If a live PDD feature regresses, disable only the affected capability for the shop/account and surface a release-blocking diagnostic; do not restore mock acceptance as a fallback.

## Remaining Inputs

- Acceptance will use two real Pinduoduo accounts supplied by the user. The implementation SHALL generate low-sensitive aliases, shop aliases, acceptance skeletons, capability matrices, and test-run labels itself, using defaults such as `pdd-account-a`, `pdd-account-b`, `shop-a`, and `shop-b` unless the operator overrides them locally.
- Real credentials, real login completion, and authorization to send messages or goods cards cannot be generated. They are provided only through the local app or calibration flow and are never requested in chat, committed to Git, or sent to CI.
- The local model baseline is Qwen2.5-VL 3B with first-use automatic download. The v1.0.3 release readiness record ties packaged smoke evidence, local runtime contract evidence, and sanitized acceptance records to the selected managed `llama-server` runtime without fragile prompt-only tool emulation.
- GitHub Releases are the production distribution channel for this change. Code signing, notarization, and signed auto-update credentials are deferred.
