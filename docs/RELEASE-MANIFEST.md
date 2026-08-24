# Release Manifest

This Mac snapshot was packaged and verified on 2026-08-23.

## Mac local runtime

- `mac/release/ArkhamHorror-macos-arm64/bin/arkham-api`
  - SHA256: `269df7e94b9572d19d13293edf1539f7de5d9e522d3a0a44d52190307589b856`
- `mac/release/ArkhamHorror-macos-arm64/frontend/dist/index.html`
  - SHA256: `3a802a980d9ad353e0aba19846500fea89fda6709158a8560b2cf39c265c8270`
- `mac/release/ArkhamHorror-macos-arm64/build/index.html`
  - SHA256: `20a6adf1ce7ec50f47163e3fcf691812064563c1425d1f496c463f7c3c44c2c4`
- Packaged DMG
  - SHA256: `549be5bf293f80c02bd516d67397aedecee1a464533ad89a099756884effb5c8`

Player databases, saves, runtime logs, secrets, and deployment backups are intentionally not included.

## Cards

The shared card library contains the current AVIF files under `shared/cards/`. The macOS Companion bundle contains its own embedded copy under `Contents/Resources/CardImages`.

## Companion

The App bundle is unsigned. On macOS, right-click the app and choose **Open** on first launch if Gatekeeper blocks it.
