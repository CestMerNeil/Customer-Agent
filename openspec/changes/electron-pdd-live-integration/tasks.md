## 1. PDD HTTP and Session Helpers

- [x] 1.1 Add PDD cookie serialization and request header helpers with tests.
- [x] 1.2 Add fetch-based PDD HTTP client for JSON and form POST calls with tests.
- [x] 1.3 Add user info, shop info, chat token, set-online-status, and text-send API methods with request construction tests.

## 2. Playwright Login

- [x] 2.1 Add Playwright login service that opens a persistent Chromium context under Electron user data.
- [x] 2.2 Detect successful merchant backend login and extract cookies.
- [x] 2.3 Fetch user/shop info after login and return a complete account record through `account.login`.

## 3. WebSocket Lifecycle

- [x] 3.1 Add active connection registry inside `PddService` keyed by account id.
- [x] 3.2 Implement `account.start` token retrieval, WebSocket open, account status update, and connection logs.
- [x] 3.3 Implement `account.stop` close behavior, status update, and no-reconnect semantics.
- [x] 3.4 Persist incoming WebSocket payloads as normalized message records.

## 4. Sending Replies

- [x] 4.1 Implement `message.send` using the PDD text send endpoint and update source message state.
- [x] 4.2 Implement `reply.draft.send` to send draft text, update draft state, and update source message state.
- [x] 4.3 Return explicit failure details and preserve unsent state on send errors.

## 5. Renderer and Verification

- [x] 5.1 Surface live account status and PDD operation errors in account/dashboard views.
- [x] 5.2 Add or update tests for PDD helpers, IPC handlers, message normalization, and send-state transitions.
- [x] 5.3 Run typecheck, lint, package tests, renderer tests, renderer build, and Electron runtime smoke.
- [x] 5.4 Document manual acceptance steps for a real Pinduoduo merchant account.
