# Release Manifest

This repository snapshot was assembled from the tested Unkai deployment on 2026-07-23.

## Server

- `server/release/bin/arkham-api`
  - SHA256: `184e8b64c633465a9933472222eb441ab7223fa1ca44481d9f9eff40b013f211`
- `server/release/frontend-dist/index.html`
  - SHA256: `a69d5830676585fc4f02f6ea37ca0d8776596971fe70eb18a2ffc450c69a6f30`
- `server/release/build/index.html`
  - SHA256: `ccfd6eed2bbc303065a00c973d872ee4432dca6f9e82124c7a74fdd717af391a`

The live database, user accounts, saves, runtime logs, server secrets, and deployment backups are intentionally not included.

## Cards

The shared card library contains the current AVIF files under `shared/cards/`. The macOS Companion bundle contains its own embedded copy under `Contents/Resources/CardImages`.

## Companion

The App bundle is unsigned. On macOS, right-click the app and choose **Open** on first launch if Gatekeeper blocks it.
