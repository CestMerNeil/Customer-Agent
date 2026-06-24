# Reference Audit

Reference repository: `JC0v0/Customer-Agent`

Audited commit: `59467291c64dd69335d3e52612e38556a1833865`

## README Must Scope

- Pinduoduo WebSocket receive path.
- AI automatic reply.
- Custom Agent framework with multi-turn tool use and conversation context.
- Product recommendation and goods-card sending.
- Product knowledge base.
- Customer-service knowledge base.
- Pinduoduo product sync.
- Multimodal LLM product extraction.
- Keyword and intent-based human handoff.
- Async message queue and handler chain.
- WebSocket heartbeat, reconnect, and lifecycle governance.
- Windows desktop delivery.

## Code-Audited Must Scope

- Real PDD chat token retrieval, user info, shop info, online/offline status.
- Real text send through `plateau/chat/send_message`.
- Real goods-card send through `plateau/message/send/mallGoodsCard`.
- Real customer-service list and transfer through reference transfer APIs.
- Product list and detail APIs, including parsed source metadata.
- Session-expiry handling such as PDD error code `43001`.
- Request retry with backoff and jitter.
- Cookie refresh/relogin guard.
- WebSocket heartbeat, reconnect, and connection status manager.
- Queue consumer, deduplication, handler chain, and keyword-first handoff.
- Product and customer-service knowledge tables with reviewable source lineage.
- Product sync with multimodal extraction, progress, cancellation, and failure records.
- UI surfaces for accounts, auto-reply, keyword rules, knowledge, logs, and settings.

## Should Scope

- Auxiliary operational management behavior that improves supportability but is not required for the receive -> reply -> recommend -> handoff loop.
- Reference UI details that do not affect merchant workflow behavior.
- Extra diagnostics that can be implemented after the real acceptance path is stable.

## Out of Scope

- Rewriting the app in Python, PyQt, SQLAlchemy, or PyInstaller.
- Placeholder channels for JD, Taobao, Douyin, and Kuaishou when they do not have live implementations.
- Mock PDD, fixture PDD, Seam A/B/C, or `verify:flow`.
- Remote multimodal fallback for product image extraction.
- Code signing and macOS notarization in the first parity release.

## Completion Rule

README and code-audited must-scope items require real acceptance records when they depend on PDD, LLM, Agent tools, product sync, knowledge search, human handoff, queue behavior, multi-shop isolation, or release automation.
