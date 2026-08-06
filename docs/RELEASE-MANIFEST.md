# Release Manifest

This Server snapshot was built and verified on 2026-08-06.

## Changes

- Synced the selected low-risk upstream rule fixes and current The Drowned City
  development content.
- Added Chinese, searchable card-name choices for Foresight.
- Restored recent Cycle 5, 6, 7, and 9 Chinese scenario text corrections.
- Preserved response controls, narration, achievement fixes, the multi-row token
  selector, and local/CDN/server card-image fallbacks.
- Fixed the packaged Build route and refreshed the manual rebuild workflow.

## Server Artifacts

- `server/release/bin/arkham-api`
  - Platform: Linux x86-64
  - SHA256: `a98961e6d2b9fb1df67bfd736dee778d0285df4ca01139b7d4386f716f558986`
- Server release tar SHA256:
  `80fcb963cd3eeb289922c8aead52516d054d18263b5563ef72e05aea8641810f`

The live database, user accounts, saves, runtime logs, server secrets, and
deployment backups are intentionally not included.

## Verification

- Backend test suite: passed.
- Frontend unit tests: passed.
- Frontend TypeScript/Vue type check: passed.
- Frontend production build: passed.
- macOS backend build: passed.
- Linux x86-64 backend build: passed.
- Local game, Build route, card images, and unkai deployment: passed.

The Online server was not modified by this release.

## Cards

The shared card library contains the current AVIF files under `shared/cards/`,
including the previously missing `01000.avif`.
The macOS Companion bundle contains its own embedded copy under
`Contents/Resources/CardImages`.

## Companion

The App bundle is unsigned. On macOS, right-click the app and choose **Open**
on first launch if Gatekeeper blocks it.
