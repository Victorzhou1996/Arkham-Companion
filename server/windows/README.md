# Windows local package overrides

These files are the Windows/WSL package-specific layer used by the portable local distribution. They are intentionally separate from the cross-platform server source.

- `start.sh` runs the bundled PostgreSQL, API, and nginx processes; repairs MIME/static-resource routing; maintains Windows-to-WSL LAN forwarding metadata; and exposes maintenance commands used by the manager.
- `arkham-manager.ps1` is the external system administrator UI. It owns service control, whole-database backup/restore, account administration, frontend repair, diagnostics, port configuration, and LAN repair.
- `管理工具.bat` launches the manager.
- `Configure-ArkhamHorror-LAN.ps1` maintains the Windows firewall/port-proxy or mirrored-network rule so other devices use the Windows `192.168.x.x` address instead of the private WSL `172.x.x.x` address.

The authenticated in-browser `/local-management` page deliberately exposes only current-user operations and read-only status. It must not call these system-level maintenance commands.
