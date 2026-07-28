# Release Manifest

This Server snapshot was built and verified on 2026-07-28.

## Changes

- Hand-card response mode controls now appear only on Fast events and Fast assets.
- Stale response mode settings from older builds are ignored when they no longer apply.
- The narration selection menu stays open until it is explicitly closed or Escape is pressed.
- Return to The Path to Carcosa now includes all 16 campaign achievements.
- Fresh database setup includes the current development-mode, epic-event, and achievement schema.

## Server Artifacts

- `server/release/bin/arkham-api`
  - Platform: Linux x86-64
  - SHA256: `ef8d55d06d5cc4a484fb94442a66bf05381069cf1169897530f4ab2a459d2361`
- `server/release/frontend-dist/index.html`
  - SHA256: `25bad87cca3f2685c75bf3f7d752d0d867dd8dbaa37f973e5661b552603be1b8`
- `server/release/build/index.html`
  - SHA256: `e63a4103763c1edf184d80af19e85f8454aac49641448456ec42ab6777b79169`

The live database, user accounts, saves, runtime logs, server secrets, and
deployment backups are intentionally not included.

## Verification

- Frontend unit tests: 17 passed, 0 failed.
- Frontend TypeScript/Vue type check: passed.
- Frontend production build: passed.
- Achievement test suite: 87 passed, 0 failed.
- Return to The Path to Carcosa achievement tests: 30 passed, 0 failed.
- Local registration, authentication, achievements API, and visual achievement
  catalog verification: passed.
- Unkai public root, health check, hashed main asset, registration,
  authentication, achievements API, and games API verification: passed.
- Unkai database counts before and after deployment were unchanged:
  4 users, 11 games, 31 decks, 3172 steps, and 1 earned achievement record.

## Deployment Backups

- Local:
  - `/Users/yunke/Documents/VSCode/Arkham/backups/two-batch-predeploy-20260728-112236-local`
- Unkai:
  - `/opt/arkham-horror-public-v2/backups/two-batch-predeploy-20260728-112245`

The Online server was not modified.

## Cards

The shared card library contains the current AVIF files under `shared/cards/`.
The macOS Companion bundle contains its own embedded copy under
`Contents/Resources/CardImages`.

## Companion

The App bundle is unsigned. On macOS, right-click the app and choose **Open**
on first launch if Gatekeeper blocks it.
