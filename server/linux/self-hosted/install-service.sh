#!/usr/bin/env bash
# New installation only. Does not change nginx/firewall or install apt packages.
set -euo pipefail
umask 077
APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SERVICE=arkham-horror-server
SERVICE_USER=arkham-server
DATA=/var/lib/arkham-horror-server
CONFIG=/etc/arkham-horror-server
DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift;;
    *) echo 'Usage: sudo bash install-service.sh [--dry-run]' >&2; exit 1;;
  esac
done
[[ "$APP_DIR" =~ ^/[a-zA-Z0-9_./\ -]+$ ]] || { echo 'Use an application path without shell/systemd special characters.' >&2; exit 1; }
unit() {
  printf '%s\n' '[Unit]' 'Description=Arkham Horror native server' 'After=network.target' 'StartLimitIntervalSec=300' 'StartLimitBurst=3' '' \
    '[Service]' 'Type=simple' "User=$SERVICE_USER" "Group=$SERVICE_USER" "WorkingDirectory=$APP_DIR" \
    "Environment=ARKHAM_SERVER_CONFIG=$CONFIG/server.env" "ExecStart=\"$APP_DIR/server.sh\" run" \
    'Restart=on-failure' 'RestartSec=10' 'KillMode=mixed' 'TimeoutStopSec=180' 'UMask=0077' \
    'NoNewPrivileges=true' 'PrivateTmp=true' 'ProtectSystem=full' '' '[Install]' 'WantedBy=multi-user.target'
}
if [ "$DRY_RUN" = 1 ]; then unit; exit 0; fi
[ "$(id -u)" = 0 ] || { echo 'Run installer with sudo; game itself runs as a dedicated unprivileged user.' >&2; exit 1; }
[ "$(uname -m)" = x86_64 ] || { echo 'Requires x86-64.' >&2; exit 1; }
[ "$(ps -p 1 -o comm= | tr -d ' ')" = systemd ] || { echo 'systemd is not PID 1. Use server.sh run for a manual supervisor.' >&2; exit 1; }
[[ "$APP_DIR" = /opt/arkham-releases/ArkhamHorror-Server-Linux-amd64-* ]] || { echo 'Extract the release under /opt/arkham-releases as documented before installing.' >&2; exit 1; }
for path in "$CONFIG" "$DATA" "/etc/systemd/system/$SERVICE.service"; do
  [ ! -e "$path" ] || { echo "Existing installation at $path: stop and follow UPDATE.md; this installer does not overwrite data/config." >&2; exit 1; }
done
! id "$SERVICE_USER" >/dev/null 2>&1 || { echo 'Service account already exists; audit it before manual installation.' >&2; exit 1; }
for port in 4000 4002 5433; do
  if ss -H -ltn "sport = :$port" | grep -q .; then echo "Port $port is occupied. Review README.md for manual custom-port setup." >&2; exit 1; fi
done
command -v python3 >/dev/null && command -v curl >/dev/null || { echo 'Install python3 and curl first (see README.md).' >&2; exit 1; }
useradd --system --user-group --home-dir "$DATA" --shell /usr/sbin/nologin "$SERVICE_USER"
install -d -m 700 -o "$SERVICE_USER" -g "$SERVICE_USER" "$DATA" "$CONFIG"
install -m 600 -o "$SERVICE_USER" -g "$SERVICE_USER" "$APP_DIR/server.env.example" "$CONFIG/server.env"
# App directory belongs exclusively to this installation. No data are copied in.
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
runuser -u "$SERVICE_USER" -- "$APP_DIR/server.sh" check
unit > "/etc/systemd/system/$SERVICE.service"
chmod 644 "/etc/systemd/system/$SERVICE.service"
systemd-analyze verify "/etc/systemd/system/$SERVICE.service"
systemctl daemon-reload
systemctl enable --now "$SERVICE.service"
for attempt in $(seq 1 90); do
  if curl -fsS --max-time 2 http://127.0.0.1:4000/health >/dev/null; then
    echo '[SERVER] Ready at http://127.0.0.1:4000; configure HTTPS reverse proxy before public use.'
    exit 0
  fi
  sleep 1
done
echo '[SERVER] Health check failed. Inspect journalctl -u arkham-horror-server; no existing data were overwritten.' >&2
exit 1
