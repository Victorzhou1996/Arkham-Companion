# 2026.09.21 release validation

## Delivered scope

- Chinese custom-card library/editor/import/export and common rule controls. Serialized rule identifiers remain unchanged; advanced raw engine identifiers and user-written text are not automatically translated.
- Shared custom-card editor with classic styling, plus actual classic game art, custom abilities and mobile debug picker support.
- Archive-style current homepage and shared navigation across current pages, with a matching independent Build header. Classic UI retains its established appearance.
- Upstream through `ffb6d5e80b5cfdc88d45fff59d38744454347ccf`, 51 first-parent commits. New native Mac arm64 and Linux amd64 rule engines.
- Existing save modes, achievements, manager, starter decks, Chinese images, portraits, deck upgrades and player data preserved.

## Evidence

- Native rules: 1,638 Hspec examples, zero failures.
- Frontend: 330 tests, type check and local/server production builds passed.
- Fresh/restored databases, all five save modes with achievements on/off, six bounded campaign openings and custom-card account isolation/ability execution passed.
- Final DMG: fresh installation and restored-player-data tests passed, including distinct launcher/manager icons, portable paths and custom-art backup/restore.
- Kaho: real authenticated current/classic browser tests at 1440px and 390px passed creation, export/import, art, ability clicks and debug picker. Temporary QA account/game removed.
- Server runtime manifest: 5,164 files, no unresolved LFS pointers; full source manifest: 10,157 files.
- These tests are not full playthroughs of every campaign. Intel macOS, Apple notarization and physical-device QA are not claimed.

## Artifacts and deployment

- Local DMG: `Arkham-Horror-Local-App-macOS-arm64-20260921-custom-cards-final.dmg`.
- DMG SHA-256: `a821e5199d9438a13f0cb9ede6f8ce1d5dd0a92b8848d55bcb4301bf4ce35095`.
- Packaged portable Mac backend SHA-256: `ab8ec9701f8300d1dda22097faa8f9042e233a8e7c9189e1b116606b5dac30cc`.
- Linux backend SHA-256: `92158229244406c64c34723771e4c7bba76fe644a255f820926d5b9910dfcc72`.
- Kaho frontend index SHA-256: `3291297add84392306b1a3d4948183cc2a59613a6d299c3a42c9b8d4fdeeff32`.
- Kaho backup: `/var/backups/arkham/custom-cards-20260921-124144`. Existing-player fingerprints were unchanged; the expected phase-preference migration was checked separately.
- Two guarded pre-release attempts rolled back before the final successful release because migration-ledger comparison needed correction. No player data was intentionally removed or replaced; original-player fingerprints passed after final migration.
- Online was not modified. The DMG is a local artifact, not a GitHub Release attachment.

Windows packaging must use the full updated sources and a platform-native backend build, preserving its existing launcher, manager and user database. See the platform `RELEASE-20260921.md` for exact build profiles and migration requirements.
