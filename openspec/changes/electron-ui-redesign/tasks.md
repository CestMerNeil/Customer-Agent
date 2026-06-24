## 1. Design-Token Foundation

- [x] 1.1 Extend `theme.ts` into a typed token set: palette roles (surface levels, accent, neutrals, semantic states), type scale, spacing, radius, elevation, and motion durations/easings.
- [x] 1.2 Replace hardcoded brand colors in `NavigationRail`, `TopAppBar`, `AutoReplyDashboard` hero/cards, and `AccountManager` table head with token references.
- [x] 1.3 Provide a shared `tokens` helper as the single sanctioned source for colors so new components reference it instead of inline brand literals.
- [x] 1.4 Verify the token set renders consistently with a renderer smoke test of the themed shell (`App.test.tsx`).

## 2. Unified Layout Shell & Navigation IA

- [x] 2.1 Rework `RootLayout` + `NavigationRail` + `TopAppBar` into one unified surface language (drop the dark-rail / light-content split).
- [x] 2.2 Reorder navigation around operator tasks and make the review workspace the default landing surface in `App.tsx`.
- [x] 2.3 Ensure navigation items are keyboard reachable, focus-visible, ARIA-labeled, and expose active state.
- [x] 2.4 Update `App.test.tsx` for the new default surface and navigation behavior.

## 3. Human-Review Workspace

- [x] 3.1 Verify `reply.draft.list` + `message.list` expose enough linkage for master–detail (`draft.messageId` → `message.id`); derive client-side from existing fields.
- [x] 3.1a Extend `reply.draft.send` contract with optional `text`; update `packages/pdd` `sendDraft` to persist and send edited text when present (backward compatible); update the `apps/desktop` main handler to pass it; add package-level coverage for the edited-send path.
- [x] 3.2 Build the workspace master list of pending drafts with selection and pending counts.
- [x] 3.3 Build the detail pane: source buyer message, matched knowledge context, and an editable draft reply field.
- [x] 3.4 Wire send (with edited text), ignore, and escalate to `reply.draft.send` / `reply.draft.ignore` / `reply.draft.escalate` and reflect resulting state.
- [x] 3.5 Add empty state (no pending drafts) and sanitized inline error with retry that preserves edited text on failure.
- [x] 3.6 Add tests: select draft, edit-and-send, ignore, escalate, action failure retry, empty state.

## 4. Page State Surfaces & Control Wiring

- [x] 4.1 Add a shared state-surface pattern (loading / empty / error+retry / populated) and apply it via `StateSurface` + `useAsync`.
- [x] 4.2 Replace the dashboard hardcoded `value={32}` readiness with a real `inference.health`-derived value.
- [x] 4.3 Wire the dashboard "view pending" (navigate to review workspace) and "refresh" actions.
- [x] 4.4 Remove the non-functional `LogViewer` clear control; ensure refresh works.
- [x] 4.5 Wire `KnowledgeBaseManager` global/shop partitions to real scope filtering.
- [x] 4.6 Audit remaining pages: wire the Settings business-hours control to `settings.save`; confirm Accounts/Model controls are functional.
- [x] 4.7 Add tests for empty/error states and the review workspace wired controls.

## 5. Verification

- [x] 5.1 Run package tests for the touched packages (core, pdd) — green at the time this UI change was implemented.
- [x] 5.2 Run desktop renderer tests, typecheck, lint, and production build — all green.
- [x] 5.3 Historical verification: the former mock flow passed when this UI change was implemented. Current parity work removes that harness and uses real acceptance gates instead.
- [x] 5.4 Run `openspec validate electron-ui-redesign --strict` and resolve any spec issues.
- [ ] 5.5 Manual pass: launch the app, confirm review workspace lands by default, drive one draft through edit→send, and confirm no unwired controls or fabricated values remain — pending an interactive desktop session.
