# Electron TypeScript Rewrite Design

## Purpose

Rewrite the current PyQt/Python customer service assistant into a desktop product built with a unified TypeScript application stack. The new product keeps the core business goal: help Pinduoduo merchants run AI-assisted customer service with local knowledge, model management, and reliable account automation.

The old Python application remains in the repository as migration reference. New runtime code for the rewritten product is TypeScript.

## Confirmed Decisions

- Desktop framework: Electron + Vite + React + TypeScript.
- UI direction: Material Design 3 style system.
- Runtime split: Electron renderer, Electron main process, and a dedicated TypeScript worker.
- Pinduoduo automation: Playwright for Node, with manual login as the default and automatic username/password filling as assistance.
- AI orchestration: LangChain.js replaces Dify.
- Inference: managed local vLLM through an OpenAI-compatible API, with external OpenAI-compatible endpoints still configurable.
- Model source: ModelScope first. Hugging Face is not the default path.
- Model setup: no automatic model download on first launch. The user chooses a local model directory, a ModelScope model ID, or an external endpoint.
- App data: SQLite with Drizzle ORM.
- Vector storage: LanceDB.
- Knowledge base: core product capability with global and shop-specific scopes.
- Reply modes: automatic send and human review, configurable by shop or account.
- Context: text, goods, order, shop, buyer, and knowledge-retrieval context all feed the LangChain reply workflow.
- Playground: out of scope. The earlier mention was clarified to mean Playwright integration.

## Repository Strategy

Use the same repository and add the new TypeScript application in new directories. Preserve the current Python code as reference during migration.

Proposed structure:

```text
/
├─ apps/
│  └─ desktop/
├─ packages/
│  ├─ core/
│  ├─ pdd/
│  ├─ agents/
│  ├─ knowledge/
│  ├─ inference/
│  ├─ db/
│  └─ ui/
└─ legacy Python files and folders retained during migration
```

The exact location of legacy files can be finalized during implementation. The key rule is that new TypeScript runtime code does not depend on Python modules.

## Runtime Architecture

```text
Renderer: React + M3 UI
        │
        ▼
Typed IPC bridge
        │
        ├───────────────┐
        ▼               ▼
Electron main      TypeScript worker
desktop lifecycle  business automation
```

### Renderer

The renderer owns user-facing UI:

- Dashboard and account status.
- Account management.
- Auto-reply console.
- Human review queue.
- Knowledge base management.
- Model and inference settings.
- Logs and diagnostics.
- General settings.

The renderer communicates through typed IPC contracts only. It does not directly control Playwright, Pinduoduo sockets, LangChain, vLLM, SQLite, or LanceDB.

### Electron Main

The main process owns desktop lifecycle:

- Window creation.
- Tray and menu behavior.
- App startup and shutdown.
- Optional auto-start.
- App update hooks.
- Worker process lifecycle.

The main process should stay thin. Long-running or failure-prone work belongs in the worker so the UI can remain responsive and the worker can be restarted independently.

### TypeScript Worker

The worker owns business automation:

- Playwright browser sessions for Pinduoduo login.
- Cookie and token extraction.
- Pinduoduo WebSocket connection management.
- Message queue and message state transitions.
- LangChain.js workflow execution.
- Knowledge base retrieval through LanceDB.
- vLLM process management and health checks.
- SQLite/Drizzle data access.

## Pinduoduo Login and Session Model

The first version supports both manual login and automation assistance:

```text
Add account
→ Open controlled Playwright login window
→ Optionally auto-fill username and password
→ User handles captcha, QR, or risk checks manually
→ Worker captures cookie/token after successful login
→ Store account/session data locally
→ Start PDD WebSocket for auto-reply
```

This avoids relying on brittle full automation while still reducing repeated manual entry.

## Message and Reply Flow

```text
PDD incoming message
→ Normalize to typed customer-service context
→ Attach shop, buyer, goods, and order context
→ Retrieve global and shop knowledge
→ Run LangChain.js reply workflow
→ Produce reply draft
→ Send directly or enter human review queue
→ Persist logs and state
```

Reply modes:

- Automatic mode: generated replies are sent directly.
- Human review mode: generated replies become drafts that a user can edit, send, ignore, or escalate.

State model:

```text
received
→ generating
→ draft_ready
→ sent
→ failed
→ ignored
→ escalated
```

Automatic mode can move from `generating` to `sent` without waiting at `draft_ready`.

