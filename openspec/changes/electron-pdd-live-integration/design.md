## Context

The Electron app now has typed IPC, renderer screens, local persistence, inference, knowledge retrieval, reply workflow, and a `packages/pdd` adapter boundary. The missing live path is Pinduoduo account automation: login, cookie/session extraction, token retrieval, WebSocket receive loop, and text send API. The Electron runtime must stay TypeScript-only.

## Goals / Non-Goals

**Goals:**
- Use Node Playwright to perform manual-assisted Pinduoduo login and persist account/session data.
- Use stored cookies to call Pinduoduo merchant APIs for user info, shop info, chat token, status, and text send.
- Open and manage a live WebSocket connection per started account.
- Normalize incoming PDD payloads into `CustomerServiceContext`, persist them, and expose them through existing IPC.
- Send text replies from messages or review drafts through the PDD send-message endpoint.

**Non-Goals:**
- Bypassing Pinduoduo captcha, QR checks, or risk controls.
- Cloud sync, multi-user server operation, or SaaS deployment.
- Full image/card/order send support in this change.
- Replacing the current JSON store with SQLite/Drizzle; this change may shape repository methods but does not perform that migration.

## Decisions

- **Playwright persistent context per username.** Store browser profile data under Electron `app.getPath("userData")/pdd-profiles/<safe-username>` so manual login survives restarts. Alternative considered: stateless browser sessions; rejected because it would require repeated manual login and loses risk-check continuity.
- **Cookie jar as serializable name/value map.** Store cookies in the existing account record `cookies` field as JSON. Alternative considered: storing full Playwright cookie objects; rejected for MVP because API calls only need Cookie header construction.
- **Fetch-based PDD HTTP client.** Implement `PddHttpClient` around `fetch`, cookie headers, JSON/form bodies, and typed response extraction. Alternative considered: adding axios; rejected to avoid extra dependency.
- **WebSocket adapter owns runtime connections.** Keep active sockets in memory inside `PddService`, keyed by account id. Persist messages and account status through callbacks/repository methods from Electron main. Alternative considered: making Electron main own sockets; rejected to keep PDD-specific behavior inside `packages/pdd`.
- **Generate/send flow remains orchestration-neutral.** PDD receive/send updates messages and drafts, while reply generation stays in `packages/agents`. This prevents PDD transport code from depending on model or knowledge packages.

## Risks / Trade-offs

- **PDD endpoint shape changes** → Keep endpoint constants localized in `packages/pdd` and cover request construction with tests.
- **Manual login cannot be validated in CI** → Provide unit tests for parsing/request construction and manual acceptance steps for live accounts.
- **WebSocket messages vary by type** → Normalize known user text/goods/order types and persist unknown messages as system/status with raw payload retained.
- **Session expiry during send/token calls** → Return explicit session-expired errors and mark account `error`; automatic relogin can be a later change.
- **JSON store is not final persistence** → Keep repository-facing data structures stable so SQLite/Drizzle can replace storage later.

## Migration Plan

1. Add PDD HTTP/session helpers and unit tests.
2. Replace `PddService` placeholder methods with live login, start/stop, and send behavior.
3. Extend Electron main IPC handlers to persist live account/message/draft state.
4. Update renderer status handling without changing route structure.
5. Validate with tests, typecheck, build, smoke, and one manual PDD account run when credentials are available.
