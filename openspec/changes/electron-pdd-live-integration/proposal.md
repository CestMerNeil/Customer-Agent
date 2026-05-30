## Why

The Electron MVP currently has typed IPC, persistence, model, knowledge, and PDD adapter boundaries, but the Pinduoduo integration still returns explicit "not connected" responses. Without real login, session extraction, WebSocket receiving, and send-message support, the app cannot function as a live customer-service assistant.

## What Changes

- Implement live Pinduoduo account login through Node Playwright using a persistent browser context.
- Persist extracted account, shop, user, and cookie/session data through the Electron store boundary.
- Implement Pinduoduo WebSocket account start/stop, incoming message normalization, and message persistence.
- Implement Pinduoduo text reply sending and wire draft sending to the send-message adapter.
- Surface live connection, login, receive, send, and failure states through existing Electron IPC and renderer pages.
- Keep the Electron runtime TypeScript-only.

## Capabilities

### New Capabilities

- `pdd-live-session`: Pinduoduo live account login, session persistence, WebSocket receiving, and text reply sending for the Electron app.

### Modified Capabilities

- None.

## Impact

- Affects `packages/pdd`, `packages/core`, `packages/db`, and `apps/desktop`.
- Adds Node runtime dependencies for Playwright and WebSocket communication.
- Extends current IPC handlers from adapter-boundary behavior to live account operations.
- Requires manual validation with a real Pinduoduo merchant account for full end-to-end acceptance.