## LangChain.js Agent Design

LangChain.js replaces Dify and becomes the single orchestration layer for model calls, prompt assembly, and retrieval-augmented generation.

Inputs include:

- Customer message content.
- Pinduoduo message type.
- Shop and account identifiers.
- Buyer identifiers.
- Goods card, goods spec, and goods inquiry context.
- Order context when present.
- Global knowledge chunks.
- Shop-specific knowledge chunks.
- Reply mode and fallback policy.

Outputs include:

- Reply text.
- Confidence or answerability signal when practical.
- Source chunk references.
- Suggested action: send, review, escalate, or fallback.

## Inference and vLLM Management

The application should make local model usage feel integrated while keeping the TypeScript app independent from vLLM internals.

```text
InferenceManager
├─ stores inference configuration
├─ resolves ModelScope model IDs
├─ maps model IDs to local model cache paths
├─ starts and stops managed vLLM
├─ performs health checks
├─ lists available models where possible
└─ exposes an OpenAI-compatible endpoint to agents
```

First launch model setup:

```text
Detect inference config
→ If missing, show model setup wizard
→ User chooses:
   1. local model directory
   2. ModelScope model ID
   3. external OpenAI-compatible endpoint
→ Save configuration
→ Start or connect to inference endpoint
```

The first version does not automatically download a model. ModelScope is the default remote model source when the user chooses a remote model ID.

## Knowledge Base

Knowledge base is a core capability, not a secondary utility.

Scopes:

- Global knowledge: common policy, logistics, platform rules, common after-sales language.
- Shop knowledge: product details, shop-specific promotions, special rules, and store-specific responses.

Retrieval flow:

```text
Incoming customer context for shop A
→ Search global knowledge
→ Search shop:A knowledge
→ Merge, rank, deduplicate, and truncate results
→ Pass selected chunks into LangChain.js
```

Storage:

- SQLite + Drizzle stores document metadata, shop scope, import status, index status, configuration, and task state.
- LanceDB stores chunks, embeddings, source metadata, shop scope, and retrieval metadata.

Knowledge import should support at least text, Markdown, CSV, and JSON files.

## Data Layer

SQLite + Drizzle stores structured application data:

- Channels.
- Shops.
- Accounts.
- Cookies and tokens.
- Reply configuration.
- Business hours and fallback policies.
- Model configuration.
- Knowledge document metadata.
- Message and reply state.
- Logs and diagnostics indexes.

LanceDB stores vector-search data for the knowledge base.

Sensitive local data such as account credentials and cookies should be designed for encrypted storage during implementation planning.

## UI Scope

The renderer should include these first-version surfaces:

- Auto-reply dashboard.
- Account manager.
- Manual review queue.
- Knowledge base manager.
- Model setup and inference settings.
- Logs and diagnostics.
- General settings.

Material Design 3 is the visual and interaction target. The design should favor a dense operational tool, not a marketing-style page.

## Error Handling and Observability

The application should surface operational failures clearly:

- Pinduoduo login failed.
- Captcha or manual action required.
- Cookie expired.
- WebSocket disconnected.
- Model service unavailable.
- Model not configured.
- Knowledge index failed.
- LangChain generation failed.
- Reply send failed.

Worker failures should not crash the renderer. The main process should be able to restart the worker and report state back to the renderer.

## Testing Strategy

The implementation plan should include:

- Unit tests for shared types, message normalization, config validation, and state transitions.
- Integration tests for LangChain workflow with mocked inference and retrieval.
- Integration tests for LanceDB indexing and retrieval.
- Playwright tests for renderer UI flows.
- PDD adapter tests with recorded or mocked API/WebSocket payloads.
- Packaging smoke tests for the Electron app.

## Out of Scope for the First Version

- SaaS deployment.
- Multi-user permissions.
- Cloud sync.
- Team collaboration.
- Playground/debug workbench as a product page.
- Full automatic bypass of Pinduoduo captcha or risk checks.
- Mandatory bundled model download on first launch.
- Python runtime dependency in the new TypeScript application.

## Open Implementation Questions

- Exact Electron packaging tool: Electron Forge, electron-builder, or another option.
- Exact process model for the worker: Node worker thread, child process, or managed service process.
- Exact encryption approach for local secrets.
- Exact ModelScope download/cache implementation.
- Exact vLLM launch strategy per platform.
- Whether to keep legacy Python files in place or move them under a legacy directory during a later migration phase.
