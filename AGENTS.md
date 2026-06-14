# AGENTS.md

Operating contract for the receive→reply→send eval harness. This file makes the
pipeline verifiable by an AI assistant with a single command and a machine-readable
verdict — no real Pinduoduo account required.

For general coding behavior (simplicity, surgical changes, goal-driven execution)
follow **CLAUDE.md**; this file does not repeat it.

## The single verdict

Run the harness, then read the JSON — never the scrolled logs.

| Tier | Command | Layers | When |
| --- | --- | --- | --- |
| Fast | `pnpm verify:flow:fast` | Seam A + B (in-process, deterministic) | Inner loop while editing |
| Full | `pnpm verify:flow` | Seam A + B + C (Playwright/Electron) | Before declaring done |

- **Report:** `report/flow/<layer>.json` per layer + `report/flow/summary.json` aggregate.
- **Source of truth:** the process **exit code** and `summary.json` — not console output.
- **Verdict schema (per layer):**

  ```json
  { "layer": "A", "passed": 3, "failed": 0,
    "failures": [{ "id": "...", "expected": "...", "actual": "...", "file": "..." }] }
  ```

  `verify:flow` exits non-zero if any layer has `failed > 0`.

> If `verify:flow` is not yet wired in `package.json`, the layers still run directly:
> Seam A/B via `pnpm -r test`, Seam C via `pnpm --filter @customer-agent/desktop e2e:seam-c`.

## Command per seam

Run the seam that covers the area you touched.

| Seam | Covers | Command | Run after touching |
| --- | --- | --- | --- |
| A | Transport / normalize / service (`PddService` + mock-pdd, in-process) | `pnpm --filter @customer-agent/pdd test` (`packages/pdd/src/flow.test.ts`) | `packages/pdd` |
| B | received → reply → send glue (real `PddService` + mock-pdd + mock inference) | `pnpm --filter @customer-agent/desktop test` (`apps/desktop/src/main/seam-b.test.ts`) | the reply glue / `apps/desktop/src/main` |
| C | Full pipe + IPC + renderer through the mock **process** | `pnpm --filter @customer-agent/desktop e2e:seam-c` (`apps/desktop/scripts/e2e-seam-c.mjs`) | anything end-to-end (IPC, renderer, packaged runtime) |

Seam C points the app at the mock process via env overrides `PDD_HTTP_BASE_URL` /
`PDD_WS_BASE_URL` (see `packages/pdd/src/endpoints.ts`).

## How to add a fixture

- Fixtures live in **`packages/pdd/src/mock-pdd.ts`** (`mockFixtures`). This is the
  **single source** for both library mode and process mode — they cannot diverge.
- Fixtures must be **derived from recorded real shapes, never invented**. A guessed
  shape lets the loop close against fiction while the real pipe stays broken.
- The inbound frame shape is seeded from `packages/pdd/src/normalizer.test.ts`:
  `{ msg_id, message_type, content, from:{uid,nickname}, ts }`.
- Refresh fixtures from real shapes during calibration (below).

## Known boundaries the harness enforces

These boundaries are intentional. Treat a failure here as evidence to fix the
pipeline, not as console noise to ignore.

1. **Full closure requires Seam C.** `pnpm verify:flow:fast` proves the deterministic
   in-process seams only. Before declaring the mock receive→reply→send loop done,
   run `pnpm verify:flow` and require Seam C to pass.
2. **A green Seam A does not mean the whole pipe works.** `handleSocketMessage` stops at
   `saveMessage({state:"received"})`; reply generation lives in `apps/desktop/src/main`.
   That is exactly why the seams are separated — a failing seam localizes the break
   instead of one opaque red.

## The loop

Tie this to CLAUDE.md §4 (define success criteria, loop until verified):

```
build → pnpm verify:flow → read report/flow/summary.json → fix → repeat
```

`summary.json` and the exit code are the success criterion. Loop until `failed: 0`
across all layers you ran.

## Calibration

The mock is faithful only as long as it matches live Pinduoduo. Periodically re-record
real shapes back into `mockFixtures` per
`openspec/changes/electron-e2e-eval-harness/manual-acceptance.md`.
