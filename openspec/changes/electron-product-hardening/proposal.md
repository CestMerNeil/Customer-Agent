## Why

The Electron app has a working MVP foundation, but several production capabilities are still implemented with lightweight local adapters or missing operational tooling. Completing these areas is required before running a serious end-to-end test and deciding whether the product is ready for merchant use.

## What Changes

- Replace the JSON app store with a SQLite-backed store and Drizzle schema definitions.
- Replace JSON vector indexing with a LanceDB-backed knowledge index.
- Encrypt locally persisted PDD cookies/tokens before storage.
- Replace the lightweight reply workflow with a LangChain.js runnable workflow.
- Add managed vLLM lifecycle support and ModelScope download/cache orchestration.
- Add Electron packaging configuration, macOS signing/notarization placeholders, and update feed configuration hooks.

## Capabilities

### New Capabilities

- `electron-production-storage`: SQLite persistence, Drizzle schema, encrypted session data, and durable app state.
- `electron-production-knowledge`: LanceDB-backed document indexing and retrieval.
- `electron-production-agents`: LangChain.js reply workflow backed by OpenAI-compatible inference.
- `electron-model-runtime`: vLLM process lifecycle and ModelScope model cache management.
- `electron-release-flow`: Electron package/build configuration for desktop release artifacts and update hooks.

### Modified Capabilities

- None.

## Impact

- Affects `packages/db`, `packages/knowledge`, `packages/agents`, `packages/inference`, `apps/desktop`, package manifests, and OpenSpec docs.
- Adds runtime dependencies for SQLite/Drizzle, LanceDB, LangChain, and Electron packaging.
- Requires local machine validation for vLLM, ModelScope, macOS signing/notarization, and update hosting.
