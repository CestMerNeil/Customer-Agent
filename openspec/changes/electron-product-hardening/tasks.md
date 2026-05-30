## 1. Production Storage

- [x] 1.1 Add SQLite/Drizzle dependencies and schema exports.
- [x] 1.2 Implement encrypted session secret helper.
- [x] 1.3 Implement SQLite-backed app store and switch Electron main to it.
- [x] 1.4 Add persistence and encryption tests.

## 2. Production Knowledge

- [x] 2.1 Add LanceDB service implementation behind the existing knowledge interface.
- [x] 2.2 Persist knowledge metadata in the production store.
- [x] 2.3 Add LanceDB import/search tests with mocked embeddings.

## 3. LangChain Agents

- [x] 3.1 Add LangChain dependencies and implement a LangChain reply workflow.
- [x] 3.2 Keep test injection path while production uses LangChain.
- [x] 3.3 Add LangChain workflow tests.

## 4. Model Runtime

- [x] 4.1 Implement vLLM process manager.
- [x] 4.2 Implement ModelScope cache/download manager.
- [x] 4.3 Add runtime manager tests for command construction and lifecycle.

## 5. Release Flow

- [x] 5.1 Add electron-builder config and package scripts.
- [x] 5.2 Add signing/notarization/update placeholders.
- [x] 5.3 Add release documentation.

## 6. Verification

- [x] 6.1 Run package tests, renderer tests, typecheck, lint, renderer build, and runtime smoke.
- [x] 6.2 Validate OpenSpec change.
