# Frontend 2026.09.24.1-ui-switch

This is a frontend-only update to `server/source/ArkhamHorror/frontend` and `server/release/frontend-dist`. The backend, deployment tools, card images, music and database format are unchanged. No account data, saves, secrets, DMG or private test fixtures are included.

- Settings displays both Classic UI and Current UI; selecting the other interface reloads the page.
- Both playing tables have an explicit switch at the right of the top game toolbar. The current mobile table has a compact switch in its header.
- Switching preserves the game URL, query parameters and selected interface. Stale bookmarks cannot override the saved choice.
- The compact upper-left navigation icon stays centered inside its border without clipping its dropdown.
- Includes the previously validated 2026.09.23.4 deck-list layout improvements: aligned actions, readable metadata, long-name wrapping and responsive controls.

The classic table loads the shared switch with its styles. Updated script revision URLs avoid reusing the previous settings-only switch script.

Validation: frontend type checking, 346 unit tests, production local and online builds, and isolated browser checks at 1440, 1024 and 390 pixels. Settings switches and game switches were tested in both directions, including the old classic settings URL, preserved game IDs, stale links and icon bounds. Browser tests did not write game data. Existing LFS resources are unchanged; manifest hashes reflect the tracked Git snapshot, including normalized line endings.

`server/release/frontend-dist` retains the online build profile. Self-hosted packaging should rebuild the source with its existing local profile (`VITE_ONLINE_MODE=false`, `VITE_DISABLE_COMPANION=true`, `VITE_LOCAL_LAYOUT_ONLY=true`, and empty API/asset hosts).

The independently published Linux `v20260924.1` archive and its checksums are deliberately unchanged; that archive still contains frontend `2026.09.23.3-investigator-alignment`. This update does not deploy Kaho or Online or publish a new installation archive. Update the matching frontend runtime as a whole, not databases or personal data directories.
