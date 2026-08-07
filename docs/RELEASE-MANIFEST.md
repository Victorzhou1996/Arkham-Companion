# Release Manifest

This Server snapshot was built and verified on 2026-08-07.

## Changes

- Added two prebuilt decks, including their notes and sideboards, to every new
  account created by either the standard backend or the server sidecar.
- Completed-campaign decks can now be selected for interlude upgrades.
- Final physical and mental trauma is stored with the completed deck and restored
  when that deck is used in a later campaign.
- Build deck conversion now preserves the deck notes used by the starter decks.
- Preserved the selected upstream rules updates, current The Drowned City content,
  Chinese scenario text, response controls, narration, and image fallbacks.

## Server Artifacts

- `server/release/bin/arkham-api`
  - Platform: Linux x86-64
  - SHA256: `2acaa003e7b8760e3fc83542952030297873c769cd6d1c3f42921e62cf11d0ae`
- Server release tar SHA256:
  `eecf314b523606c8e26c8104cf81c68eb8710d02344292d0ee8c2c5f8b148594`

The live database, user accounts, saves, runtime logs, server secrets, and
deployment backups are intentionally not included.

## Verification

- Backend library build: passed (6666 modules).
- Registration behavior was verified with real temporary accounts on the local
  and unkai databases; Build deck-conversion tests passed.
- Frontend unit tests: passed.
- Frontend TypeScript/Vue type check: passed.
- Frontend production build: passed.
- macOS backend build: passed.
- Linux x86-64 backend build: passed.
- Local game, Build route, card images, real new-account registration, and unkai
  deployment: passed.

The Online server was not modified by this release.

## Cards

The shared card library contains the current AVIF files under `shared/cards/`,
including the previously missing `01000.avif`.
The macOS Companion bundle contains its own embedded copy under
`Contents/Resources/CardImages`.

## Companion

The App bundle is unsigned. On macOS, right-click the app and choose **Open**
on first launch if Gatekeeper blocks it.
