# Frontend 2026.09.24.1-ui-switch

This is a frontend-only source and runtime update. The backend, launcher, card images, music and database format are unchanged. No DMG, account data, saves or private test fixtures are included.

- Settings displays both Classic UI and Current UI; selecting the other interface reloads the page.
- Both playing tables have an explicit switch at the right of the top game toolbar. The current mobile table has a compact switch in its header.
- Switching preserves the game URL, query parameters and selected interface. Stale bookmarks cannot override the saved choice.
- The compact upper-left navigation icon stays centered inside its border without clipping its dropdown.
- Includes the previously validated 2026.09.23.4 deck-list layout improvements: aligned actions, readable metadata, long-name wrapping and responsive controls.

The classic table loads the shared switch with its styles. Updated script revision URLs avoid reusing the previous settings-only switch script.

Validation: frontend type checking, 346 unit tests, production local and online builds, and isolated browser checks at 1440, 1024 and 390 pixels. Settings switches and game switches were tested in both directions, including the old classic settings URL, preserved game IDs, stale links and icon bounds. Browser tests did not write game data. Existing LFS resources are unchanged; manifest hashes reflect the tracked Git snapshot, including normalized line endings.

This publication does not rebuild or replace the local DMG and does not deploy Kaho or Online. Use the matching frontend runtime as a whole; do not replace the database or personal data directories.
