## 1. Unified Provider Contract

- [x] 1.1 Add multimodal capability to the existing main-process Model Provider client contract.
- [x] 1.2 Make provider creation capability-aware while preserving selected local/remote routing and no implicit fallback.

## 2. Product Sync Migration

- [x] 2.1 Route product-knowledge extraction through the selected Model Provider and remove direct local runtime/profile access from product sync.
- [x] 2.2 Surface the sanitized provider failure in product-sync progress, diagnostics, and the knowledge UI.

## 3. Verification

- [x] 3.1 Add focused tests proving remote multimodal routing, local capability enforcement, and no cross-provider fallback.
- [x] 3.2 Run typecheck, lint, tests, desktop build, strict OpenSpec validation, and packaged runtime smoke.
