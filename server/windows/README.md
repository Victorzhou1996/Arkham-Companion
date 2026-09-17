# Windows local package overrides

These files are the Windows/WSL package-specific layer used by the portable local distribution. They are intentionally separate from the cross-platform server source.

- `start.sh` runs the bundled PostgreSQL, API, and nginx processes; repairs MIME/static-resource routing; maintains Windows-to-WSL LAN forwarding metadata; and exposes maintenance commands used by the manager.
- `arkham-manager.ps1` is the external system administrator UI. It owns service control, whole-database backup/restore, account administration, frontend repair, diagnostics, port configuration, and LAN repair.
- `Windows用户双击我.bat` is the sole root launcher for the manager. `support/Start-ArkhamHorror.bat` is its helper, not an additional user entry.
- `Configure-ArkhamHorror-LAN.ps1` maintains the Windows firewall/port-proxy or mirrored-network rule so other devices use the Windows `192.168.x.x` address instead of the private WSL `172.x.x.x` address.

The authenticated in-browser `/local-management` page deliberately exposes only current-user operations and read-only status. It must not call these system-level maintenance commands.

## Latest frontend source: 2026-09-17

Use the [September 17 handoff](../../docs/release-source-20260917/README.md)
for the card interaction fixes and bundled portraits. Rebuild the frontend in
local mode; `server/release/frontend-dist` is an older online-mode snapshot,
not this update. This increment changes no Haskell source or Windows launcher.
The portable layer below remains the packaging baseline.

## Current portable layer: 2026-09-15 / Windows v20260915.5

This folder now matches the verified clean Windows release's scripts, including all 44 manager functions and the NUL/ANSI error-message repair. The historical notes below are not instructions to re-add already implemented functions.

Assembly mapping: put `arkham-manager.ps1`, `Configure-ArkhamHorror-LAN.ps1`, and `Windows用户双击我.bat` at the package root; retain `support/` beside them; copy `start.sh` to `game/start.sh` and `tools/*` to `game/tools/`. Compile `../source/ArkhamHorror/frontend` in `VITE_ONLINE_MODE=false` with same-origin API/assets and place its output in `game/frontend/dist`. Use the matching platform runtime; source in this folder is not a standalone game distribution.

`tools/local_layout_service.py` authenticates against the running local API and stores per-account panel sizes separately from game saves. Its `layout_preferences.py` companion uses only the Python standard library; do not substitute the aiohttp-specific online sidecar copy. The launcher owns this private Unix-socket helper's lifecycle. Existing WSL saves and the old backup format remain intact. New clean packages contain only setup.sql in game/data, not databases, logs, keys or generated configuration. SelfTest must run on an assembled copy, not this source-only folder.

See [the current handoff](../../docs/release-source-20260915/README.md) for release hashes, verification limits and Mac migration.

## 2026-08-25 source snapshot

Use `../source/ArkhamHorror` as the backend and frontend source for the next
Windows package. The ready-to-serve game frontend is already available under
`../release/frontend-dist`; rebuild the backend from source so the Windows package
also contains the current rule and content updates. Keep this Windows override
directory when assembling the package.

## Windows Codex: add the save-history viewer

The Linux viewer in `../linux/save_history_viewer.py` is platform-neutral and can be reused by the Windows package. This is a manager-only, read-only feature and does not require a Haskell rebuild.

1. Copy `server/linux/save_history_viewer.py` to `game/tools/save_history_viewer.py` in the Windows package.
2. Add `Show-SaveHistory` to `arkham-manager.ps1`:
   - use `System.Windows.Forms.OpenFileDialog` with `JSON/Gzip (*.json;*.json.gz;*.gz)`;
   - resolve WSL with the existing `Get-WslDistroName`;
   - convert the selected file and package paths with `Convert-ToWslPath`;
   - run `python3 game/tools/save_history_viewer.py <save> game` through `wsl.exe` as user `arkham`;
   - convert the returned `/mnt/<drive>/...html` path back to Windows and open it with `Start-Process`.
3. Add a `打开存档操作记录` button in the right column at `x=410, y=384`. Keep it separate from backup and restore because it must never write to the database.
4. Extend `-SelfTest` to check that `game/tools/save_history_viewer.py` exists and that `python3 ... --self-test` returns `OK` inside WSL.

Required checks before packaging:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\arkham-manager.ps1 -SelfTest
```

Also test one normal JSON export, one gzip-compressed export, and one copied file while the Arkham service is stopped. The last case confirms that the portable fallback does not depend on the live database.
