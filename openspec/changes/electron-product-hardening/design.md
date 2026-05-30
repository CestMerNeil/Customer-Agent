## Context

The current MVP intentionally used simple JSON-backed services to establish Electron IPC, PDD, knowledge, inference, and renderer wiring. The product now needs durable storage, encrypted sessions, real vector storage, an agent workflow library, model runtime management, and release packaging.

## Goals / Non-Goals

**Goals:**
- Provide production-shaped implementations behind the existing service boundaries.
- Preserve current IPC contracts where possible.
- Keep local-first operation: SQLite file, LanceDB directory, local vLLM process, ModelScope cache.
- Make external tool requirements explicit and testable.

**Non-Goals:**
- Cloud sync or SaaS backend.
- Full production certificate provisioning inside source control.
- Guaranteed ModelScope/vLLM success on machines that do not have GPU/model-runtime prerequisites.

## Decisions

- **SQLite via sql.js plus Drizzle schema definitions.** Use a file-backed SQLite database that runs without native build dependencies in this environment, while keeping Drizzle table definitions as the schema contract for a future native driver migration.
- **Node crypto AES-256-GCM for session secrets.** Use a local secret key file under Electron user data for MVP encryption. This avoids committing secrets and can later move to macOS Keychain/Windows Credential Manager.
- **LanceDB service with local path.** Store vectors in a LanceDB table under app user data and keep metadata compatible with existing knowledge result types.
- **LangChain RunnableSequence.** Build a runnable prompt/model/parser sequence and keep a fallback lightweight path only for test injection, not production runtime.
- **vLLM/ModelScope as managed external commands.** Electron controls process lifecycle and cache paths, but does not embed model-serving runtimes or model weights.
- **electron-builder for release config.** Use a conventional builder config and leave signing/notarization credentials as environment variables.

## Risks / Trade-offs

- **Native/runtime dependency availability** → Use dynamic errors and documented prerequisites for LanceDB, vLLM, and ModelScope.
- **sql.js is not the final native DB driver** → Schema and repositories are isolated so better-sqlite3/libsql can replace it later.
- **Local key file encryption protects casual leakage, not full OS compromise** → Document upgrade path to OS credential storage.
- **Packaging/signing requires developer credentials** → Add config and scripts, but final notarization needs Apple credentials.
