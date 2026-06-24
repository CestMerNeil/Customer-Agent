## Why

The Electron merchant assistant backend is production-leaning: account login/start/stop passed a real Pinduoduo acceptance run, and review-lifecycle, diagnostics, and release-readiness IPC all exist. The renderer, however, is still a scaffold built for the empty-data state. It wires most IPC channels but leaves the product's core loop — human review of AI drafts (approve / edit / send / ignore / escalate) — buried as shallow list items, ships unwired buttons and a hardcoded readiness value, and mixes a dark navigation rail with light content without a shared design system.

This change re-inventories the GUI and rebuilds the front end around a coherent, content-first design language inspired by Apple HIG and Material 3: a single design-token foundation, a clear information architecture, a review workspace as the primary surface, and complete state handling (loading / empty / error / live) with no unwired controls.

## What Changes

- Establish a single front-end design-token foundation (color, typography, spacing, radius, elevation, motion) and apply it consistently across navigation, top bar, and content — replacing the ad-hoc dark-rail-plus-light-content split and per-component hardcoded colors.
- Re-architect the information architecture so the primary surface is a focused review workspace, with secondary surfaces for accounts, knowledge, model, settings, and logs organized by operator task rather than by backend module.
- Build a human-review workspace UI that exposes the full draft lifecycle — view source message and matched knowledge, edit the draft, then send / ignore / escalate — driving the existing `reply.draft.*` IPC end to end.
- Complete every page's state surfaces (loading, empty, error, populated) and remove placeholder behavior: wire the dashboard "view pending" / "refresh" actions, replace the hardcoded model-readiness value with real inference health, and wire the log "clear" affordance or remove it.
- Make the redesigned renderer accessible and verifiable: keyboard navigation, focus states, and ARIA on interactive surfaces, covered by renderer tests.

## Capabilities

### New Capabilities

- `electron-ui-foundation`: A shared design-token system, themed layout shell, and task-oriented navigation information architecture for the renderer.
- `electron-review-workspace`: A primary human-review workspace that surfaces source message, matched knowledge, and editable draft, and drives send / ignore / escalate to completion.
- `electron-ui-state-surfaces`: Complete loading / empty / error / populated states for every page and full wiring of previously placeholder controls and values.

### Modified Capabilities

- None. This change adds renderer-facing capabilities and does not alter existing backend behavior contracts.

## Impact

- Affects `apps/desktop/src/renderer` — `theme.ts`, layout components (`RootLayout`, `NavigationRail`, `TopAppBar`), all six page components, and `App.tsx` navigation/IA.
- Affects renderer tests under `apps/desktop/src/renderer` (`App.test.tsx` and new page/workspace tests).
- Consumes existing IPC channels (`account.*`, `message.*`, `reply.draft.*`, `reply.generate`, `knowledge.*`, `log.*`, `settings.*`, `inference.*`, `app.health`). One minimal write extension is required: `reply.draft.send` gains an optional `text` so an operator-edited draft can be sent and persisted. This touches `packages/core` (contract), `packages/pdd` (`sendDraft`), and the `apps/desktop` main handler; it is additive and backward compatible.
- Touches `packages/pdd` for the edited-send path, in addition to renderer tests.
- Does not change persistence schema or add new PDD business behavior beyond the edited-send path. The separate `implement-reference-feature-parity` change removes the former mock/seam verification harness and replaces it with real acceptance gates.
- Does not add cloud services, multi-operator state, or new customer-service product features beyond surfacing the existing review loop and readiness.
