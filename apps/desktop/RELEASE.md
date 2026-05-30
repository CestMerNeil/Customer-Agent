# Electron Release Flow

## macOS package

Run:

```bash
pnpm --filter @customer-agent/desktop package:mac
```

Unsigned local directory build:

```bash
pnpm --filter @customer-agent/desktop package:dir
```

## Signing and notarization

Set these environment variables before a signed macOS release:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `CSC_LINK` / `CSC_KEY_PASSWORD` if using electron-builder certificate import

If Apple credentials are not present, `scripts/notarize.mjs` skips notarization.

## Updates

The default update URL is a non-production placeholder in `package.json`.
Replace it with the generic update feed base URL before publishing a real release.
