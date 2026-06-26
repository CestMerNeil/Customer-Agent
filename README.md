# Customer Agent Desktop

Electron + TypeScript desktop app for Pinduoduo customer-service automation.

## Development

```bash
pnpm install --frozen-lockfile
pnpm dev
```

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @customer-agent/desktop smoke:runtime
```

Business-critical PDD, LLM, Agent, knowledge, product-sync, handoff, queue, and
release behavior is not verified by mocks. Use sanitized real acceptance records
and the active OpenSpec change:

```bash
pnpm exec openspec status --change implement-reference-feature-parity
pnpm exec openspec validate implement-reference-feature-parity --strict
pnpm acceptance:generate -- --commit <sha> --out acceptance/skeleton.json
pnpm acceptance:validate -- --file acceptance/skeleton.json --commit <sha>
pnpm pdd:calibration:template -- --commit <sha> --out calibration/<sha>.json
pnpm pdd:calibration:validate -- --file calibration/<sha>.json --commit <sha>
pnpm pdd:calibration:summarize -- --file calibration/<sha>.json --out calibration-summary/<sha>.json
```

## GitHub Actions

- `.github/workflows/ci.yml` runs lint, typecheck, tests, build, and runtime smoke on pull requests and pushes to `main`/`master`.
- `.github/workflows/build-desktop.yml` builds macOS and Windows desktop artifacts on `v*` tags or manual workflow dispatch.

Desktop artifacts are uploaded from `apps/desktop/release/`.
