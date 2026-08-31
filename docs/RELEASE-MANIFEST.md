# Release Manifest

This Server source and game frontend snapshot was updated and verified on
2026-08-31.

## Changes

- Added two prebuilt decks, including their notes and sideboards, to every new
  account created by either the standard backend or the server sidecar.
- Completed-campaign decks can now be selected for interlude upgrades.
- Final physical and mental trauma is stored with the completed deck and restored
  when that deck is used in a later campaign.
- Build deck conversion now preserves the deck notes used by the starter decks.
- Added complete Chinese localization for all standalone scenarios while
  preserving the existing The Drowned City localization.
- Updated the source snapshot with the selected upstream rules and content fixes
  while preserving the local undo modes, response controls, narration, Build,
  management tools, starter decks, and image fallbacks.
- Added the visible application version `2026.08.31` to the home page.
- Added anonymous server totals below the support QR code. The browser refreshes
  them hourly, while the sidecar caches the aggregate database query for one hour.

## Source Snapshot

- Source commit: `555fcc8fac`
- Source location: `server/source/ArkhamHorror`
- The game frontend in `server/release/frontend-dist` was built from this source.
- Windows packages should rebuild the backend from this source and then apply the
  files under `server/windows`.

## Server Artifacts

- `server/release/bin/arkham-api`
  - Platform: Linux x86-64
  - SHA256: `725eb4cecca1da54f36cfcdf72d4b068701bcd1eb4178353bbe66d94fe75e9fe`

The bundled Linux backend remains the previously verified 2026-08-23 binary.
Rebuild it from the included source before packaging any backend rule changes.

The live database, user accounts, saves, runtime logs, server secrets, and
deployment backups are intentionally not included.

## Verification

- Frontend unit tests: passed (29/29).
- Sidecar unit tests: passed (19/19).
- Frontend TypeScript/Vue type check: passed.
- Frontend production build: passed.
- Chinese locale validation: passed for all 144 locale JSON files, with no
  missing locale files or leaf keys.
- The complete macOS local package was separately rebuilt and verified from the
  same source snapshot.

No server database, player save, account, credential, or live deployment is
included in this GitHub update.

## Cards

The shared card library contains the current AVIF files under `shared/cards/`,
including the previously missing `01000.avif`.
The macOS Companion bundle contains its own embedded copy under
`Contents/Resources/CardImages`.

## Companion

The App bundle is unsigned. On macOS, right-click the app and choose **Open**
on first launch if Gatekeeper blocks it.
