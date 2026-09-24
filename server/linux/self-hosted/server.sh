#!/usr/bin/env bash
# Native Linux server entry. No Windows/WSL bootstrap and no automatic downloads.
set -euo pipefail
umask 077
APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
fail() { printf '[SERVER] %s\n' "$*" >&2; exit 1; }
ACTION="${1:-help}"
[ $# -eq 0 ] || shift
case "$ACTION" in
  help|--help|-h)
    printf '%s\n' 'Usage: ./server.sh check | run | status | stop | backup /absolute/path.tar.gz' \
      'Use install-service.sh for systemd. Read README.md before public deployment.'
    exit 0;;
  check|run|status|stop|backup) ;;
  *) fail "Unknown command: $ACTION";;
esac
[ "$(uname -s)" = Linux ] && [ "$(uname -m)" = x86_64 ] || fail 'Requires Linux x86-64 (amd64), not ARM64.'
[ "$(id -u)" != 0 ] || fail 'Run as a dedicated non-root service user. Use sudo only for install-service.sh.'
command -v python3 >/dev/null || fail 'Install python3 (Ubuntu 24.04).'
for tool in bash tar gzip curl getconf realpath flock; do command -v "$tool" >/dev/null || fail "Missing dependency: $tool"; done
glibc="$(getconf GNU_LIBC_VERSION | awk '{print $2}')"
printf '%s\n' 2.39 "$glibc" | sort -VC || fail 'glibc >= 2.39 required; use Ubuntu 24.04. Do not replace system libc manually.'
for file in game/bin/arkham-api game/bin/nginx game/pgsql/bin/initdb game/pgsql/bin/pg_ctl game/pgsql/bin/psql; do
  [ -x "$APP_DIR/$file" ] || fail "Missing executable: $file (extract the tar.gz on Linux)."
done
export LD_LIBRARY_PATH="$APP_DIR/game/lib:$APP_DIR/game/pgsql/lib"
for file in game/bin/arkham-api game/bin/nginx game/pgsql/bin/initdb game/pgsql/bin/postgres; do
  if ldd "$APP_DIR/$file" 2>&1 | grep -q 'not found'; then fail "Missing shared library required by $file"; fi
done
if [ "$ACTION" = check ]; then
  printf '[SERVER] Linux x86-64, glibc %s; binaries and libraries ready. No state created.\n' "$glibc"
  exit 0
fi
CONFIG="${ARKHAM_SERVER_CONFIG:-$APP_DIR/server.env}"
[ -f "$CONFIG" ] || fail "Copy server.env.example to $CONFIG and set an absolute ARKHAM_SERVER_DATA directory outside this package."
# This is an administrator-owned shell environment file, never an uploaded file.
set -a
source "$CONFIG"
set +a
: "${ARKHAM_SERVER_DATA:?Set ARKHAM_SERVER_DATA in server.env}"
[[ "$ARKHAM_SERVER_DATA" = /* ]] || fail 'Data directory must be absolute.'
ARKHAM_SERVER_DATA="$(realpath -m -- "$ARKHAM_SERVER_DATA")"
case "$ARKHAM_SERVER_DATA/" in /|/home/|/var/|/var/lib/|/tmp/|"$APP_DIR/"*) fail 'Use a dedicated data directory outside the application package.';; esac
[[ "$ARKHAM_SERVER_DATA" =~ ^/[a-zA-Z0-9_./-]+$ ]] || fail 'Use a data path containing only letters, numbers, / . _ -.'
for name in ARKHAM_PORT ARKHAM_API_PORT ARKHAM_PG_PORT; do
  port="${!name:-}"
  [[ "$port" =~ ^[0-9]{1,5}$ ]] && [ "$port" -ge 1024 ] && [ "$port" -le 65535 ] || fail "Invalid unprivileged TCP port: $name"
done
[ "$ARKHAM_PORT" != "$ARKHAM_API_PORT" ] && [ "$ARKHAM_PORT" != "$ARKHAM_PG_PORT" ] && [ "$ARKHAM_API_PORT" != "$ARKHAM_PG_PORT" ] || fail 'The three ports must be different.'
export ARKHAM_SERVER_DATA ARKHAM_NO_BROWSER=1 ARKHAM_SKIP_LAN=1 ARKHAM_HEADLESS=1 HOST=127.0.0.1
export ASSET_HOST='' ARKHAM_CUSTOM_CARD_ART_DIR="$ARKHAM_SERVER_DATA/custom-card-art"
if [ "$ACTION" = run ]; then
  # Do not pick a different port or hijack another instance on conflicts.
  python3 - "$ARKHAM_PORT" "$ARKHAM_API_PORT" "$ARKHAM_PG_PORT" <<'PY'
import socket, sys
held=[]
for port in map(int,sys.argv[1:]):
    s=socket.socket()
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try: s.bind(('127.0.0.1',port))
    except OSError: raise SystemExit(f'[SERVER] Port {port} is in use. Stop the correct old instance or choose new ports.')
    held.append(s)
PY
fi
if [ "$ACTION" = run ]; then
  mkdir -p "$ARKHAM_SERVER_DATA" "$ARKHAM_SERVER_DATA/run" "$ARKHAM_SERVER_DATA/backups" "$ARKHAM_SERVER_DATA/secrets"
  chmod 700 "$ARKHAM_SERVER_DATA" "$ARKHAM_SERVER_DATA/secrets"
  # Existing databases without matching secrets must NEVER receive new keys.
  python3 "$APP_DIR/tools/server-state.py" init "$ARKHAM_SERVER_DATA"
else
  [ -s "$ARKHAM_SERVER_DATA/secrets/jwt-secret" ] && [ -s "$ARKHAM_SERVER_DATA/secrets/pg-password" ] || fail 'No initialized server data/secrets found.'
fi
export JWT_SECRET="$(<"$ARKHAM_SERVER_DATA/secrets/jwt-secret")"
export PGPASSWORD="$(<"$ARKHAM_SERVER_DATA/secrets/pg-password")"
export ARKHAM_PG_PASSWORD_FILE="$ARKHAM_SERVER_DATA/secrets/pg-password"
key="$APP_DIR/game/config/client_session_key.aes"
if [ -L "$key" ]; then
  [ "$(readlink -- "$key")" = "$ARKHAM_SERVER_DATA/secrets/client_session_key.aes" ] || fail 'This application folder is already linked to another data directory.'
elif [ -e "$key" ]; then
  fail 'Unexpected existing session key in application directory. Back it up and investigate before deployment.'
elif [ "$ACTION" = run ]; then
  ln -s -- "$ARKHAM_SERVER_DATA/secrets/client_session_key.aes" "$key"
fi
case "$ACTION" in
  run) exec bash "$APP_DIR/game/start.sh";;
  status) exec bash "$APP_DIR/game/start.sh" --status;;
  stop) exec bash "$APP_DIR/game/start.sh" --stop;;
  backup)
    [ $# -eq 1 ] && [[ "$1" = /*.tar.gz ]] || fail 'Specify a new absolute .tar.gz backup filename.'
    # Full state copy must be cold; this command never silently stops a live game.
    python3 "$APP_DIR/tools/server-state.py" backup "$ARKHAM_SERVER_DATA" "$1";;
esac
