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

The first parity release is unsigned. To require signing/notarization preflight,
run packaging with `ELECTRON_PACKAGE_MODE=signed` and set:

Set these environment variables before a signed macOS release:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `CSC_LINK` / `CSC_KEY_PASSWORD` if using electron-builder certificate import

If Apple credentials are not present, `scripts/notarize.mjs` skips notarization.

## Updates

The default update URL points at GitHub Releases:

```text
https://github.com/CestMerNeil/Customer-Agent/releases/latest/download/
```

Set `UPDATE_URL` or `ELECTRON_BUILDER_PUBLISH_URL` only when publishing from a
different generic update feed.

Packaged desktop builds use `electron-updater` against this feed. The app checks
for updates shortly after startup and also exposes a manual check in Settings.
Downloads are automatic after an update is found; installation waits for the
operator to click the restart/install action. Development builds report updates
as disabled.
