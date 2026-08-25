# Windows local package overrides

These files are the Windows/WSL package-specific layer used by the portable local distribution. They are intentionally separate from the cross-platform server source.

- `start.sh` runs the bundled PostgreSQL, API, and nginx processes; repairs MIME/static-resource routing; maintains Windows-to-WSL LAN forwarding metadata; and exposes maintenance commands used by the manager.
- `arkham-manager.ps1` is the external system administrator UI. It owns service control, whole-database backup/restore, account administration, frontend repair, diagnostics, port configuration, and LAN repair.
- `管理工具.bat` launches the manager.
- `Configure-ArkhamHorror-LAN.ps1` maintains the Windows firewall/port-proxy or mirrored-network rule so other devices use the Windows `192.168.x.x` address instead of the private WSL `172.x.x.x` address.

The authenticated in-browser `/local-management` page deliberately exposes only current-user operations and read-only status. It must not call these system-level maintenance commands.

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
