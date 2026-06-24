# Reuse Inventory

Existing Electron + TypeScript functionality that can be reused without relying
on mock-dependent completion evidence.

## Reusable

- Electron main/renderer shell and preload IPC bridge.
- SQLite local store and schema migration foundation.
- PDD login browser flow, account records, start/stop shape, and real endpoint
  service structure.
- PDD cookie parsing and HTTP client request-shape helpers.
- PDD message normalizer for deterministic parser behavior.
- Reply draft lifecycle and review workspace IPC.
- Local knowledge store and LanceDB-backed search foundation.
- OpenAI-compatible inference client.
- Local `llama-server` runtime manager and model cache foundation.
- Desktop packaging scripts and existing macOS/Windows CI packaging entrypoints.
- Secret box encryption helper.
- Renderer state-surface and review workspace components from
  `electron-ui-redesign`.

## Not Reusable As Completion Evidence

- Mock PDD library mode.
- Mock PDD process mode.
- Seam A/B/C tests.
- `verify:flow` and `report/flow/summary.json`.
- Tests that fake PDD, LLM, Agent tools, knowledge search, product sync, or
  transfer as proof of business behavior.

## Needs Hardening Before Reuse

- PDD start/send services must be calibrated against real accounts after mock
  seams are removed.
- Product APIs, goods-card send, customer-service list, and transfer require
  reference audit plus live calibration before acceptance.
- Local model runtime support must become managed first-launch or first-use
  provisioning with checksummed manifests.
- Release workflows need acceptance-record validation and leak scanning before
  publishing to GitHub Releases.
