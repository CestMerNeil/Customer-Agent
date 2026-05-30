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

## GitHub Actions

- `.github/workflows/ci.yml` runs lint, typecheck, tests, build, and runtime smoke on pull requests and pushes to `main`/`master`.
- `.github/workflows/build-desktop.yml` builds macOS and Windows desktop artifacts on `v*` tags or manual workflow dispatch.

Desktop artifacts are uploaded from `apps/desktop/release/`.
