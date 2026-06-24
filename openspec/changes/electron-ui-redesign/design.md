## Context

The renderer is React 18 + MUI + Material Symbols, ~1,447 lines across `App.tsx`, three layout components, and six pages. It talks to the main process through a single preload bridge, `window.customerAgent.invoke(channel, payload)`. Backend capability is ahead of the UI: `reply.draft.list` / `reply.draft.send` / `reply.draft.ignore` / `reply.draft.escalate`, `inference.*` runtime control, `knowledge.*`, `account.*`, and `app.health` are all wired.

Current UI gaps observed during inventory: the navigation rail is dark (`#17211f`/`#e8c468`) while content is light, with colors hardcoded per component instead of drawn from the theme; `AutoReplyDashboard` renders a hardcoded `value={32}` model-readiness bar and unwired "view pending"/"refresh" buttons; the human-review lifecycle is reachable only as read-only list rows with no edit/approve affordance; `LogViewer` has an unwired clear button; `KnowledgeBaseManager` shows a "店铺专属" partition that does nothing. The product's core operator job — reviewing and dispatching AI drafts — has no dedicated surface.

The requested direction is a macOS-native look modeled on Apple's system apps (System Settings / Finder / Mail): a translucent, grouped, labeled source-list sidebar; inset grouped lists; segmented controls; SF typography; hairline separators; the system accent; and light + dark that follow the OS appearance. Content-first, restrained, systematic tokens, and accessibility remain baseline.

## Goals / Non-Goals

**Goals:**

- One design-token source of truth driving every renderer surface; no per-component hardcoded brand colors.
- An information architecture organized around operator tasks, with the human-review workspace as the default landing surface.
- A review workspace that takes a draft from source-message + matched-knowledge context through edit to a terminal action (send / ignore / escalate) using existing IPC.
- Every page handles loading, empty, error, and populated states explicitly; no unwired controls or fabricated values remain.
- Keyboard-navigable, focus-visible, ARIA-labeled interactive surfaces, verified by renderer tests.

**Non-Goals:**

- Changing backend behavior or IPC contracts beyond one additive, backward-compatible extension: an optional `text` on `reply.draft.send` to support editing a draft before sending. No persistence schema change or PDD adapter change.
- Adding new product features beyond surfacing the existing review loop, diagnostics, and readiness.
- Replacing MUI with another UI framework or introducing a CSS-in-JS migration.
- Cloud sync, theming marketplace, or multi-operator/admin views.
- Localization beyond the existing zh-CN copy (English is not added in this change).
- A manual in-app light/dark toggle: appearance follows the OS only.

## Decisions

- **Single token layer over MUI theme.** Extend `theme.ts` into a typed token set (palette roles, type scale, spacing, radius, elevation, motion durations/easings) and consume it via `sx`/`styled` everywhere. Alternative considered: keep per-component constants; rejected because it is the root cause of the rail/content split and blocks consistent restyling.
- **macOS source-list sidebar with a unified material.** Replace the icon-only rail with a wide, labeled, grouped source-list sidebar on a translucent material, with the system accent filling the selected row — the System Settings / Finder pattern. The window uses `titleBarStyle: "hiddenInset"` so the sidebar runs edge-to-edge under the inset traffic lights, and the title region is a drag handle. Alternative considered: a Material navigation rail (the prior version); rejected because the user identified it as reading "Google/Material," not Apple.
- **Light + dark follow the OS via CSS variables.** Tokens are CSS custom properties switched by `prefers-color-scheme`, so custom chrome adapts with no JS; the MUI theme is rebuilt per detected mode for its components. Both light and dark use Apple system colors. Alternative considered: a single light theme (the prior non-goal); rejected because the user asked for follow-system appearance.
- **Review workspace is the default route.** Make the human-review workspace the landing surface and the navigational center of gravity, since it is the operator's primary job. Alternative considered: keep the metrics dashboard as landing; rejected because metrics are glanceable context, not the task.
- **Master–detail for review.** The workspace uses a list of pending drafts (master) plus a detail pane showing source message, matched knowledge, and an editable draft with terminal actions. Alternative considered: modal-per-draft; rejected because operators triage many drafts and need persistent context.
- **State surfaces are a contract, not an afterthought.** Define a small shared pattern (loading skeleton, empty guidance, inline error with retry, populated) reused across pages via a helper, replacing scattered ternaries. Alternative considered: per-page bespoke handling; rejected for inconsistency and missed error paths.
- **No fabricated UI values.** Replace `value={32}` and similar with real `inference.health` / status reads; wire or remove every placeholder button. Alternative considered: leave as visual stub; rejected because it misrepresents system state to operators.
- **Reuse existing IPC; one minimal write extension for edited send.** The redesign is presentation-layer except for a single additive contract change: `reply.draft.send` accepts an optional `text`. When present, `sendDraft` persists the edited text into the draft before sending; when absent, behavior is identical to today (fully backward compatible). Alternative considered: routing edited sends through `message.send`; rejected because it would not transition the draft lifecycle state, leaving the review record inconsistent. Alternative considered: a separate `reply.draft.update` channel; rejected as more surface area than the single optional field needs.
- **Incremental, page-by-page migration behind the new shell.** Land the token foundation and layout shell first, then migrate pages so the app stays runnable and package/renderer checks stay green throughout. Alternative considered: big-bang rewrite; rejected because it would make UI regressions harder to localize.

## Risks / Trade-offs

- **Visual rework can regress wired behavior** -> Migrate page-by-page, keep `App.test.tsx` plus per-page tests green, and run `pnpm --filter @customer-agent/desktop test` after each page.
- **Review workspace assumes draft↔message linkage** -> Validate that `reply.draft.list` and `message.list` expose the linkage the master–detail needs before building; if not, derive it client-side from existing fields rather than changing the contract.
- **Token migration could leave mixed old/new styling mid-change** -> Treat the token layer as the first task and forbid new hardcoded colors in migrated files; reviewers check against the token set.
- **Accessibility claims need verification, not assertion** -> Add renderer tests for focus order, ARIA roles/labels, and keyboard activation of primary review actions.
- **Scope creep into backend** -> Any change that would alter IPC behavior or persistence is pushed to a separate change; this one stays renderer-only except for trivial read additions.
