# v1.0.3 Release Readiness

## Release target

- Tag: `v1.0.3`
- Accepted implementation commit: `212529134b97fe6393298ee4acc9f7a648fbf2ca`
- Desktop package version: `1.0.3`
- Distribution channel: GitHub Releases
- Update feed base: `https://github.com/CestMerNeil/Customer-Agent/releases/latest/download/`

## Acceptance records

Release-blocking acceptance is recorded with sanitized aliases only:

- `acceptance/release-v1.0.3-darwin-arm64-2125291.json`
- `acceptance/release-v1.0.3-win32-x64-2125291.json`

The records cover:

- real PDD merchant operations
- auditable Agent workflow
- local model runtime provisioning
- knowledge and product governance
- message queue and concurrency
- multi-shop operations
- desktop operations workspace
- real-acceptance release gates
- secret-safety governance

## Local runtime decision

The release keeps the app-managed `llama-server` runtime as the managed local
provider and treats the Responses API-compatible contract as the architecture
boundary. The default local profile is `Qwen2.5-VL 3B` with GGUF model and
`mmproj` metadata, checksums, license metadata, and macOS/Windows platform
support recorded in `packages/core/src/local-model-profiles.ts`.

Runtime candidates remain acceptable only when they satisfy the required chat,
tool-call, tool-result continuation, and vision probes. Prompt-only JSON tool
emulation is not accepted as the Agent contract.

## Reference comparison

The final implementation was checked against the reference README and audited
must-scope paths through the capability map. The release-blocking surface is
covered by the acceptance matrix above rather than by source-structure parity
with the reference project.

## Residual scope

- Code signing and macOS notarization are deferred from the first parity release.
- GitHub Release `v1.0.3` was published by Build Desktop run `28641413650`:
  `https://github.com/CestMerNeil/Customer-Agent/releases/tag/v1.0.3`.
- Published assets are limited to macOS/Windows packages, update metadata,
  blockmaps, and platform checksum files.
