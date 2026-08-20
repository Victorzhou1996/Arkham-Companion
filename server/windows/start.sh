#!/usr/bin/env bash
set -euo pipefail

# 鈹€鈹€ Root check: PostgreSQL must not run as root 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
# Windows: Start-ArkhamHorror.bat already ensures a non-root user through -u arkham
# macOS/Linux: users normally run as a regular user; this is only a safety fallback
if [ "$(id -u)" = "0" ]; then
    echo "[ARKHAM] Error: running as root is not allowed." >&2
    echo "         PostgreSQL refuses to run initdb/pg_ctl as root." >&2
    if grep -qi microsoft /proc/version 2>/dev/null; then
        echo "         Please launch via Start-ArkhamHorror.bat (it runs automatically as user arkham)," >&2
        echo "         or specify the user manually: su arkham -c 'bash start.sh'" >&2
    else
        echo "         Please run as a regular user: bash start.sh" >&2
    fi
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT_CONFIG_FILE="$SCRIPT_DIR/config/ports.env"
LAN_INFO_FILE="$SCRIPT_DIR/config/lan.env"
DATA_DIR="$SCRIPT_DIR/data"
NGINX_PID="$DATA_DIR/nginx.pid"
NGINX_LOG_DIR="$DATA_DIR"
API_PID_FILE="$DATA_DIR/arkham-api.pid"
PG_LOG="$DATA_DIR/pg.log"
RUNTIME_INFO_FILE="$SCRIPT_DIR/frontend/dist/local-runtime.json"

NGINX_PORT="${ARKHAM_PORT:-4000}"
API_PORT="${ARKHAM_API_PORT:-4002}"
PG_PORT="${ARKHAM_PG_PORT:-5433}"
PG_USER="arkham_user"
PG_DB="arkham-horror-backend"

load_port_config() {
    [ -f "$PORT_CONFIG_FILE" ] || return 0
    local line key value
    while IFS= read -r line || [ -n "$line" ]; do
        line="${line%$'\r'}"
        case "$line" in
            ARKHAM_PORT=*|ARKHAM_API_PORT=*|ARKHAM_PG_PORT=*)
                key="${line%%=*}"
                value="${line#*=}"
                case "$key" in
                    ARKHAM_PORT) NGINX_PORT="$value" ;;
                    ARKHAM_API_PORT) API_PORT="$value" ;;
                    ARKHAM_PG_PORT) PG_PORT="$value" ;;
                esac
                ;;
        esac
    done < "$PORT_CONFIG_FILE"
}

is_valid_port_number() {
    [[ "${1:-}" =~ ^[0-9]+$ ]] && [ "$1" -ge 1 ] && [ "$1" -le 65535 ]
}

can_bind_tcp_port() {
    local port="$1"
    local python_cmd=""
    for python_cmd in python3 python; do
        command -v "$python_cmd" >/dev/null 2>&1 || continue
        "$python_cmd" - "$port" >/dev/null 2>&1 <<'PY'
import socket
import sys

port = int(sys.argv[1])
for host in ("127.0.0.1", "0.0.0.0"):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind((host, port))
    except OSError:
        sys.exit(1)
    finally:
        sock.close()
sys.exit(0)
PY
        return $?
    done
    return 0
}

is_tcp_port_listening_early() {
    local port="$1"
    if command -v ss >/dev/null 2>&1; then
        ss -tln 2>/dev/null | grep -q ":${port} " && return 0
    fi
    if command -v lsof >/dev/null 2>&1; then
        lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 && return 0
    fi
    if command -v fuser >/dev/null 2>&1; then
        fuser -n tcp "$port" >/dev/null 2>&1 && return 0
    fi
    can_bind_tcp_port "$port" || return 0
    return 1
}

pick_frontend_port() {
    local candidate
    for candidate in $(seq 4000 65535); do
        if [ "$candidate" != "$API_PORT" ] && [ "$candidate" != "$PG_PORT" ] && ! is_tcp_port_listening_early "$candidate"; then
            printf '%s' "$candidate"
            return 0
        fi
    done
    printf '%s' 4000
}

save_port_config() {
    local tmp_file="${PORT_CONFIG_FILE}.tmp.$$"
    mkdir -p "$(dirname "$PORT_CONFIG_FILE")" 2>/dev/null || true
    if {
        printf '# Arkham Horror LCG local ports\n'
        printf 'ARKHAM_PORT=%s\n' "$NGINX_PORT"
        printf 'ARKHAM_API_PORT=%s\n' "$API_PORT"
        printf 'ARKHAM_PG_PORT=%s\n' "$PG_PORT"
    } > "$tmp_file" && mv "$tmp_file" "$PORT_CONFIG_FILE" 2>/dev/null; then
        printf '[ARKHAM] Port config updated: ARKHAM_PORT=%s\n' "$NGINX_PORT" >&2
    else
        rm -f "$tmp_file" 2>/dev/null || true
        printf '[ARKHAM] Unable to write %s; using ARKHAM_PORT=%s for this launch only.\n' "$PORT_CONFIG_FILE" "$NGINX_PORT" >&2
    fi
}

normalize_port_config() {
    local old_port=""
    local should_save=0

    if ! is_valid_port_number "$API_PORT"; then
        printf '[ARKHAM] Invalid API port %s; using 4002.\n' "$API_PORT" >&2
        API_PORT=4002
        should_save=1
    fi
    if ! is_valid_port_number "$PG_PORT"; then
        printf '[ARKHAM] Invalid PostgreSQL port %s; using 5433.\n' "$PG_PORT" >&2
        PG_PORT=5433
        should_save=1
    fi
    if [ "$API_PORT" = "$PG_PORT" ]; then
        old_port="$API_PORT"
        API_PORT=4002
        [ "$API_PORT" = "$PG_PORT" ] && API_PORT=4003
        printf '[ARKHAM] API port %s conflicts with PostgreSQL; using %s.\n' "$old_port" "$API_PORT" >&2
        should_save=1
    fi
    if ! is_valid_port_number "$NGINX_PORT"; then
        old_port="$NGINX_PORT"
        NGINX_PORT="$(pick_frontend_port)"
        printf '[ARKHAM] Invalid frontend port %s; using %s.\n' "$old_port" "$NGINX_PORT" >&2
        should_save=1
    fi
    if [ "$NGINX_PORT" = "5433" ] || [ "$NGINX_PORT" = "$API_PORT" ] || [ "$NGINX_PORT" = "$PG_PORT" ]; then
        old_port="$NGINX_PORT"
        NGINX_PORT="$(pick_frontend_port)"
        printf '[ARKHAM] Frontend port %s conflicts with an internal service; using %s.\n' "$old_port" "$NGINX_PORT" >&2
        should_save=1
    fi
    if [ "$should_save" = "1" ]; then
        save_port_config
    fi
    return 0
}

load_port_config
normalize_port_config

# Runtime pgdata directory: keep it under the OS user data directory to avoid WSL/NTFS permission issues
# macOS: ~/Library/Application Support/ArkhamHorrorLocal/pgdata/
# Linux/WSL: ~/.local/share/ArkhamHorrorLocal/pgdata/
case "$(uname -s)" in
    Darwin) PGDATA_OS="$HOME/Library/Application Support/ArkhamHorrorLocal/pgdata" ;;
    Linux)  PGDATA_OS="$HOME/.local/share/ArkhamHorrorLocal/pgdata" ;;
esac
PGDATA_OS_PARENT="$(dirname "$PGDATA_OS")"
PGDATA_LOCAL="$DATA_DIR/pgdata"        # Legacy physical backup location from older builds
BACKUP_DIR="$SCRIPT_DIR/../backup"
PG_DUMP_FILE="$BACKUP_DIR/latest.dump"
PG_DUMP_PREV="$BACKUP_DIR/previous.dump"
PG_DUMP_TMP="$BACKUP_DIR/latest.dump.tmp"
PG_DUMP_LOG="$DATA_DIR/pg_dump.log"
PG_RESTORE_LOG="$DATA_DIR/pg_restore.log"
VERSION_FILE="$PGDATA_OS_PARENT/pgdata_version"
VERSION_FILE_LOCAL="$DATA_DIR/pgdata_version"
PG_DATA="$PGDATA_OS"                    # Actual pgdata path used at runtime
START_LOCK_DIR="$PGDATA_OS_PARENT/start.lock"
START_LOCK_PID="$START_LOCK_DIR/pid"
START_LOCK_TS="$START_LOCK_DIR/timestamp"

# Unix domain socket directory:
# - macOS: distribution paths can be long; a Unix socket path longer than 103 bytes can make PostgreSQL fail to start
# - WSL/NTFS (DrvFS): Unix sockets are not supported, so the socket must live on the native Linux filesystem
# Detection rule: paths starting with /mnt/ are usually Windows drive mounts (DrvFS)
refresh_pg_socket_dir() {
    if [ "$(uname -s)" = "Darwin" ]; then
        PG_SOCKET_DIR="/tmp/arkham-pg-${PG_PORT}"
        mkdir -p "$PG_SOCKET_DIR" 2>/dev/null || PG_SOCKET_DIR="/tmp"
    elif [[ "$DATA_DIR" == /mnt/* ]] && grep -qi microsoft /proc/version 2>/dev/null; then
        PG_SOCKET_DIR="/tmp/arkham-pg-${PG_PORT}"
        mkdir -p "$PG_SOCKET_DIR" 2>/dev/null || PG_SOCKET_DIR="/tmp"
    else
        PG_SOCKET_DIR="$DATA_DIR"
    fi
}
PG_SOCKET_DIR=""
refresh_pg_socket_dir

GREEN=$'\033[0;32m'
YELLOW=$'\033[0;33m'
RED=$'\033[0;31m'
CYAN=$'\033[0;36m'
MAGENTA=$'\033[0;35m'
BOLD=$'\033[1m'
RESET=$'\033[0m'

info()  { printf '%s[ARKHAM]%s %s\n' "$GREEN" "$RESET" "$*"; }
warn()  { printf '%s[ARKHAM]%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
die() {
    local code="$1" msg="$2" log="${3:-}"
    printf '%s[ARKHAM]%s [Error Code %s] %s\n' "$RED" "$RESET" "$code" "$msg" >&2
    if [ -n "$log" ] && [ -f "$log" ] && [ -s "$log" ]; then
        warn "Last 20 log lines:"
        tail -20 "$log" 2>/dev/null | while IFS= read -r line; do
            echo "  $line" >&2
        done
        echo "Full log: $log" >&2
    fi
    exit "$code"
}

# Open a URL in the default browser (cross-platform, silently ignore failures)
open_browser() {
    local url="$1"
    if grep -qi microsoft /proc/version 2>/dev/null; then
        # WSL: use /init to invoke cmd.exe. This bypasses binfmt_misc interop
        # which is often unavailable for non-default users (e.g. arkham).
        # /init is always present and can always call Windows executables.
        /init /mnt/c/Windows/System32/cmd.exe /c start "" "$url" >/dev/null 2>&1 || true
    elif [ "$(uname -s)" = "Darwin" ]; then
        open "$url" >/dev/null 2>&1 || true
    elif command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$url" >/dev/null 2>&1 || true
    fi
}

get_primary_url() {
    # Use the numeric loopback address for the Windows browser. Some Edge
    # installations keep a broken localhost cache even after the local package
    # has been replaced, while 127.0.0.1 is treated as a fresh origin.
    echo "http://127.0.0.1:${NGINX_PORT}"
}

get_frontend_cache_token() {
    local index_file="$SCRIPT_DIR/frontend/dist/index.html"
    if command -v sha256sum >/dev/null 2>&1 && [ -f "$index_file" ]; then
        sha256sum "$index_file" | awk '{ print substr($1, 1, 16) }'
    elif command -v cksum >/dev/null 2>&1 && [ -f "$index_file" ]; then
        cksum "$index_file" | awk '{ print $1 }'
    else
        printf 'local'
    fi
}

get_lan_info_value() {
    local wanted="$1"
    [ -f "$LAN_INFO_FILE" ] || return 1
    awk -F= -v wanted="$wanted" '
        $1 == wanted {
            sub(/^[^=]*=/, "")
            sub(/\r$/, "")
            print
            exit
        }
    ' "$LAN_INFO_FILE"
}

get_wsl_ipv4() {
    local candidate=""
    if command -v ip >/dev/null 2>&1; then
        candidate="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{ for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit } }')"
    fi
    if [ -z "$candidate" ]; then
        candidate="$(hostname -I 2>/dev/null | awk '{ for (i = 1; i <= NF; i++) if ($i !~ /^127\./) { print $i; exit } }')"
    fi
    case "$candidate" in
        *.*.*.*) printf '%s\n' "$candidate" ;;
        *) return 1 ;;
    esac
}

get_windows_lan_ipv4() {
    local ready="" configured_port="" configured_wsl_ip="" current_wsl_ip="" candidate=""
    ready="$(get_lan_info_value ARKHAM_LAN_READY 2>/dev/null || true)"
    configured_port="$(get_lan_info_value ARKHAM_LAN_PORT 2>/dev/null || true)"
    configured_wsl_ip="$(get_lan_info_value ARKHAM_WSL_IP 2>/dev/null || true)"
    current_wsl_ip="$(get_wsl_ipv4 2>/dev/null || true)"
    candidate="$(get_lan_info_value ARKHAM_LAN_IP 2>/dev/null || true)"
    [ "$ready" = "1" ] || return 1
    [ "$configured_port" = "$NGINX_PORT" ] || return 1
    [ -n "$current_wsl_ip" ] && [ "$configured_wsl_ip" = "$current_wsl_ip" ] || return 1
    case "$candidate" in
        *.*.*.*) printf '%s\n' "$candidate" ;;
        *) return 1 ;;
    esac
}

configure_windows_lan_access() {
    is_wsl || return 0

    local helper="$SCRIPT_DIR/../Configure-ArkhamHorror-LAN.ps1"
    local powershell_path="/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
    local wsl_ip="" helper_windows="" info_windows="" output="" lan_ip="" mode=""
    if [ ! -f "$helper" ]; then
        warn "Windows LAN helper is missing; localhost access remains available."
        return 1
    fi
    if [ ! -x "$powershell_path" ] || ! command -v wslpath >/dev/null 2>&1; then
        warn "Windows PowerShell interop is unavailable; localhost access remains available."
        return 1
    fi

    wsl_ip="$(get_wsl_ipv4 2>/dev/null || true)"
    if [ -z "$wsl_ip" ]; then
        warn "Could not determine the WSL IPv4 address; localhost access remains available."
        return 1
    fi

    ensure_dir "$(dirname "$LAN_INFO_FILE")"
    helper_windows="$(wslpath -w "$helper" 2>/dev/null || true)"
    info_windows="$(wslpath -w "$LAN_INFO_FILE" 2>/dev/null || true)"
    if [ -z "$helper_windows" ] || [ -z "$info_windows" ]; then
        warn "Could not translate the Windows package path; localhost access remains available."
        return 1
    fi

    info "Configuring Windows LAN access (administrator permission may be requested once) ..."
    if output="$(/init "$powershell_path" -NoProfile -ExecutionPolicy Bypass \
        -File "$helper_windows" -Port "$NGINX_PORT" -WslIp "$wsl_ip" \
        -InfoFile "$info_windows" 2>&1)"; then
        lan_ip="$(get_windows_lan_ipv4 2>/dev/null || true)"
        mode="$(get_lan_info_value ARKHAM_LAN_MODE 2>/dev/null || true)"
        if [ -n "$lan_ip" ]; then
            info "Windows LAN access ready (${mode:-unknown}: ${lan_ip}:${NGINX_PORT})"
        fi
        return 0
    fi

    warn "Windows LAN access could not be configured; localhost still works."
    [ -z "$output" ] || printf '%s\n' "$output" >&2
    return 1
}

get_local_ipv4() {
    local candidate=""
    case "$(uname -s)" in
        Darwin)
            local iface=""
            iface="$(route -n get default 2>/dev/null | awk '/interface: / { print $2; exit }')"
            if [ -n "$iface" ] && command -v ipconfig >/dev/null 2>&1; then
                candidate="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
            fi
            if [ -z "$candidate" ] && command -v ifconfig >/dev/null 2>&1; then
                candidate="$(ifconfig 2>/dev/null | awk '
                    /^[a-z0-9]/ { iface=$1; sub(":", "", iface) }
                    /inet / && $2 != "127.0.0.1" {
                        if (iface !~ /^(lo|utun|awdl|llw|bridge)/) { print $2; exit }
                    }')"
            fi
            ;;
        Linux)
            if grep -qi microsoft /proc/version 2>/dev/null; then
                # WSL2 NAT addresses (usually 172.x) are not reachable from other
                # devices. Only advertise the Windows LAN address after the
                # Windows-side firewall/port-proxy helper confirms it is ready.
                candidate="$(get_windows_lan_ipv4 2>/dev/null || true)"
            elif command -v ip >/dev/null 2>&1; then
                candidate="$(ip -4 route get 1 2>/dev/null | awk '{ for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit } }')"
            fi
            if [ -z "$candidate" ] && ! grep -qi microsoft /proc/version 2>/dev/null; then
                candidate="$(hostname -I 2>/dev/null | awk '{ for (i = 1; i <= NF; i++) if ($i !~ /^127\./) { print $i; exit } }')"
            fi
            ;;
    esac
    printf '%s\n' "$candidate"
}

get_fallback_url() {
    local ip=""
    ip="$(get_local_ipv4)"
    [ -n "$ip" ] || return 1
    printf 'http://%s:%s\n' "$ip" "$NGINX_PORT"
}

json_escape() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

write_runtime_info() {
    local package_version local_url lan_url lan_json server_commit generated_at
    local pg_state=false api_state=false nginx_state=false tmp_file
    package_version="$(basename "$(dirname "$SCRIPT_DIR")")"
    local_url="$(get_primary_url)"
    lan_url="$(get_fallback_url 2>/dev/null || true)"
    server_commit=""
    if [ -f "$SCRIPT_DIR/../PACKAGE-INFO.txt" ]; then
        server_commit="$(awk -F': *' 'tolower($1) ~ /server commit/ { print $2; exit }' "$SCRIPT_DIR/../PACKAGE-INFO.txt" | tr -d '\r' || true)"
    fi
    generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    is_pg_running && pg_state=true
    is_api_running && api_state=true
    is_nginx_running && nginx_state=true
    if [ -n "$lan_url" ]; then
        lan_json="\"$(json_escape "$lan_url")\""
    else
        lan_json="null"
    fi
    tmp_file="${RUNTIME_INFO_FILE}.tmp.$$"
    {
        printf '{\n'
        printf '  "packageVersion": "%s",\n' "$(json_escape "$package_version")"
        printf '  "serverCommit": "%s",\n' "$(json_escape "$server_commit")"
        printf '  "generatedAt": "%s",\n' "$generated_at"
        printf '  "localUrl": "%s",\n' "$(json_escape "$local_url")"
        printf '  "lanUrl": %s,\n' "$lan_json"
        printf '  "frontendPort": %s,\n' "$NGINX_PORT"
        printf '  "apiPort": %s,\n' "$API_PORT"
        printf '  "services": {"postgresql": %s, "api": %s, "nginx": %s}\n' "$pg_state" "$api_state" "$nginx_state"
        printf '}\n'
    } > "$tmp_file" && mv "$tmp_file" "$RUNTIME_INFO_FILE"
}

is_wsl() {
    grep -qi microsoft /proc/version 2>/dev/null
}

can_host_reach_localhost() {
    # Test whether the host browser can reach 127.0.0.1:<NGINX_PORT>.
    # On WSL, use /init to call Windows-side curl.exe 鈥?this tests the actual
    # WSL2 localhost forwarding path from the Windows network stack.
    # /init bypasses binfmt_misc interop (which is often missing for non-default
    # users) and correctly propagates exit codes.
    # curl.exe is guaranteed present on Windows 10 1803+; WSL2 requires 1903+.
    if is_wsl; then
        /init /mnt/c/Windows/System32/curl.exe -sI --max-time 3 \
            "http://127.0.0.1:${NGINX_PORT}" >/dev/null 2>&1 && return 0 || return 1
    fi
    return 0
}

get_browser_url() {
    local browser_base cache_token
    if can_host_reach_localhost; then
        browser_base="$(get_primary_url)"
    else
        local fallback
        fallback="$(get_fallback_url || true)"
        if [ -n "$fallback" ]; then
            browser_base="$fallback"
        else
            browser_base="$(get_primary_url)"
        fi
    fi
    cache_token="$(get_frontend_cache_token)"
    printf '%s/?arkham-local=%s\n' "$browser_base" "$cache_token"
}

print_access_urls() {
    local primary fallback
    primary="$(get_primary_url)"
    printf '  %-14s %s%s%s\n' "URL" "$GREEN" "$primary" "$RESET"
    fallback="$(get_fallback_url || true)"
    if [ -n "$fallback" ] && [ "$fallback" != "$primary" ]; then
        printf '  %-14s %s%s%s\n' "LAN URL" "$GREEN" "$fallback" "$RESET"
    fi
}

warn_localhost_fallback_if_needed() {
    can_host_reach_localhost && return 0
    local fallback
    fallback="$(get_fallback_url || true)"
    [ -n "$fallback" ] || return 0
    warn "127.0.0.1:${NGINX_PORT} is not reachable from this host; opening fallback URL instead: ${fallback}"
}

api_health_ready() {
    local status_code=""
    if command -v curl >/dev/null 2>&1; then
        status_code="$(curl --noproxy '*' -sS -m 2 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${API_PORT}/health" 2>/dev/null || true)"
        [ "$status_code" = "200" ] && return 0
    fi

    if { exec 3<>"/dev/tcp/127.0.0.1/${API_PORT}"; } 2>/dev/null; then
        printf 'GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n' >&3 || {
            exec 3>&- 3<&- 2>/dev/null || true
            return 1
        }
        if timeout 2 cat <&3 2>/dev/null | head -1 | grep -q ' 200 '; then
            exec 3>&- 3<&- 2>/dev/null || true
            return 0
        fi
        exec 3>&- 3<&- 2>/dev/null || true
    fi

    return 1
}

http_head_metadata() {
    local resource_path="$1"
    local headers=""
    local status=""
    local content_type=""

    if command -v curl >/dev/null 2>&1; then
        headers="$(curl --noproxy '*' -sS -I -m 3 \
            "http://127.0.0.1:${NGINX_PORT}${resource_path}" 2>/dev/null || true)"
    elif command -v timeout >/dev/null 2>&1; then
        headers="$(
            {
                exec 3<>"/dev/tcp/127.0.0.1/${NGINX_PORT}" || exit 1
                printf 'HEAD %s HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n' "$resource_path" >&3
                timeout 3 cat <&3 2>/dev/null
                exec 3>&- 3<&- 2>/dev/null || true
            } || true
        )"
    else
        warn "Unable to validate frontend assets: curl and timeout are unavailable"
        return 1
    fi

    status="$(printf '%s\n' "$headers" \
        | awk 'toupper($1) ~ /^HTTP\// { status=$2 } END { print status }' \
        | tr -d '\r' || true)"
    content_type="$(printf '%s\n' "$headers" \
        | awk -F': *' 'tolower($1) == "content-type" { value=tolower($2) } END { print value }' \
        | tr -d '\r' || true)"
    printf '%s|%s\n' "${status:-000}" "${content_type:-missing}"
}

static_asset_ready() {
    local resource_path="$1"
    local expected_type="$2"
    local local_file="$3"
    local metadata=""
    local status=""
    local content_type=""

    if [ ! -s "$local_file" ]; then
        warn "Frontend asset is missing or empty: $local_file"
        return 1
    fi

    metadata="$(http_head_metadata "$resource_path")" || return 1
    status="${metadata%%|*}"
    content_type="${metadata#*|}"
    if [ "$status" != "200" ]; then
        warn "Frontend asset $resource_path returned HTTP ${status:-000}"
        return 1
    fi

    case "$expected_type:$content_type" in
        javascript:application/javascript*|javascript:text/javascript*) return 0 ;;
        css:text/css*) return 0 ;;
        html:text/html*) return 0 ;;
        *)
            warn "Frontend asset $resource_path returned an invalid Content-Type: ${content_type:-missing} (expected $expected_type)"
            return 1
            ;;
    esac
}

frontend_static_assets_ready() {
    local frontend_root="$SCRIPT_DIR/frontend/dist"
    local index_file="$frontend_root/index.html"
    local build_index="$SCRIPT_DIR/build/index.html"
    local entry_js=""
    local entry_css=""
    local build_js=""
    local build_css=""

    [ -s "$index_file" ] || { warn "Frontend index is missing or empty: $index_file"; return 1; }
    [ -s "$build_index" ] || { warn "Build index is missing or empty: $build_index"; return 1; }

    entry_js="$(grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' "$index_file" 2>/dev/null | head -1 || true)"
    entry_css="$(grep -oE '/assets/index-[A-Za-z0-9_-]+\.css' "$index_file" 2>/dev/null | head -1 || true)"
    build_js="$(grep -oE '/build/assets/index\.[A-Za-z0-9_-]+\.js' "$build_index" 2>/dev/null | head -1 || true)"
    build_css="$(grep -oE '/build/assets/index\.[A-Za-z0-9_-]+\.css' "$build_index" 2>/dev/null | head -1 || true)"

    [ -n "$entry_js" ] || { warn "Frontend JavaScript entry was not found in index.html"; return 1; }
    [ -n "$entry_css" ] || { warn "Frontend stylesheet entry was not found in index.html"; return 1; }
    [ -n "$build_js" ] || { warn "Build JavaScript entry was not found in build/index.html"; return 1; }
    [ -n "$build_css" ] || { warn "Build stylesheet entry was not found in build/index.html"; return 1; }

    static_asset_ready "/" html "$index_file" || return 1
    static_asset_ready "$entry_js" javascript "$frontend_root$entry_js" || return 1
    static_asset_ready "$entry_css" css "$frontend_root$entry_css" || return 1
    static_asset_ready "/build/head.js" javascript "$SCRIPT_DIR/build/head.js" || return 1
    static_asset_ready "$build_js" javascript "$SCRIPT_DIR$build_js" || return 1
    static_asset_ready "$build_css" css "$SCRIPT_DIR$build_css" || return 1
    return 0
}

# If startup exits abnormally, automatically clean up all started services
_CLEANUP_ON_EXIT=0
_STARTUP_SUCCEEDED=0
_cleanup_on_exit() {
    release_start_lock
    if [ "$_CLEANUP_ON_EXIT" = "1" ]; then
        _CLEANUP_ON_EXIT=0          # Prevent re-triggering if do_stop itself fails
        warn "Startup did not finish; cleaning up any started services ..."
        do_stop 2>/dev/null || true
    fi
}
trap '_cleanup_on_exit' EXIT

pg_bin()  { echo "$SCRIPT_DIR/pgsql/bin"; }
pg_ctl()  { "$(pg_bin)/pg_ctl" "$@"; }
pg_ready(){ { "$(pg_bin)/pg_isready" -h 127.0.0.1 -p "$PG_PORT" -q; } 2>/dev/null; }
psql_cmd(){ "$(pg_bin)/psql" -w -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" "$@"; }
pg_dump_cmd(){ "$(pg_bin)/pg_dump" -w -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" "$@"; }
pg_restore_cmd(){ "$(pg_bin)/pg_restore" -w -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" "$@"; }

# On WSL/NTFS (DrvFS), mkdir can fail because of timing issues, so retry
ensure_dir() {
    local target="$1" i=0
    while [ ! -d "$target" ] && [ $i -lt 5 ]; do
        mkdir -p "$target" 2>&1 || true
        [ -d "$target" ] && return 0
        i=$((i + 1))
        warn "Failed to create directory $target (retry $i/5) ..."
        sleep 1
    done
    [ -d "$target" ] || die 1008 "Unable to create directory: $target"
}

configure_runtime_env() {
    export PATH="$SCRIPT_DIR/bin:$(pg_bin):$PATH"
    case "$(uname -s)" in
        Linux)  export LD_LIBRARY_PATH="$SCRIPT_DIR/lib:$SCRIPT_DIR/pgsql/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" ;;
        Darwin) export DYLD_LIBRARY_PATH="$SCRIPT_DIR/lib:$SCRIPT_DIR/pgsql/lib${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}" ;;
    esac

    # Repair library aliases after extraction. Native Linux/macOS packages use
    # symlinks; WSL packages on /mnt/* must use regular copies so Windows tools
    # can still read, scan, and compress the client after it has been launched.
    _fix_lib_symlinks "$SCRIPT_DIR/pgsql/lib"
    _fix_lib_symlinks "$SCRIPT_DIR/lib"
}

close_terminal_window_if_needed() {
    if [ "$(uname -s)" = "Darwin" ]; then
        ( sleep 0.5; osascript -e "tell application \"Terminal\" to close front window" 2>/dev/null ) &
        disown 2>/dev/null
    fi
}

_START_LOCK_HELD=0
_STARTED_BY_OTHER=0

release_start_lock() {
    if [ "$_START_LOCK_HELD" = "1" ]; then
        rm -rf "$START_LOCK_DIR" 2>/dev/null || true
        _START_LOCK_HELD=0
    fi
}

acquire_start_lock() {
    if mkdir "$START_LOCK_DIR" 2>/dev/null; then
        echo "$$" > "$START_LOCK_PID"
        date +%s > "$START_LOCK_TS"
        _START_LOCK_HELD=1
        return 0
    fi

    local lock_pid=""
    lock_pid="$(cat "$START_LOCK_PID" 2>/dev/null || echo "")"
    if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
        return 1
    fi

    warn "Detected a stale startup lock; removing it ..."
    rm -rf "$START_LOCK_DIR" 2>/dev/null || true
    if mkdir "$START_LOCK_DIR" 2>/dev/null; then
        echo "$$" > "$START_LOCK_PID"
        date +%s > "$START_LOCK_TS"
        _START_LOCK_HELD=1
        return 0
    fi
    return 1
}

wait_for_existing_startup() {
    local waited=0
    warn "Another startup is already in progress; waiting for it to finish ..."
    while [ -d "$START_LOCK_DIR" ] && [ "$waited" -lt 90 ]; do
        if is_all_services_running; then
            _STARTED_BY_OTHER=1
            info "Another launcher finished startup successfully."
            return 0
        fi
        waited=$((waited + 1))
        sleep 1
    done

    if is_all_services_running; then
        _STARTED_BY_OTHER=1
        info "Services became healthy while waiting."
        return 0
    fi

    return 1
}

cluster_is_valid() {
    local cluster_dir="$1"
    [ -d "$cluster_dir" ] || return 1
    [ -f "$cluster_dir/PG_VERSION" ] || return 1
    [ -f "$cluster_dir/global/pg_control" ] || return 1
    [ -d "$cluster_dir/base" ] || return 1
    [ -d "$cluster_dir/pg_wal" ] || return 1
    [ -f "$cluster_dir/postgresql.conf" ] || return 1
    [ -f "$cluster_dir/pg_hba.conf" ] || return 1
}

dump_file_is_valid() {
    local dump_file="$1"
    [ -s "$dump_file" ] || return 1
    pg_restore_cmd -l "$dump_file" > /dev/null 2>&1
}

database_exists() {
    psql_cmd -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$PG_DB'" 2>/dev/null | grep -q 1
}

ensure_epic_schema() {
    psql_cmd -d "$PG_DB" -v ON_ERROR_STOP=1 >> "$DATA_DIR/psql.log" 2>&1 <<'SQL'
CREATE TABLE IF NOT EXISTS public.arkham_epic_events (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    organizer_user_id bigint NOT NULL,
    scenario_id text,
    campaign_id text,
    difficulty text NOT NULL,
    shared_state jsonb NOT NULL,
    total_investigators integer NOT NULL,
    step integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.arkham_epic_groups (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    arkham_epic_event_id uuid NOT NULL,
    ordinal integer NOT NULL,
    arkham_game_id uuid,
    name text NOT NULL,
    seat_count integer NOT NULL
);

CREATE TABLE IF NOT EXISTS public.arkham_epic_members (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    arkham_epic_event_id uuid NOT NULL,
    user_id bigint NOT NULL,
    role text NOT NULL,
    group_ordinal integer
);

CREATE TABLE IF NOT EXISTS public.arkham_epic_steps (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    arkham_epic_event_id uuid NOT NULL,
    step integer NOT NULL,
    arkham_game_id uuid,
    game_step integer,
    delta jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arkham_epic_events_pkey') THEN
        ALTER TABLE ONLY public.arkham_epic_events ADD CONSTRAINT arkham_epic_events_pkey PRIMARY KEY (id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arkham_epic_groups_pkey') THEN
        ALTER TABLE ONLY public.arkham_epic_groups ADD CONSTRAINT arkham_epic_groups_pkey PRIMARY KEY (id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arkham_epic_members_pkey') THEN
        ALTER TABLE ONLY public.arkham_epic_members ADD CONSTRAINT arkham_epic_members_pkey PRIMARY KEY (id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arkham_epic_steps_pkey') THEN
        ALTER TABLE ONLY public.arkham_epic_steps ADD CONSTRAINT arkham_epic_steps_pkey PRIMARY KEY (id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arkham_epic_groups_arkham_epic_event_id_ordinal_key') THEN
        ALTER TABLE ONLY public.arkham_epic_groups ADD CONSTRAINT arkham_epic_groups_arkham_epic_event_id_ordinal_key UNIQUE (arkham_epic_event_id, ordinal);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arkham_epic_members_arkham_epic_event_id_user_id_role_key') THEN
        ALTER TABLE ONLY public.arkham_epic_members ADD CONSTRAINT arkham_epic_members_arkham_epic_event_id_user_id_role_key UNIQUE (arkham_epic_event_id, user_id, role);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arkham_epic_events_organizer_user_id_fkey') THEN
        ALTER TABLE ONLY public.arkham_epic_events ADD CONSTRAINT arkham_epic_events_organizer_user_id_fkey FOREIGN KEY (organizer_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arkham_epic_groups_arkham_epic_event_id_fkey') THEN
        ALTER TABLE ONLY public.arkham_epic_groups ADD CONSTRAINT arkham_epic_groups_arkham_epic_event_id_fkey FOREIGN KEY (arkham_epic_event_id) REFERENCES public.arkham_epic_events(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arkham_epic_groups_arkham_game_id_fkey') THEN
        ALTER TABLE ONLY public.arkham_epic_groups ADD CONSTRAINT arkham_epic_groups_arkham_game_id_fkey FOREIGN KEY (arkham_game_id) REFERENCES public.arkham_games(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arkham_epic_members_arkham_epic_event_id_fkey') THEN
        ALTER TABLE ONLY public.arkham_epic_members ADD CONSTRAINT arkham_epic_members_arkham_epic_event_id_fkey FOREIGN KEY (arkham_epic_event_id) REFERENCES public.arkham_epic_events(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arkham_epic_members_user_id_fkey') THEN
        ALTER TABLE ONLY public.arkham_epic_members ADD CONSTRAINT arkham_epic_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arkham_epic_steps_arkham_epic_event_id_fkey') THEN
        ALTER TABLE ONLY public.arkham_epic_steps ADD CONSTRAINT arkham_epic_steps_arkham_epic_event_id_fkey FOREIGN KEY (arkham_epic_event_id) REFERENCES public.arkham_epic_events(id) ON DELETE CASCADE;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS arkham_epic_groups_event_idx ON public.arkham_epic_groups USING btree (arkham_epic_event_id);
CREATE INDEX IF NOT EXISTS arkham_epic_groups_game_idx ON public.arkham_epic_groups USING btree (arkham_game_id);
CREATE INDEX IF NOT EXISTS arkham_epic_members_event_idx ON public.arkham_epic_members USING btree (arkham_epic_event_id);
CREATE UNIQUE INDEX IF NOT EXISTS arkham_epic_steps_event_step_idx ON public.arkham_epic_steps USING btree (arkham_epic_event_id, step);
SQL
}

cleanup_invalid_cluster() {
    local cluster_dir="$1"
    [ -e "$cluster_dir" ] || return 0
    warn "Removing invalid PostgreSQL cluster: $cluster_dir"
    rm -rf "$cluster_dir" 2>/dev/null || die 2008 "Failed to remove invalid PostgreSQL cluster"
}

backup_database_dump() {
    [ -d "$PG_DATA" ] || return 0
    pg_ready || return 0
    database_exists || return 0

    ensure_dir "$BACKUP_DIR"
    rm -f "$PG_DUMP_TMP" 2>/dev/null || true

    info "Exporting database backup ..."
    if ! pg_dump_cmd -d "$PG_DB" -Fc -f "$PG_DUMP_TMP" > "$PG_DUMP_LOG" 2>&1; then
        warn "[4006] Logical backup failed during pg_dump"
        return 1
    fi
    if ! dump_file_is_valid "$PG_DUMP_TMP"; then
        warn "[4006] Logical backup validation failed"
        rm -f "$PG_DUMP_TMP" 2>/dev/null || true
        return 1
    fi

    rm -f "$PG_DUMP_PREV" 2>/dev/null || true
    [ -f "$PG_DUMP_FILE" ] && mv "$PG_DUMP_FILE" "$PG_DUMP_PREV" 2>/dev/null || true
    mv "$PG_DUMP_TMP" "$PG_DUMP_FILE" || {
        warn "[4006] Failed to publish logical backup"
        rm -f "$PG_DUMP_TMP" 2>/dev/null || true
        return 1
    }

    date +%s > "$VERSION_FILE"
    date +%s > "$VERSION_FILE_LOCAL"
    info "Database backup written to $PG_DUMP_FILE"
}

start_postgres() {
    if pg_ready; then
        # Verify it is actually our instance (trust auth, no password required)
        if pg_port_is_foreign "$PG_PORT"; then
            die 2009 "Port $PG_PORT has a foreign PostgreSQL instance (requires password); cannot start"
        fi
        return 0
    fi

    info "Starting PostgreSQL ..."
    if ! pg_ctl -D "$PG_DATA" -l "$PG_LOG" -o "-k '$PG_SOCKET_DIR'" start; then
        die 2004 "PostgreSQL failed to start" "$PG_LOG"
    fi
    local tries=0
    while ! pg_ready; do
        tries=$((tries + 1)); [ "$tries" -gt 30 ] && die 2005 "PostgreSQL startup timed out" "$PG_LOG"
        sleep 1
    done
    info "PostgreSQL started (port $PG_PORT, PID $(get_pg_pid))"
}

restore_database_from_dump() {
    local dump_file="$1"

    info "Restoring database from logical backup: $(basename "$dump_file") ..."

    # Initialize a fresh cluster (inline; must not die so caller can fall back)
    ensure_dir "$DATA_DIR"
    rm -f "$PG_LOG" "$DATA_DIR/psql.log" "$DATA_DIR/initdb.log" "$PG_RESTORE_LOG" 2>/dev/null || true
    ensure_dir "$PG_DATA"
    if ! "$(pg_bin)/initdb" -D "$PG_DATA" -U "$PG_USER" --no-locale -E UTF8 \
        > "$DATA_DIR/initdb.log" 2>&1; then
        warn "initdb failed during restore (see $DATA_DIR/initdb.log)"
        return 1
    fi
    cat > "$PG_DATA/pg_hba.conf" << HBA_EOF
local   all   all                 trust
host    all   all   127.0.0.1/32  trust
host    all   all   ::1/128       trust
HBA_EOF

    # Configure socket directory
    cat >> "$PG_DATA/postgresql.conf" << PG_CONF_EOF

port = $PG_PORT
unix_socket_directories = '$PG_SOCKET_DIR'
listen_addresses = '127.0.0.1'
PG_CONF_EOF

    # Start PostgreSQL (inline; must not die)
    if ! pg_ctl -D "$PG_DATA" -l "$PG_LOG" -o "-k '$PG_SOCKET_DIR'" start; then
        warn "PostgreSQL failed to start during restore (see $PG_LOG)"
        return 1
    fi
    local tries=0
    while ! pg_ready; do
        tries=$((tries + 1))
        if [ "$tries" -gt 30 ]; then
            warn "PostgreSQL startup timed out during restore (see $PG_LOG)"
            return 1
        fi
        sleep 1
    done

    # Create database and restore dump
    if ! psql_cmd -d postgres -c "CREATE DATABASE \"$PG_DB\";" \
        > "$DATA_DIR/psql.log" 2>&1; then
        warn "Failed to create database during restore (see $DATA_DIR/psql.log)"
        return 1
    fi
    if ! pg_restore_cmd -d "$PG_DB" --clean --if-exists --no-owner "$dump_file" \
        > "$PG_RESTORE_LOG" 2>&1; then
        warn "pg_restore failed for $(basename "$dump_file") (see $PG_RESTORE_LOG)"
        return 1
    fi
    info "Logical backup restore complete."
    return 0
}

# Local management operations. These commands only touch this package's local
# PostgreSQL data and never contact or publish to a remote server.
stop_services_for_admin() {
    kill_stale_launchers
    if is_nginx_running || is_api_running || is_pg_running \
       || is_port_in_use "$NGINX_PORT" || is_port_in_use "$API_PORT" || is_port_in_use "$PG_PORT"; then
        warn "Database operation requires stopping the current services ..."
        do_stop
        wait_for_configured_ports_to_free || die 4101 "Local service ports did not become free"
    fi
}

rewrite_admin_pg_config() {
    local conf="$PG_DATA/postgresql.conf"
    [ -f "$conf" ] || return 0
    if [ "$(uname -s)" = "Darwin" ]; then
        sed -i '' \
            -e "s|^[[:space:]]*port[[:space:]]*=.*|port = $PG_PORT|" \
            -e "s|^[[:space:]]*unix_socket_directories[[:space:]]*=.*|unix_socket_directories = '$PG_SOCKET_DIR'|" \
            -e "s|^[[:space:]]*listen_addresses[[:space:]]*=.*|listen_addresses = '127.0.0.1'|" \
            "$conf"
    else
        sed -i \
            -e "s|^[[:space:]]*port[[:space:]]*=.*|port = $PG_PORT|" \
            -e "s|^[[:space:]]*unix_socket_directories[[:space:]]*=.*|unix_socket_directories = '$PG_SOCKET_DIR'|" \
            -e "s|^[[:space:]]*listen_addresses[[:space:]]*=.*|listen_addresses = '127.0.0.1'|" \
            "$conf"
    fi
}

start_postgres_for_admin() {
    stop_services_for_admin
    _CLEANUP_ON_EXIT=1

    if ! cluster_is_valid "$PG_DATA"; then
        cleanup_invalid_cluster "$PG_DATA"
        if dump_file_is_valid "$PG_DUMP_FILE"; then
            restore_database_from_dump "$PG_DUMP_FILE" \
                || die 4102 "Could not restore the local database before the management operation" "$PG_RESTORE_LOG"
        else
            init_database
            rewrite_admin_pg_config
            start_postgres
        fi
    else
        rewrite_admin_pg_config
        start_postgres
    fi

    if ! database_exists; then
        psql_cmd -d postgres -c "CREATE DATABASE \"$PG_DB\";" > "$DATA_DIR/psql.log" 2>&1 \
            || die 4103 "Could not create the local database" "$DATA_DIR/psql.log"
        psql_cmd -d "$PG_DB" -v ON_ERROR_STOP=1 -f "$DATA_DIR/setup.sql" >> "$DATA_DIR/psql.log" 2>&1 \
            || die 4104 "Could not initialize the local database" "$DATA_DIR/psql.log"
    fi
    ensure_epic_schema || die 4105 "Could not apply the local database schema" "$DATA_DIR/psql.log"
}

stop_postgres_after_admin() {
    if [ -f "$PG_DATA/postmaster.pid" ]; then
        pg_ctl -D "$PG_DATA" -m fast -w stop >/dev/null 2>&1 || true
    fi
    rm -f "$PG_DATA/postmaster.pid" \
          "$PG_SOCKET_DIR/.s.PGSQL.${PG_PORT}" \
          "$PG_SOCKET_DIR/.s.PGSQL.${PG_PORT}.lock" 2>/dev/null || true
    _CLEANUP_ON_EXIT=0
}

ensure_restore_role() {
    if ! psql_cmd -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'arkham_pg_user'" 2>/dev/null | grep -q 1; then
        psql_cmd -d postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE arkham_pg_user NOLOGIN;" >/dev/null 2>&1 \
            || die 4106 "Could not create the compatibility restore role"
    fi
}

recover_pre_operation_backup() {
    stop_postgres_after_admin
    cleanup_invalid_cluster "$PG_DATA"
    if dump_file_is_valid "$PG_DUMP_FILE" && restore_database_from_dump "$PG_DUMP_FILE"; then
        stop_postgres_after_admin
        return 0
    fi
    stop_postgres_after_admin
    return 1
}

do_backup_save() {
    local archive_path="$1"
    [ -n "$archive_path" ] || die 4110 "Please provide a tar.gz backup path"

    start_postgres_for_admin
    if ! backup_database_dump; then
        stop_postgres_after_admin
        die 4111 "Could not export the local database" "$PG_DUMP_LOG"
    fi
    stop_postgres_after_admin
    dump_file_is_valid "$PG_DUMP_FILE" || die 4112 "The exported local database backup is invalid"

    mkdir -p "$(dirname "$archive_path")" || die 4113 "Could not create the backup destination"
    local temp_dir
    temp_dir="$(mktemp -d)"
    mkdir -p "$temp_dir/arkham-save"
    cp "$PG_DUMP_FILE" "$temp_dir/arkham-save/save.dump"
    {
        printf 'format=arkham-local-save-v2\n'
        printf 'created_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
        printf 'database=%s\n' "$PG_DB"
    } > "$temp_dir/arkham-save/manifest.txt"
    if ! tar -czf "$archive_path" -C "$temp_dir" arkham-save; then
        rm -rf "$temp_dir"
        die 4114 "Could not create the tar.gz backup"
    fi
    rm -rf "$temp_dir"
    info "Local save backup created: $archive_path"
}

do_restore_save() {
    local archive_path="$1"
    [ -f "$archive_path" ] || die 4120 "Backup file not found: $archive_path"

    local entries temp_dir restore_dump
    entries="$(tar -tzf "$archive_path")" || die 4121 "Could not read the tar.gz backup"
    while IFS= read -r entry; do
        [ -z "$entry" ] && continue
        case "$entry" in
            arkham-save|arkham-save/|arkham-save/save.dump|arkham-save/manifest.txt) ;;
            *) die 4122 "Backup contains an unexpected path: $entry" ;;
        esac
    done <<EOF
$entries
EOF

    temp_dir="$(mktemp -d)"
    if ! tar -xzf "$archive_path" -C "$temp_dir"; then
        rm -rf "$temp_dir"
        die 4123 "Could not extract the tar.gz backup"
    fi
    restore_dump="$temp_dir/arkham-save/save.dump"
    if ! dump_file_is_valid "$restore_dump"; then
        rm -rf "$temp_dir"
        die 4124 "The tar.gz backup does not contain a valid database save"
    fi

    start_postgres_for_admin
    backup_database_dump || true
    stop_postgres_after_admin
    cleanup_invalid_cluster "$PG_DATA"

    if ! restore_database_from_dump "$restore_dump"; then
        rm -rf "$temp_dir"
        recover_pre_operation_backup || true
        die 4125 "Save restore failed; the previous automatic backup was retained" "$PG_RESTORE_LOG"
    fi
    rm -rf "$temp_dir"
    ensure_epic_schema || {
        recover_pre_operation_backup || true
        die 4126 "Save restored but local schema migration failed" "$DATA_DIR/psql.log"
    }
    backup_database_dump || true
    stop_postgres_after_admin
    info "Local save restore complete."
}

do_import_sql() {
    local sql_path="$1"
    [ -f "$sql_path" ] || die 4130 "SQL save not found: $sql_path"

    start_postgres_for_admin
    backup_database_dump || die 4131 "Could not create a safety backup before SQL import" "$PG_DUMP_LOG"
    ensure_restore_role
    local import_log="$DATA_DIR/import-sql.log" import_ok=0
    : > "$import_log"

    psql_cmd -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$PG_DB' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
    psql_cmd -d postgres -c "DROP DATABASE IF EXISTS \"$PG_DB\";" >/dev/null 2>&1 \
        || die 4132 "Could not remove the previous database"
    psql_cmd -d postgres -c "CREATE DATABASE \"$PG_DB\";" >/dev/null 2>&1 \
        || die 4133 "Could not create the import database"

    if head -c 5 "$sql_path" 2>/dev/null | grep -q '^PGDMP'; then
        pg_restore_cmd -d "$PG_DB" --clean --if-exists --no-owner "$sql_path" > "$import_log" 2>&1 && import_ok=1
    else
        psql_cmd -d "$PG_DB" -v ON_ERROR_STOP=1 -f "$sql_path" > "$import_log" 2>&1 && import_ok=1
    fi

    if [ "$import_ok" != "1" ]; then
        recover_pre_operation_backup || true
        die 4134 "SQL save import failed; the previous automatic backup was restored" "$import_log"
    fi
    ensure_epic_schema || {
        recover_pre_operation_backup || true
        die 4135 "SQL imported but local schema migration failed" "$DATA_DIR/psql.log"
    }
    backup_database_dump || true
    stop_postgres_after_admin
    info "SQL save import complete."
}

do_reset_db() {
    start_postgres_for_admin
    backup_database_dump || die 4140 "Could not create a safety backup before reset" "$PG_DUMP_LOG"
    psql_cmd -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$PG_DB' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
    psql_cmd -d postgres -c "DROP DATABASE IF EXISTS \"$PG_DB\";" >/dev/null 2>&1 \
        || die 4141 "Could not remove the current database"
    psql_cmd -d postgres -c "CREATE DATABASE \"$PG_DB\";" >/dev/null 2>&1 \
        || die 4142 "Could not create the new database"
    psql_cmd -d "$PG_DB" -v ON_ERROR_STOP=1 -f "$DATA_DIR/setup.sql" > "$DATA_DIR/psql.log" 2>&1 \
        || {
            recover_pre_operation_backup || true
            die 4143 "Could not rebuild the initial database; the previous backup was restored" "$DATA_DIR/psql.log"
        }
    ensure_epic_schema || die 4144 "Could not apply the local database schema" "$DATA_DIR/psql.log"
    backup_database_dump || true
    stop_postgres_after_admin
    info "Current SQL save was cleared and rebuilt."
}

do_list_accounts() {
    start_postgres_for_admin
    printf 'id\tusername\temail\tadmin\tbeta\n'
    local query_ok=0
    psql_cmd -d "$PG_DB" -F $'\t' -A -t \
        -c "SELECT id, username, email, COALESCE(admin, false), COALESCE(beta, false) FROM users ORDER BY id;" && query_ok=1
    stop_postgres_after_admin
    [ "$query_ok" = "1" ] || die 4150 "Could not query local save accounts"
}

do_delete_accounts() {
    local ids raw_count query_ok=0
    ids="$(printf '%s' "$1" | tr -d '[:space:]')"
    [[ "$ids" =~ ^[0-9]+(,[0-9]+)*$ ]] || die 4160 "Account IDs must look like 1,2,3"

    start_postgres_for_admin
    backup_database_dump || die 4161 "Could not create a safety backup before account deletion" "$PG_DUMP_LOG"
    raw_count="$(psql_cmd -d "$PG_DB" -tAc "SELECT COUNT(*) FROM users WHERE id = ANY(string_to_array('$ids', ',')::bigint[]);")"
    raw_count="$(printf '%s' "$raw_count" | tr -d '[:space:]')"
    if [ "${raw_count:-0}" = "0" ]; then
        stop_postgres_after_admin
        warn "No matching local accounts were found."
        return 0
    fi

    if psql_cmd -d "$PG_DB" -v ON_ERROR_STOP=1 >/dev/null <<SQL
BEGIN;
DELETE FROM password_resets WHERE user_id = ANY(string_to_array('$ids', ',')::bigint[]);
DELETE FROM users WHERE id = ANY(string_to_array('$ids', ',')::bigint[]);
COMMIT;
SQL
    then
        query_ok=1
    fi
    if [ "$query_ok" != "1" ]; then
        recover_pre_operation_backup || true
        die 4162 "Account deletion failed; the previous automatic backup was restored"
    fi
    backup_database_dump || true
    stop_postgres_after_admin
    info "Deleted $raw_count local account(s)."
}

start_api_for_admin() {
    export DATABASE_URL="postgres://${PG_USER}@127.0.0.1:${PG_PORT}/${PG_DB}"
    export PORT="$API_PORT"
    export PGHOST="127.0.0.1" PGPORT="$PG_PORT" PGSSLMODE="disable"
    export ASSET_HOST=""
    ( cd "$SCRIPT_DIR"; nohup "$SCRIPT_DIR/bin/arkham-api" >> "$DATA_DIR/arkham-api.log" 2>&1 & echo $! > "$API_PID_FILE" )
    local tries=0
    while ! api_health_ready; do
        tries=$((tries + 1))
        [ "$tries" -gt 150 ] && die 4171 "Backend API did not start for password reset" "$DATA_DIR/arkham-api.log"
        sleep 0.2
    done
}

stop_api_after_admin() {
    local pid=""
    pid="$(get_api_pid 2>/dev/null || true)"
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
    [ -n "$pid" ] && wait_pid_exit "$pid" "arkham-api" 5 || true
    rm -f "$API_PID_FILE"
}

do_set_account_password() {
    local email="$1" password="$2" email_b64 token password_json http_status
    [ -n "$email" ] || die 4170 "Account email is required"
    [ "${#password}" -ge 6 ] || die 4170 "The new password must contain at least 6 characters"
    email_b64="$(printf '%s' "$email" | base64 | tr -d '\r\n')"

    start_postgres_for_admin
    backup_database_dump || die 4172 "Could not create a safety backup before changing the password" "$PG_DUMP_LOG"
    token="$(psql_cmd -d "$PG_DB" -tAc "WITH target AS (SELECT id FROM users WHERE lower(email) = lower(convert_from(decode('$email_b64', 'base64'), 'UTF8')) LIMIT 1), created AS (INSERT INTO password_resets (id, user_id, expires_at) SELECT uuid_generate_v4(), id, NOW() + interval '1 day' FROM target RETURNING id) SELECT id FROM created;" | tr -d '[:space:]')"
    if [ -z "$token" ]; then
        stop_postgres_after_admin
        die 4173 "No local account matched that email address"
    fi

    start_api_for_admin
    password_json="$(printf '%s' "$password" | python3 -c 'import json,sys; print(json.dumps({"password": sys.stdin.read()}))')"
    http_status="$(curl --noproxy '*' -sS -o "$DATA_DIR/password-reset-response.log" -w '%{http_code}' \
        -X PUT -H 'Content-Type: application/json' --data "$password_json" \
        "http://127.0.0.1:${API_PORT}/api/v1/password-reset/${token}" 2>/dev/null || true)"
    stop_api_after_admin
    if [ "$http_status" != "200" ] && [ "$http_status" != "204" ]; then
        psql_cmd -d "$PG_DB" -c "DELETE FROM password_resets WHERE id = '$token';" >/dev/null 2>&1 || true
        stop_postgres_after_admin
        die 4174 "Password reset failed (HTTP ${http_status:-000})" "$DATA_DIR/password-reset-response.log"
    fi
    backup_database_dump || true
    stop_postgres_after_admin
    info "Password updated for $email."
}

# Scan a directory for versioned .so files (lib*.so.X.Y) and recreate aliases.
#   lib*.so.X.Y  鈫? lib*.so   and  lib*.so.X
# WSL packages on /mnt/* always use regular copies for Windows compatibility.
_fix_lib_symlinks() {
    local dir="$1"
    [ -d "$dir" ] || return 0

    local force_regular_files=false
    if is_wsl && [[ "$dir" == /mnt/* ]]; then
        force_regular_files=true
    fi

    # Short-circuit: if the first versioned .so already has valid soname and bare symlinks, skip
    local first_versioned
    first_versioned="$(find "$dir" -maxdepth 1 -name 'lib*.so.*' -print -quit 2>/dev/null)"
    if ! $force_regular_files && [ -n "$first_versioned" ]; then
        local bn="${first_versioned##*/}"
        local sn="${bn%.*}"
        local bare="${sn%.*}"
        # Verify soname link (e.g. libpq.so.5 -> libpq.so.5.14)
        local soname_ok=false
        if [ -L "$dir/$sn" ] && [ "$(readlink "$dir/$sn")" = "$bn" ]; then
            soname_ok=true
        fi
        # Verify bare link if applicable (e.g. libpq.so -> libpq.so.5.14)
        local bare_ok=false
        if [[ "$bare" == *.so ]]; then
            if [ -L "$dir/$bare" ]; then
                bare_ok=true
            fi
        else
            bare_ok=true  # no bare link expected for this file
        fi
        if $soname_ok && $bare_ok; then
            return 0
        fi
    fi

    local f basename linkname
    # Match versioned .so files: lib*.so.X, lib*.so.X.Y, lib*.so.X.Y.Z, etc.
    # Glob returns entries in lexicographic order, so libpq.so.5 comes before libpq.so.5.14;
    # later iterations naturally overwrite earlier symlinks with the correct longest target.
    for f in "$dir"/lib*.so.*; do
        [ -f "$f" ] || continue
        basename="$(basename "$f")"
        # e.g. libpq.so.5.14 鈫?soname=libpq.so.5, bare=libpq.so
        #      libpq.so.5.14.3 鈫?soname=libpq.so.5.14, bare=libpq.so.5 (not .so, skip bare link)
        local soname="${basename%.*}"      # strip last .N segment
        local bare="${soname%.*}"          # strip one more segment
        # Recreate the soname link (libpq.so.5 -> libpq.so.5.14)
        linkname="$dir/$soname"
        if $force_regular_files; then
            if [ -L "$linkname" ] || [ ! -f "$linkname" ] || ! cmp -s "$f" "$linkname"; then
                rm -f -- "$linkname"
                cp -L -f -- "$f" "$linkname"
            fi
        elif [ ! -L "$linkname" ] || [ "$(readlink "$linkname")" != "$basename" ]; then
            # Try symlink first; fall back to copy if filesystem doesn't support symlinks
            # (e.g. NTFS via DrvFS without Developer Mode / SeCreateSymbolicLinkPrivilege)
            if ! ln -sf "$basename" "$linkname" 2>/dev/null; then
                cp -L -f "$f" "$linkname"
            fi
        fi
        # Recreate the bare link (libpq.so -> libpq.so.5.14) only if bare ends with .so
        if [[ "$bare" == *.so ]]; then
            linkname="$dir/$bare"
            if $force_regular_files; then
                if [ -L "$linkname" ] || [ ! -f "$linkname" ] || ! cmp -s "$f" "$linkname"; then
                    rm -f -- "$linkname"
                    cp -L -f -- "$f" "$linkname"
                fi
            elif [ ! -L "$linkname" ] || [ "$(readlink "$linkname")" != "$basename" ]; then
                if ! ln -sf "$basename" "$linkname" 2>/dev/null; then
                    cp -L -f "$f" "$linkname"
                fi
            fi
        fi
    done
}

# 鈹€鈹€ macOS Gatekeeper: ad-hoc sign all binaries and clear quarantine 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
# Order: 1) make writable 鈫?2) clear quarantine with xattr 鈫?3) remove old signatures and re-sign ad-hoc 鈫?4) clear xattr again
# Homebrew-bundled dylib source files may be read-only (0444), so chmod u+w is required first.
ensure_macos_signing() {
    if [ "$(uname -s)" != "Darwin" ]; then
        return 0
    fi
    if ! command -v codesign >/dev/null 2>&1; then
        warn "codesign not found; skipping signing (manual approval may be needed on macOS)"
        return 0
    fi

    # Skip if binaries haven't changed since last successful signing,
    # but verify the signature is still intact (user may have tampered with binaries)
    local marker="$DATA_DIR/signed.marker"
    local ref_bin="$SCRIPT_DIR/bin/arkham-api"
    if [ -f "$marker" ] && [ -f "$ref_bin" ] && [ "$marker" -nt "$ref_bin" ]; then
        if codesign --verify -q "$ref_bin" 2>/dev/null; then
            return 0
        fi
        # Signature broken; remove stale marker and re-sign
        rm -f "$marker"
    fi

    # 1) Ensure all files that need signing are writable (Homebrew dylibs may be read-only)
    for dir in bin pgsql/bin pgsql/lib lib; do
        local d="${SCRIPT_DIR}/${dir}"
        [ -d "$d" ] && chmod -R u+w "$d" 2>/dev/null || true
    done

    # 2) Clear all quarantine attributes first
    if ! xattr -rd com.apple.quarantine "$SCRIPT_DIR"; then
        warn "Failed to clear quarantine attributes with xattr (safe to ignore; continuing signing)"
    fi

    info "Applying ad-hoc signatures to all binaries and dynamic libraries ..."
    local cs_ok=0 cs_fail=0
    for dir in bin pgsql/bin pgsql/lib lib; do
        local d="${SCRIPT_DIR}/${dir}"
        [ ! -d "$d" ] && continue
        # lib/ contains Homebrew-bundled dylibs; remove signatures twice to ensure the original signature is fully stripped
        if [ "$dir" = "lib" ]; then
            find "$d" -name '*.dylib' -exec codesign --remove-signature {} \; 2>/dev/null || true
            find "$d" -name '*.dylib' -exec codesign --remove-signature {} \; 2>/dev/null || true
        fi
        while IFS= read -r -d '' f; do
            codesign --remove-signature "$f" 2>/dev/null || true
            if codesign --force --sign - "$f"; then cs_ok=$((cs_ok + 1))
            else cs_fail=$((cs_fail + 1)); warn "Signing failed: $f"
            fi
        done < <(find "$d" -type f \( -perm -a=x -o -name '*.so' -o -name '*.dylib' \) -print0 2>/dev/null)
    done
    info "  Signing complete: ${cs_ok} succeeded"$([ $cs_fail -gt 0 ] && echo ", ${cs_fail} failed")

    # 3) Clear quarantine attributes again after signing (codesign may re-trigger them)
    xattr -rd com.apple.quarantine "$SCRIPT_DIR" 2>/dev/null || true

    # Record successful signing so subsequent starts can skip this step
    touch "$marker"
}

is_pg_running()   { pg_ready; }
is_api_running()  {
    if [ -f "$API_PID_FILE" ]; then
        local p; p="$(cat "$API_PID_FILE" 2>/dev/null)"
        [ -n "$p" ] && kill -0 "$p" 2>/dev/null && return 0
    fi
    # Fallback: inspect Linux listeners. WSL localhost forwarding can remain reachable
    # briefly after a process exits, so /dev/tcp is not a reliable process check here.
    is_port_in_use "$API_PORT"
}
is_nginx_running() {
    if [ -f "$NGINX_PID" ]; then
        local p; p="$(cat "$NGINX_PID" 2>/dev/null)"
        [ -n "$p" ] && kill -0 "$p" 2>/dev/null && return 0
    fi
    is_port_in_use "$NGINX_PORT"
}

# Check whether all three services are healthy
is_all_services_running() { is_pg_running && is_api_running && is_nginx_running; }

# Get the PID for each running service (used for status output)
get_pg_pid() {
    # Prefer the PID file when the service was started by the same user
    if [ -f "$PG_DATA/postmaster.pid" ]; then
        local pid_val; pid_val="$(head -1 "$PG_DATA/postmaster.pid" 2>/dev/null)"
        [ -n "$pid_val" ] && echo "$pid_val" && return
    fi
    # Cross-user case: read the first line of postmaster.pid via SQL (PostgreSQL can read its own files internally)
    local pid_val; pid_val="$(psql_cmd -d postgres -tAc \
        "SELECT split_part(pg_read_file('postmaster.pid'), E'\n', 1);" 2>/dev/null | tr -d ' ')"
    if [ -n "$pid_val" ] && [ "$pid_val" != "" ]; then
        echo "$pid_val" && return
    fi
    # Final fallback: try lsof / ss
    local p=""
    p="$(lsof -ti ":$PG_PORT" -sTCP:LISTEN 2>/dev/null | head -1)"
    [ -n "$p" ] && echo "$p" && return
    p="$(ss -tlnp 2>/dev/null | grep ":${PG_PORT} " | grep -oP 'pid=\K[0-9]+' | head -1)"
    [ -n "$p" ] && echo "$p" && return
    echo "?"
}
get_api_pid() {
    if [ -f "$API_PID_FILE" ]; then
        cat "$API_PID_FILE" 2>/dev/null && return
    fi
    local p=""
    p="$(lsof -ti ":$API_PORT" -sTCP:LISTEN 2>/dev/null | head -1)"
    [ -n "$p" ] && echo "$p" && return
    p="$(ss -tlnp 2>/dev/null | grep ":${API_PORT} " | grep -oP 'pid=\K[0-9]+' | head -1)"
    [ -n "$p" ] && echo "$p" && return
    echo "?"
}
get_nginx_pid() {
    if [ -f "$NGINX_PID" ]; then
        cat "$NGINX_PID" 2>/dev/null && return
    fi
    local p=""
    p="$(lsof -ti ":$NGINX_PORT" -sTCP:LISTEN 2>/dev/null | head -1)"
    [ -n "$p" ] && echo "$p" && return
    p="$(ss -tlnp 2>/dev/null | grep ":${NGINX_PORT} " | grep -oP 'pid=\K[0-9]+' | head -1)"
    [ -n "$p" ] && echo "$p" && return
    echo "?"
}

# Find and terminate the process holding a port (fallback when PID files are missing)
# Send SIGTERM first 鈫?wait 5 seconds 鈫?escalate to SIGKILL if needed
kill_port_holder() {
    local port="$1" label="${2:-}"
    local pids=""
    if [ "$(uname -s)" = "Darwin" ]; then
        pids="$(lsof -ti ":$port" -sTCP:LISTEN 2>/dev/null || true)"
    else
        pids="$(ss -tlnp 2>/dev/null | grep ":${port} " | grep -o 'pid=[0-9]*' | sed 's/pid=//' | sort -u || true)"
        if [ -z "$pids" ] && command -v fuser >/dev/null 2>&1; then
            pids="$(fuser -n tcp "$port" 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+$' | sort -u || true)"
        fi
    fi
    [ -z "$pids" ] && return 0
    local pid
    # First pass: SIGTERM (graceful shutdown)
    for pid in $pids; do
        [ "$pid" = "$$" ] && continue
        kill "$pid" 2>/dev/null && \
            warn "Sent SIGTERM via port ${port} (PID $pid)${label:+ [$label]}"
    done
    # Wait for the port to be released (up to 10 seconds)
    local i=0
    while is_port_in_use "$port" && [ $i -lt 10 ]; do
        i=$((i + 1)); sleep 1
    done
    sleep 2
    # Second pass: SIGKILL (force stop after SIGTERM timeout)
    if is_port_in_use "$port"; then
        if [ "$(uname -s)" = "Darwin" ]; then
            pids="$(lsof -ti ":$port" -sTCP:LISTEN 2>/dev/null || true)"
        else
            pids="$(ss -tlnp 2>/dev/null | grep ":${port} " | grep -o 'pid=[0-9]*' | sed 's/pid=//' | sort -u || true)"
            if [ -z "$pids" ] && command -v fuser >/dev/null 2>&1; then
                pids="$(fuser -n tcp "$port" 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+$' | sort -u || true)"
            fi
        fi
        for pid in $pids; do
            [ "$pid" = "$$" ] && continue
            kill -9 "$pid" 2>/dev/null && \
                warn "SIGTERM timed out on port ${port}; sent SIGKILL (PID $pid)${label:+ [$label]}"
        done
        # Wait for SIGKILL to take effect (up to 3 seconds)
        i=0
        while is_port_in_use "$port" && [ $i -lt 6 ]; do
            i=$((i + 1)); sleep 1
        done
        sleep 2
    fi
}

# Wait for a PID to exit (up to max_wait seconds), then force-kill with SIGKILL on timeout
wait_pid_exit() {
    local pid="$1" label="${2:-}" max_wait="${3:-5}"
    local i=0
    while kill -0 "$pid" 2>/dev/null && [ $i -lt $((max_wait * 2)) ]; do
        i=$((i + 1)); sleep 0.5
    done
    if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null && \
            warn "${label} SIGTERM timed out; sent SIGKILL (PID $pid)"
        i=0
        while kill -0 "$pid" 2>/dev/null && [ $i -lt 6 ]; do
            i=$((i + 1)); sleep 0.5
        done
    fi
}

# Check whether a port is in use (without relying on PID files)
is_port_in_use() {
    if [ "$(uname -s)" = "Darwin" ]; then
        lsof -i ":$1" -sTCP:LISTEN >/dev/null 2>&1 && return 0
        nc -z 127.0.0.1 "$1" >/dev/null 2>&1 && return 0
    else
        command -v ss >/dev/null 2>&1 && ss -tln 2>/dev/null | grep -q ":$1 " && return 0
        command -v lsof >/dev/null 2>&1 && lsof -i ":$1" -sTCP:LISTEN >/dev/null 2>&1 && return 0
        command -v fuser >/dev/null 2>&1 && fuser -n tcp "$1" >/dev/null 2>&1 && return 0
    fi
    return 1
}

# Find an available port starting from the given base, incrementing up to max_attempts times
# Usage: find_available_port <base_port> <label> <max_attempts>
# Prints the available port to stdout; dies if all attempts fail
find_available_port() {
    local base="$1" label="$2" max_attempts="${3:-1000}"
    local port="$base" attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if ! is_port_in_use "$port"; then
            echo "$port"
            return 0
        fi
        warn "Port $port ($label) is already in use; trying $((port + 1)) ..."
        port=$((port + 1))
        attempt=$((attempt + 1))
    done
    die 1010 "All ports $base-$((base + max_attempts - 1)) ($label) are occupied; cannot start"
}

wait_for_configured_ports_to_free() {
    local i=0
    while [ $i -lt 10 ]; do
        if ! is_port_in_use "$NGINX_PORT" && ! is_port_in_use "$API_PORT" && ! is_port_in_use "$PG_PORT"; then
            return 0
        fi
        i=$((i + 1))
        sleep 1
    done
    return 1
}

# A Windows terminal can disappear without terminating its WSL bash process.
# Remove only stale foreground launchers from this package before repairing a
# partial service state; otherwise their EXIT traps can stop the new services.
kill_stale_launchers() {
    command -v pgrep >/dev/null 2>&1 || return 0
    local pid cwd args
    for pid in $(pgrep -f 'bash[[:space:]]+start\.sh([[:space:]]|$)' 2>/dev/null || true); do
        [ "$pid" = "$$" ] && continue
        cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
        [ "$cwd" = "$SCRIPT_DIR" ] || continue
        args="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
        case " $args " in
            *" --status "*|*" --stop "*) continue ;;
        esac
        kill -9 "$pid" 2>/dev/null || true
        warn "Removed stale launcher process $pid from a closed terminal."
    done
}

# Check if a PostgreSQL instance on the given port requires authentication.
# Our own instance uses trust auth (no password); if a password is required,
# it means the port is occupied by a foreign PostgreSQL instance.
pg_port_is_foreign() {
    local port="$1"
    # Not listening at all 鈫?not foreign
    is_port_in_use "$port" || return 1
    # Server not accepting connections 鈫?not a PG instance we can test
    "$(pg_bin)/pg_isready" -h 127.0.0.1 -p "$port" -q 2>/dev/null || return 1
    # Attempt a passwordless query using -w (--no-password) so psql exits immediately
    # instead of waiting for interactive password input when auth is required
    ! "$(pg_bin)/psql" -w -h 127.0.0.1 -p "$port" -U "$PG_USER" -d postgres -tAc "SELECT 1" >/dev/null 2>&1
}

# Find an available PostgreSQL port: skip ports that are occupied OR running a foreign instance
# Usage: find_available_pg_port <base_port> <max_attempts>
find_available_pg_port() {
    local base="$1" max_attempts="${2:-1000}"
    local port="$base" attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if is_port_in_use "$port"; then
            if pg_port_is_foreign "$port"; then
                warn "Port $port (PostgreSQL) belongs to a foreign instance (requires password); trying $((port + 1)) ..."
            else
                warn "Port $port (PostgreSQL) is already in use; trying $((port + 1)) ..."
            fi
        else
            echo "$port"
            return 0
        fi
        port=$((port + 1))
        attempt=$((attempt + 1))
    done
    die 1010 "All ports $base-$((base + max_attempts - 1)) (PostgreSQL) are occupied or foreign; cannot start"
}

# Detect system DNS resolvers for nginx.
# Prefers non-loopback entries from /etc/resolv.conf (Linux/WSL),
# falls back to scutil --dns (macOS), then to public DNS as last resort.
detect_resolvers() {
    local resolvers=""
    if [ -r /etc/resolv.conf ]; then
        resolvers=$(grep -E '^nameserver' /etc/resolv.conf \
            | awk '{print $2}' \
            | grep -vE '^(127\.|::1$)' \
            | head -3 \
            | tr '\n' ' ')
    fi
    if [ -z "$resolvers" ] && [ "$(uname -s)" = "Darwin" ]; then
        resolvers=$(scutil --dns 2>/dev/null \
            | grep 'nameserver\[' \
            | awk '{print $3}' \
            | grep -vE '^(127\.|::1$)' \
            | sort -u \
            | head -3 \
            | tr '\n' ' ')
    fi
    if [ -z "$resolvers" ]; then
        resolvers="223.5.5.5 8.8.8.8"
    fi
    echo "$resolvers"
}

merge_or_link_asset_dir() {
    local src="$1" dest="$2" label="$3"
    [ -d "$src" ] || return 0
    if [ -e "$dest" ] && [ ! -d "$dest" ]; then
        warn "Cannot use misplaced asset folder '$label': target exists and is not a directory: $dest"
        return 0
    fi

    mkdir -p "$dest" 2>/dev/null || true
    if cp -an "$src/." "$dest/" 2>/dev/null; then
        warn "Detected misplaced asset folder '$label'; merged missing files into frontend/dist/img/arkham."
    else
        warn "Detected misplaced asset folder '$label', but automatic merge failed. Move it to: game/frontend/dist/img/arkham/$label"
    fi
}

prepare_local_assets() {
    local asset_root="$SCRIPT_DIR/frontend/dist/img/arkham"
    local pkg_root="$SCRIPT_DIR/.."
    local name

    [ -d "$asset_root" ] || return 0

    if [ -d "$pkg_root/img/arkham" ]; then
        warn "Detected root-level img/arkham assets; merging missing files into game/frontend/dist/img/arkham."
        cp -an "$pkg_root/img/arkham/." "$asset_root/" 2>/dev/null || true
    fi
    if [ -d "$SCRIPT_DIR/img/arkham" ]; then
        warn "Detected game/img/arkham assets; merging missing files into frontend/dist/img/arkham."
        cp -an "$SCRIPT_DIR/img/arkham/." "$asset_root/" 2>/dev/null || true
    fi

    for name in portraits boxes sets customizations encounter-sets mini-cards tarot seals extra backs ui classes keys lola slots arrows; do
        merge_or_link_asset_dir "$pkg_root/$name" "$asset_root/$name" "$name"
        merge_or_link_asset_dir "$SCRIPT_DIR/$name" "$asset_root/$name" "$name"
    done
}

generate_nginx_conf() {
    local conf="$SCRIPT_DIR/config/nginx.conf"
    local frontend_root="$SCRIPT_DIR/frontend/dist"
    local pkg_root="$SCRIPT_DIR/.."
    local dns_resolvers
    dns_resolvers="$(detect_resolvers)"
    cat > "$conf" << NGINX_EOF
worker_processes auto;
pid "$NGINX_PID";
error_log "$NGINX_LOG_DIR/error.log" warn;
events { worker_connections 256; }
http {
  # Keep the Windows package independent of an extracted mime.types file.
  # Some archive tools or partial updates leave that file stale/inaccessible,
  # which makes browsers reject JavaScript or ignore all CSS.
  types {
    text/html html htm shtml;
    text/css css;
    text/plain txt;
    text/xml xml;
    application/javascript js mjs;
    application/json json;
    application/wasm wasm;
    application/pdf pdf;
    application/zip zip;
    image/avif avif;
    image/gif gif;
    image/jpeg jpeg jpg;
    image/png png;
    image/svg+xml svg svgz;
    image/webp webp;
    image/x-icon ico;
    font/ttf ttf;
    font/otf otf;
    font/woff woff;
    font/woff2 woff2;
    audio/mpeg mp3;
    audio/ogg ogg;
    video/mp4 mp4;
    video/webm webm;
  }
  default_type application/octet-stream;
  access_log "$NGINX_LOG_DIR/access.log";
  sendfile on;
  keepalive_timeout 65;
  client_body_temp_path "$DATA_DIR/nginx_temp";
  proxy_temp_path       "$DATA_DIR/nginx_temp";
  map \$http_upgrade \$connection_upgrade { default upgrade; '' close; }
  server {
    listen $NGINX_PORT;
    server_name localhost 127.0.0.1;
    client_max_body_size 5M;
    # Critical JS and CSS locations also carry route-local MIME maps. This is
    # deliberately redundant: a partial update must not produce a blank or
    # completely unstyled page in strict browsers.
    location ~* ^/build/.*\.(js|mjs)$ {
      root "$SCRIPT_DIR";
      types { application/javascript js mjs; }
      default_type application/javascript;
      add_header Cache-Control "no-store" always;
      add_header X-Content-Type-Options "nosniff" always;
      try_files \$uri =404;
    }
    location ~* ^/build/.*\.css$ {
      root "$SCRIPT_DIR";
      types { text/css css; }
      default_type text/css;
      add_header Cache-Control "no-store" always;
      add_header X-Content-Type-Options "nosniff" always;
      try_files \$uri =404;
    }
    location ~* ^/(assets/.*|[^/]+)\.(js|mjs)$ {
      root "$frontend_root";
      types { application/javascript js mjs; }
      default_type application/javascript;
      add_header Cache-Control "no-store, no-cache, must-revalidate" always;
      add_header Pragma "no-cache" always;
      add_header Expires "0" always;
      add_header X-Content-Type-Options "nosniff" always;
      try_files \$uri =404;
    }
    location ~* ^/(assets/.*|[^/]+)\.css$ {
      root "$frontend_root";
      types { text/css css; }
      default_type text/css;
      add_header Cache-Control "no-store, no-cache, must-revalidate" always;
      add_header Pragma "no-cache" always;
      add_header Expires "0" always;
      add_header X-Content-Type-Options "nosniff" always;
      try_files \$uri =404;
    }
    location = /index.html {
      root "$frontend_root";
      add_header Cache-Control "no-store, no-cache, must-revalidate" always;
      add_header Pragma "no-cache" always;
      add_header Expires "0" always;
      try_files /index.html =404;
    }
    location / {
      root "$frontend_root";
      add_header Cache-Control "no-store, no-cache, must-revalidate" always;
      add_header Pragma "no-cache" always;
      add_header Expires "0" always;
      try_files \$uri \$uri/ /index.html;
    }
    location = /build {
      return 302 /build/;
    }
    location ~ ^/(deck|card|browse|search|settings|rules|share|decklists|collection-stats|install-fan-made-content)(/.*)?$ {
      return 302 /build\$request_uri;
    }
    location = /build/index.html {
      root "$SCRIPT_DIR";
      add_header Cache-Control "no-store, no-cache, must-revalidate" always;
      add_header Pragma "no-cache" always;
      add_header Expires "0" always;
      try_files /build/index.html =404;
    }
    location /build/ {
      root "$SCRIPT_DIR";
      add_header Cache-Control "no-store, no-cache, must-revalidate" always;
      add_header Pragma "no-cache" always;
      add_header Expires "0" always;
      try_files \$uri \$uri/ /build/index.html;
    }
    location /build-api/ {
      root "$SCRIPT_DIR";
      default_type application/json;
      try_files \$uri =404;
    }
    # Card image routing:
    # 1. user cards/
    # 2. user cards_en/
    # 3. built-in frontend/dist/img/arkham/{lang}/cards/
    # 4. built-in frontend/dist/img/arkham/cards/
    # 5. CDN fallback
    location ~ ^/img/arkham/(?<request_lang>zh|fr|es|ko)/cards/(?<card_path>.+)$ {
      root "$pkg_root";
      try_files /cards/\$card_path
                /cards_en/\$card_path
                /game/frontend/dist/img/arkham/\$request_lang/cards/\$card_path
                /game/frontend/dist/img/arkham/cards/\$card_path
                @img_cdn;
    }
    location ~ ^/img/arkham/ita/cards/(?<card_path>.+)$ {
      root "$pkg_root";
      try_files /cards/\$card_path
                /cards_en/\$card_path
                /game/frontend/dist/img/arkham/ita/cards/\$card_path
                /game/frontend/dist/img/arkham/cards/\$card_path
                @img_cdn;
    }
    location ~ ^/img/arkham/cards/(?<card_path>.+)$ {
      root "$pkg_root";
      try_files /cards/\$card_path
                /cards_en/\$card_path
                /game/frontend/dist/img/arkham/cards/\$card_path
                @img_cdn;
    }
    # Localized non-card arkham images (e.g. /img/arkham/fr/tarot/tarot-0.jpg):
    # Priority: user cards/{path} > cards_en/{path} > dist/{lang}/{path} > dist/{path} > CDN
    location ~ ^/img/arkham/(?<request_lang>zh|fr|es|ko|ita)/(?<img_path>.+)$ {
      root "$pkg_root";
      try_files /cards/\$img_path
                /cards_en/\$img_path
                /game/frontend/dist/img/arkham/\$request_lang/\$img_path
                /game/frontend/dist/img/arkham/\$img_path
                @img_cdn;
    }
    # All other arkham images (portraits, boxes, sets, tarot, encounter-sets, root-level, etc.):
    # Priority: user cards/{path} > cards_en/{path} > dist/{path} > CDN
    location ~ ^/img/arkham/(?<img_path>.+)$ {
      root "$pkg_root";
      try_files /cards/\$img_path
                /cards_en/\$img_path
                /game/frontend/dist/img/arkham/\$img_path
                @img_cdn;
    }
    # Non-arkham images (e.g. /img/icons/favicon.ico)
    location /img/ {
      root "$frontend_root";
      try_files \$uri @img_cdn;
    }
    location @img_cdn {
      # Use a variable so nginx resolves the hostname at request time, not at startup.
      # This prevents nginx from failing to start when DNS is unavailable (e.g. offline WSL).
      set \$cdn_upstream "http://assets.arkhamhorror.app";
      resolver $dns_resolvers valid=300s ipv6=off;
      resolver_timeout 5s;
      expires 10m;
      add_header Server-Timing "cdn" always;
      proxy_pass \$cdn_upstream\$request_uri;
      proxy_set_header Host assets.arkhamhorror.app;
    }
    location /api {
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header Host \$http_host;
      proxy_redirect off;
      proxy_pass http://127.0.0.1:$API_PORT;
      proxy_set_header X-Real-IP \$remote_addr;
      proxy_http_version 1.1;
      proxy_set_header Upgrade \$http_upgrade;
      proxy_set_header Connection \$connection_upgrade;
    }
    location /health {
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header Host \$http_host;
      proxy_redirect off;
      proxy_pass http://127.0.0.1:$API_PORT;
      proxy_set_header X-Real-IP \$remote_addr;
      proxy_http_version 1.1;
      proxy_set_header Upgrade \$http_upgrade;
      proxy_set_header Connection \$connection_upgrade;
    }
  }
}
NGINX_EOF
}

repair_running_frontend_assets() {
    frontend_static_assets_ready && return 0

    warn "The running web server has invalid or missing frontend assets; repairing its configuration now ..."
    generate_nginx_conf
    sync 2>/dev/null || true

    if ! "$SCRIPT_DIR/bin/nginx" -e "$NGINX_LOG_DIR/error.log" \
        -c "$SCRIPT_DIR/config/nginx.conf" -t >/dev/null 2>&1; then
        warn "The repaired nginx configuration did not pass validation"
        return 1
    fi
    if ! "$SCRIPT_DIR/bin/nginx" -e "$NGINX_LOG_DIR/error.log" \
        -c "$SCRIPT_DIR/config/nginx.conf" -s reload >/dev/null 2>&1; then
        warn "Unable to reload nginx with the repaired static-asset configuration"
        return 1
    fi

    local tries=0
    while [ "$tries" -lt 15 ]; do
        frontend_static_assets_ready && {
            info "Frontend JavaScript and stylesheet delivery repaired."
            return 0
        }
        tries=$((tries + 1))
        sleep 0.2
    done

    warn "Frontend static-asset validation still fails after reloading nginx"
    return 1
}

# 鈹€鈹€ Stop 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
do_stop() {
    info "Stopping services ..."

    # --- nginx ---
    if is_nginx_running; then
        local nginx_pid
        nginx_pid="$(cat "$NGINX_PID" 2>/dev/null || echo "")"
        "$SCRIPT_DIR/bin/nginx" -e "$NGINX_LOG_DIR/error.log" \
            -c "$SCRIPT_DIR/config/nginx.conf" -s stop 2>/dev/null || true
        [ -n "$nginx_pid" ] && wait_pid_exit "$nginx_pid" "nginx" 5
        info "nginx stopped"
    fi
    # Port-based fallback: clean up leftover nginx when the PID file is missing
    if is_port_in_use "$NGINX_PORT"; then
        kill_port_holder "$NGINX_PORT" "nginx"
    fi
    rm -f "$NGINX_PID"

    # --- arkham-api ---
    if is_api_running; then
        local api_pid
        api_pid="$(cat "$API_PID_FILE" 2>/dev/null || echo "")"
        kill "$api_pid" 2>/dev/null || true
        [ -n "$api_pid" ] && wait_pid_exit "$api_pid" "arkham-api" 5
        info "arkham-api stopped"
    fi
    if is_port_in_use "$API_PORT"; then
        kill_port_holder "$API_PORT" "arkham-api"
    fi
    rm -f "$API_PID_FILE"

    # Export the logical backup while PostgreSQL is still running and the backend is already stopped.
    backup_database_dump || true

    # --- PostgreSQL ---
    if [ -f "$PG_DATA/postmaster.pid" ]; then
        # -m fast: roll back active transactions and disconnect clients; -w: wait for shutdown to complete
        pg_ctl -D "$PG_DATA" -m fast -w stop 2>/dev/null || true
        info "PostgreSQL stopped"
    fi
    if is_port_in_use "$PG_PORT"; then
        kill_port_holder "$PG_PORT" "postgresql"
    fi
    # Clean up leftover PostgreSQL PID and socket files
    rm -f "$PG_DATA/postmaster.pid" 2>/dev/null
    rm -f "$PG_SOCKET_DIR/.s.PGSQL.${PG_PORT}" 2>/dev/null
    rm -f "$PG_SOCKET_DIR/.s.PGSQL.${PG_PORT}.lock" 2>/dev/null

    # Clear runtime logs after a normal shutdown (keep them when startup fails for troubleshooting)
    if [ "$_STARTUP_SUCCEEDED" = "1" ]; then
        for f in "$PG_LOG" \
                 "$DATA_DIR/initdb.log" \
                 "$DATA_DIR/psql.log" \
                 "$PG_DUMP_LOG" \
                 "$PG_RESTORE_LOG" \
                 "$DATA_DIR/arkham-api.log" \
                 "$NGINX_LOG_DIR/error.log" \
                 "$NGINX_LOG_DIR/access.log"; do
            [ -f "$f" ] && :> "$f"
        done
    fi

    # --- Final verification: ensure all ports have been released ---
    local still_occupied=""
    is_port_in_use "$NGINX_PORT" && still_occupied="${still_occupied} ${NGINX_PORT}(nginx)"
    is_port_in_use "$API_PORT"   && still_occupied="${still_occupied} ${API_PORT}(api)"
    is_port_in_use "$PG_PORT"    && still_occupied="${still_occupied} ${PG_PORT}(pg)"
    if [ -n "$still_occupied" ]; then
        warn "[4004] These ports are still in use:${still_occupied}; attempting forced cleanup with SIGKILL ..."
        is_port_in_use "$NGINX_PORT" && kill_port_holder "$NGINX_PORT" "nginx"
        is_port_in_use "$API_PORT"   && kill_port_holder "$API_PORT" "arkham-api"
        is_port_in_use "$PG_PORT"    && kill_port_holder "$PG_PORT" "postgresql"
    fi

    # WSL/NTFS: file handles may linger briefly after process exit, so wait a bit
    if grep -qi microsoft /proc/version 2>/dev/null; then
        sleep 1
    fi

    info "All services stopped."
}

# 鈹€鈹€ Status 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
do_status() {
    echo ""
    printf '%sService Status%s\n\n' "$BOLD" "$RESET"
    if is_pg_running; then
        printf '  %s[OK]%s PostgreSQL   %sRunning%s (Port %s, PID %s)\n' "$GREEN" "$RESET" "$GREEN" "$RESET" "$PG_PORT" "$(get_pg_pid)"
    else
        printf '  %s[--]%s PostgreSQL   %sStopped%s\n' "$RED" "$RESET" "$RED" "$RESET"
    fi
    if is_api_running; then
        printf '  %s[OK]%s arkham-api   %sRunning%s (Port %s, PID %s)\n' "$GREEN" "$RESET" "$GREEN" "$RESET" "$API_PORT" "$(get_api_pid)"
    else
        printf '  %s[--]%s arkham-api   %sStopped%s\n' "$RED" "$RESET" "$RED" "$RESET"
    fi
    if is_nginx_running; then
        printf '  %s[OK]%s nginx        %sRunning%s (Port %s, PID %s)\n' "$GREEN" "$RESET" "$GREEN" "$RESET" "$NGINX_PORT" "$(get_nginx_pid)"
    else
        printf '  %s[--]%s nginx        %sStopped%s\n' "$RED" "$RESET" "$RED" "$RESET"
    fi
    echo ""
}

do_repair_frontend() {
    generate_nginx_conf
    if is_nginx_running; then
        repair_running_frontend_assets || die 4180 "Frontend resource repair failed" "$NGINX_LOG_DIR/error.log"
    else
        local frontend_root="$SCRIPT_DIR/frontend/dist" index_file="$SCRIPT_DIR/frontend/dist/index.html"
        local build_index="$SCRIPT_DIR/build/index.html" entry_js entry_css build_js build_css
        entry_js="$(grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' "$index_file" 2>/dev/null | head -1 || true)"
        entry_css="$(grep -oE '/assets/index-[A-Za-z0-9_-]+\.css' "$index_file" 2>/dev/null | head -1 || true)"
        build_js="$(grep -oE '/build/assets/index\.[A-Za-z0-9_-]+\.js' "$build_index" 2>/dev/null | head -1 || true)"
        build_css="$(grep -oE '/build/assets/index\.[A-Za-z0-9_-]+\.css' "$build_index" 2>/dev/null | head -1 || true)"
        [ -s "$index_file" ] && [ -s "$frontend_root$entry_js" ] && [ -s "$frontend_root$entry_css" ] \
            && [ -s "$SCRIPT_DIR$build_js" ] && [ -s "$SCRIPT_DIR$build_css" ] \
            || die 4181 "Frontend resources are missing or incomplete"
        "$SCRIPT_DIR/bin/nginx" -e "$NGINX_LOG_DIR/error.log" -c "$SCRIPT_DIR/config/nginx.conf" -t >/dev/null 2>&1 \
            || die 4182 "The repaired nginx configuration is invalid" "$NGINX_LOG_DIR/error.log"
    fi
    info "Frontend MIME configuration and entry resources are valid."
}

# 鈹€鈹€ Initialize database 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
init_database() {
    info "First run detected, initializing database ..."
    ensure_dir "$DATA_DIR"
    rm -f "$PG_LOG" "$DATA_DIR/psql.log" "$DATA_DIR/initdb.log" "$PG_RESTORE_LOG" 2>/dev/null || true
    ensure_dir "$PG_DATA"
    "$(pg_bin)/initdb" -D "$PG_DATA" -U "$PG_USER" --no-locale -E UTF8 \
        > "$DATA_DIR/initdb.log" 2>&1 \
        || die 2003 "initdb initialization failed" "$DATA_DIR/initdb.log"

    cat > "$PG_DATA/pg_hba.conf" << HBA_EOF
local   all   all                 trust
host    all   all   127.0.0.1/32  trust
host    all   all   ::1/128       trust
HBA_EOF

    cat >> "$PG_DATA/postgresql.conf" << PG_CONF_EOF

port = $PG_PORT
unix_socket_directories = '$PG_SOCKET_DIR'
listen_addresses = '127.0.0.1'
PG_CONF_EOF

    info "Database schema initialization complete."
}

# 鈹€鈹€ Start 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
do_start() {
    # Record start time. GNU date supports %N (nanoseconds); macOS date does not, falls back to integer seconds.
    local _start_epoch; _start_epoch="$(date +%s.%N 2>/dev/null)"; _start_epoch="${_start_epoch/N/0}"
    [ -x "$SCRIPT_DIR/bin/arkham-api" ] || die 1002 "bin/arkham-api not found"
    [ -x "$SCRIPT_DIR/bin/nginx" ]      || die 1003 "bin/nginx not found"
    [ -d "$SCRIPT_DIR/pgsql/bin" ]      || die 1004 "pgsql/bin/ not found"
    [ -d "$SCRIPT_DIR/frontend/dist" ]  || die 1005 "frontend/dist/ not found"
    [ -f "$SCRIPT_DIR/build/index.html" ] || die 1006 "build/index.html not found"
    [ -d "$SCRIPT_DIR/build-api/v1" ]     || die 1007 "build-api/v1 not found"

    if is_nginx_running || is_api_running || is_pg_running \
       || is_port_in_use "$NGINX_PORT" || is_port_in_use "$API_PORT" || is_port_in_use "$PG_PORT"; then
        warn "Detected occupied services or ports; cleaning up first ..."
        kill_stale_launchers
        do_stop
        if ! wait_for_configured_ports_to_free; then
            die 2011 "Configured ports are still occupied after cleanup; WSL restart required"
        fi
    fi

    # Enable cleanup protection: from here until startup fully succeeds, any abnormal exit triggers do_stop automatically
    _CLEANUP_ON_EXIT=1

    # macOS: sign all binaries + clear quarantine (only performed at startup)
    ensure_macos_signing

    ensure_dir "$DATA_DIR"

    # 1. PostgreSQL
    # Store pgdata under the OS user data directory to avoid WSL/NTFS permission issues.
    # Restore from logical backup when the live cluster is missing or invalid.
    ensure_dir "$PGDATA_OS_PARENT" || die 2001 "Unable to create user data directory"
    ensure_dir "$BACKUP_DIR"

    if ! acquire_start_lock; then
        wait_for_existing_startup || die 2010 "Another startup is already in progress"
        _CLEANUP_ON_EXIT=0
        return 0
    fi

    # 鈹€鈹€ Handle force_init.dump: forced re-initialization from a user-supplied dump 鈹€鈹€
    local FORCE_INIT_DUMP="$BACKUP_DIR/force_init.dump"
    local is_fresh=0
    if [ -f "$FORCE_INIT_DUMP" ]; then
        info "Detected force_init.dump; will re-initialize the database cluster ..."

        # If the current cluster is valid, export a backup as old.dump before destroying it
        if cluster_is_valid "$PG_DATA"; then
            info "Backing up current cluster before forced re-initialization ..."
            # Temporarily start PostgreSQL to perform the backup
            start_postgres
            if database_exists; then
                local OLD_DUMP="$BACKUP_DIR/old.dump"
                rm -f "$OLD_DUMP" 2>/dev/null || true
                if pg_dump_cmd -d "$PG_DB" -Fc -f "$OLD_DUMP" > "$PG_DUMP_LOG" 2>&1 \
                   && dump_file_is_valid "$OLD_DUMP"; then
                    info "Current database backed up to $OLD_DUMP"
                else
                    warn "Failed to back up current database (continuing with forced init anyway)"
                    rm -f "$OLD_DUMP" 2>/dev/null || true
                fi
            fi
            pg_ctl -D "$PG_DATA" -m fast -w stop 2>/dev/null || true
        fi

        # Destroy existing cluster
        cleanup_invalid_cluster "$PG_DATA"

        if dump_file_is_valid "$FORCE_INIT_DUMP"; then
            # Restore from force_init.dump
            if restore_database_from_dump "$FORCE_INIT_DUMP"; then
                info "Forced initialization from force_init.dump complete."
            else
                warn "Restore from force_init.dump failed; falling back to fresh initialization ..."
                pg_ctl -D "$PG_DATA" -m immediate stop 2>/dev/null || true
                cleanup_invalid_cluster "$PG_DATA"
                init_database
                is_fresh=1
            fi
        else
            warn "force_init.dump is invalid; starting fresh initialization ..."
            init_database
            is_fresh=1
        fi

        # Remove force_init.dump after processing (one-shot trigger)
        rm -f "$FORCE_INIT_DUMP" 2>/dev/null || true
        date +%s > "$VERSION_FILE"
        date +%s > "$VERSION_FILE_LOCAL"
    fi

    if [ "$is_fresh" != "1" ] && ! cluster_is_valid "$PG_DATA"; then
        [ -e "$PG_DATA" ] && cleanup_invalid_cluster "$PG_DATA"

        local restored=0
        # Try latest.dump first, then fall back to previous.dump
        for _dump_candidate in "$PG_DUMP_FILE" "$PG_DUMP_PREV"; do
            [ "$restored" = "1" ] && break
            if dump_file_is_valid "$_dump_candidate"; then
                if restore_database_from_dump "$_dump_candidate"; then
                    restored=1
                else
                    warn "Restore from $(basename "$_dump_candidate") failed; cleaning up ..."
                    # Stop PG if it was started during the failed restore, then wipe the broken cluster
                    pg_ctl -D "$PG_DATA" -m immediate stop 2>/dev/null || true
                    cleanup_invalid_cluster "$PG_DATA"
                fi
            fi
        done

        if [ "$restored" = "0" ]; then
            if cluster_is_valid "$PGDATA_LOCAL"; then
                info "Legacy physical backup detected; migrating it to the user data directory ..."
                cp -a "$PGDATA_LOCAL" "$PG_DATA" || die 2002 "Old data migration failed"
                date +%s > "$VERSION_FILE"
                date +%s > "$VERSION_FILE_LOCAL"
            else
                init_database
                is_fresh=1
                date +%s > "$VERSION_FILE"
                date +%s > "$VERSION_FILE_LOCAL"
            fi
        fi
    fi

    # Check and repair pgdata permissions (PostgreSQL requires 0700 or 0750)
    local pg_perms
    if [ "$(uname -s)" = "Darwin" ]; then
        pg_perms="$(stat -f '%Lp' "$PG_DATA" 2>/dev/null || echo "000")"
    else
        pg_perms="$(stat -c '%a' "$PG_DATA" 2>/dev/null || echo "000")"
    fi
    if [ "$pg_perms" != "700" ] && [ "$pg_perms" != "750" ]; then
        warn "pgdata permissions are invalid ($pg_perms); fixing to 0700 ..."
        chmod 700 "$PG_DATA" 2>/dev/null || true
        find "$PG_DATA" -type d -exec chmod 700 {} \; 2>/dev/null || true
        find "$PG_DATA" -type f -exec chmod 600 {} \; 2>/dev/null || true
    fi

    # Keep PostgreSQL aligned with the configured port after a manual port change.
    # Older launchers changed PG_PORT without updating postgresql.conf, then waited forever
    # on a port PostgreSQL was not actually using.
    if [ "$(uname -s)" = "Darwin" ]; then
        sed -i '' "s|^[[:space:]]*port[[:space:]]*=.*|port = $PG_PORT|" "$PG_DATA/postgresql.conf"
        sed -i '' "s|^[[:space:]]*unix_socket_directories[[:space:]]*=.*|unix_socket_directories = '$PG_SOCKET_DIR'|" "$PG_DATA/postgresql.conf"
    else
        sed -i "s|^[[:space:]]*port[[:space:]]*=.*|port = $PG_PORT|" "$PG_DATA/postgresql.conf"
        sed -i "s|^[[:space:]]*unix_socket_directories[[:space:]]*=.*|unix_socket_directories = '$PG_SOCKET_DIR'|" "$PG_DATA/postgresql.conf"
    fi

    # Unified PostgreSQL startup (restore_database_from_dump starts PostgreSQL already)
    start_postgres

    # Create the database on the first run of a fresh cluster only
    if [ "$is_fresh" = "1" ]; then
        info "Creating database ..."
        psql_cmd -d postgres -c "CREATE DATABASE \"$PG_DB\";" \
            > "$DATA_DIR/psql.log" 2>&1 \
            || die 2006 "Failed to create database" "$DATA_DIR/psql.log"
        psql_cmd -d "$PG_DB" -f "$DATA_DIR/setup.sql" \
            >> "$DATA_DIR/psql.log" 2>&1 \
            || die 2007 "Schema import failed" "$DATA_DIR/psql.log"
        info "Database initialization complete."
    fi

    # Recovery check: ensure the database exists (prevents retries from skipping DB creation after a first-run failure)
    if ! database_exists; then
        info "Database $PG_DB does not exist; recreating it ..."
        psql_cmd -d postgres -c "CREATE DATABASE \"$PG_DB\";" \
            >> "$DATA_DIR/psql.log" 2>&1 \
            || die 2006 "Failed to create database" "$DATA_DIR/psql.log"
        psql_cmd -d "$PG_DB" -f "$DATA_DIR/setup.sql" \
            >> "$DATA_DIR/psql.log" 2>&1 \
            || die 2007 "Schema import failed" "$DATA_DIR/psql.log"
        info "Database recreation complete."
    fi

    ensure_epic_schema || die 2007 "Epic multiplayer schema migration failed" "$DATA_DIR/psql.log"

    # 2. arkham-api
    info "Starting backend API ..."
    export DATABASE_URL="postgres://${PG_USER}@127.0.0.1:${PG_PORT}/${PG_DB}"
    export PORT="$API_PORT"
    export PGHOST="127.0.0.1" PGPORT="$PG_PORT" PGSSLMODE="disable"
    # Auto-detect: use local relative paths when local images exist; fall back to the CDN otherwise (same behavior as web-entrypoint.sh)
    if [ -z "${ASSET_HOST+x}" ]; then
      if [ -n "$(ls -A "$SCRIPT_DIR/frontend/dist/img" 2>/dev/null)" ]; then
        export ASSET_HOST=""
      else
        export ASSET_HOST="https://assets.arkhamhorror.app"
      fi
    fi
    # nohup prevents SIGHUP; redirect stdout/stderr to log files so SIGPIPE cannot kill the process when the pipe closes
    ( cd "$SCRIPT_DIR"; nohup "$SCRIPT_DIR/bin/arkham-api" >> "$DATA_DIR/arkham-api.log" 2>&1 & echo $! > "$API_PID_FILE" )

    local tries=0
    while ! api_health_ready; do
        tries=$((tries + 1)); [ "$tries" -gt 150 ] && die 3003 "Backend API startup timed out" "$DATA_DIR/arkham-api.log"; sleep 0.2
    done
    info "Backend API started (port $API_PORT, PID $(get_api_pid))"

    # 3. nginx
    info "Configuring and starting nginx ..."

    # Ensure user-facing card image directories exist (at pkg root, one level above game/)
    ensure_dir "$SCRIPT_DIR/../cards"
    ensure_dir "$SCRIPT_DIR/../cards_en"

    ensure_dir "$DATA_DIR/nginx_temp"
    prepare_local_assets
    generate_nginx_conf
    touch "$NGINX_LOG_DIR/error.log" "$NGINX_LOG_DIR/access.log" 2>/dev/null || true
    sync 2>/dev/null || true
    if ! "$SCRIPT_DIR/bin/nginx" -e "$NGINX_LOG_DIR/error.log" -c "$SCRIPT_DIR/config/nginx.conf" 2>&1; then
        die 3002 "nginx failed to start" "$NGINX_LOG_DIR/error.log"
    fi
    info "nginx started (port $NGINX_PORT, PID $(get_nginx_pid))"
    if ! frontend_static_assets_ready; then
        die 3007 "Frontend JavaScript or stylesheet validation failed" "$NGINX_LOG_DIR/error.log"
    fi

    # 鈹€鈹€ Post-start health check: wait 2 seconds, then verify all services are still alive 鈹€
    # Prevent a silent crash (for example, delayed termination by macOS Gatekeeper) from being treated as a successful startup
    sleep 0.5
    if ! is_pg_running;  then die 3004 "PostgreSQL crashed after startup" "$PG_LOG"; fi
    if ! is_api_running; then die 3005 "arkham-api crashed after startup" "$DATA_DIR/arkham-api.log"; fi
    if ! is_nginx_running; then die 3006 "nginx crashed after startup" "$NGINX_LOG_DIR/error.log"; fi

    # Startup succeeded completely; disable cleanup protection
    _CLEANUP_ON_EXIT=0
    _STARTUP_SUCCEEDED=1
    release_start_lock

    # WSL2 NAT needs a Windows port proxy; mirrored networking needs a Hyper-V
    # firewall rule. Configure the matching path before advertising a LAN URL.
    configure_windows_lan_access || true
    write_runtime_info || true

    echo ""
    printf '%s============================================%s\n' "$CYAN" "$RESET"
    printf '%s  Arkham Horror LCG Started!%s\n' "$BOLD" "$RESET"
    printf '%s============================================%s\n' "$CYAN" "$RESET"
    echo ""
    print_access_urls
    echo ""
    printf '  %-14s PID %-8s Port %s\n' "PostgreSQL" "$(get_pg_pid)" "$PG_PORT"
    printf '  %-14s PID %-8s Port %s\n' "arkham-api" "$(get_api_pid)" "$API_PORT"
    printf '  %-14s PID %-8s Port %s\n' "nginx" "$(get_nginx_pid)" "$NGINX_PORT"
    echo ""
    local pkg_name; pkg_name="$(basename "$(dirname "$SCRIPT_DIR")")"
    local dir_name; dir_name="$(basename "$SCRIPT_DIR")"
    printf '  Status: %sbash %s/%s/start.sh --status%s\n' "$CYAN" "$pkg_name" "$dir_name" "$RESET"
    printf '  Stop:   %sbash %s/%s/start.sh --stop%s\n' "$CYAN" "$pkg_name" "$dir_name" "$RESET"

    local _end_epoch; _end_epoch="$(date +%s.%N 2>/dev/null)"; _end_epoch="${_end_epoch/N/0}"
    local _elapsed; _elapsed="$(awk "BEGIN{printf \"%.1f\", ${_end_epoch} - ${_start_epoch}}")"
    printf '  Started in %s%ss%s\n' "$MAGENTA" "$_elapsed" "$RESET"
    echo ""

    # Open the browser automatically (silent; failure does not affect services)
    warn_localhost_fallback_if_needed
    open_browser "$(get_browser_url)"
}

# 鈹€鈹€ Foreground keepalive: keep the terminal window open and stop all services automatically when the window closes 鈹€
run_foreground() {
    # Graceful shutdown handler for HUP/INT/TERM signals.
    # When the terminal is already dead (e.g. Command+Q on macOS closes pty before
    # delivering SIGHUP), writing to stdout/stderr returns EIO. Under set -e this would
    # abort the handler before do_stop runs. Detect and redirect to avoid this.
    _on_exit_signal() {
        if ! : >/dev/tty 2>/dev/null; then
            # Terminal is gone; redirect all output to prevent EIO failures
            exec >/dev/null 2>&1
        fi
        info "Exit signal received, stopping all services ..."
        do_stop
        trap - EXIT
        close_terminal_window_if_needed
        exit 0
    }
    trap '_on_exit_signal' HUP INT TERM
    trap 'do_stop >/dev/null 2>&1 || true' EXIT

    echo ""
    printf '%s--------------------------------------------%s\n' "$CYAN" "$RESET"
    printf '  Keep this terminal window open to keep the services running.\n'
    printf '  Press %sCtrl+C%s or %sclose this window%s to stop all services automatically.\n' "$BOLD" "$RESET" "$BOLD" "$RESET"
    printf '%s--------------------------------------------%s\n' "$CYAN" "$RESET"
    echo ""

    # All platforms: poll /dev/tty every 5 seconds as a safety net.
    #
    # WSL:         Windows terminates wsl.exe without delivering any signal 鈥?polling
    #              is the ONLY cleanup mechanism.
    # macOS/Linux: SIGHUP is normally delivered on terminal close, but Command+Q or
    #              force-quit may bypass it. If SIGHUP works, the trap fires first and
    #              the poll never triggers; otherwise the poll catches it within 5s.
    #
    # Why not `read -t N </dev/tty`: bash's read -t uses alarm()/SIGALRM internally.
    # On WSL2 bash, when redirected from a pty device, SIGALRM can escape the internal
    # handler and kill the script (exit 142), breaking Start-ArkhamHorror.bat's retry logic.
    #
    # Cost: one fork(sleep) every 5s 鈥?negligible next to PG + API + nginx.
    while true; do
        sleep 5 || true
        if ! : < /dev/tty 2>/dev/null; then
            exec >/dev/null 2>&1
            info "Terminal disconnected (window closed), stopping all services ..."
            do_stop
            trap - EXIT
            exit 0
        fi
    done
}

# 鈹€鈹€ Argument parsing 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
# Ensure the runtime environment (library paths) is ready before any action; signing only happens for actual startup
configure_runtime_env

ACTION="start"
IMPORT_SQL_PATH=""
BACKUP_SAVE_PATH=""
RESTORE_SAVE_PATH=""
DELETE_ACCOUNT_IDS=""
ACCOUNT_EMAIL=""
ACCOUNT_PASSWORD=""
while [ $# -gt 0 ]; do
    case "$1" in
        --stop)   ACTION="stop"; shift ;;
        --status) ACTION="status"; shift ;;
        --import-sql)
            ACTION="import-sql"; shift
            [ $# -gt 0 ] || die 1098 "--import-sql requires a file path"
            IMPORT_SQL_PATH="$1"; shift ;;
        --reset-db) ACTION="reset-db"; shift ;;
        --list-accounts) ACTION="list-accounts"; shift ;;
        --delete-accounts)
            ACTION="delete-accounts"; shift
            [ $# -gt 0 ] || die 1098 "--delete-accounts requires comma-separated IDs"
            DELETE_ACCOUNT_IDS="$1"; shift ;;
        --set-account-password)
            ACTION="set-account-password"; shift
            [ $# -ge 2 ] || die 1098 "--set-account-password requires an email and a new password"
            ACCOUNT_EMAIL="$1"; ACCOUNT_PASSWORD="$2"; shift 2 ;;
        --repair-frontend) ACTION="repair-frontend"; shift ;;
        --backup-save)
            ACTION="backup-save"; shift
            [ $# -gt 0 ] || die 1098 "--backup-save requires a tar.gz output path"
            BACKUP_SAVE_PATH="$1"; shift ;;
        --restore-save)
            ACTION="restore-save"; shift
            [ $# -gt 0 ] || die 1098 "--restore-save requires a tar.gz file path"
            RESTORE_SAVE_PATH="$1"; shift ;;
        --help|-h)
            echo "Usage: bash start.sh [--stop|--status|--repair-frontend|--import-sql <file>|--reset-db|--list-accounts|--delete-accounts <id,id>|--set-account-password <email> <password>|--backup-save <file.tar.gz>|--restore-save <file.tar.gz>|--help]"; exit 0 ;;
        *) die 1099 "Unknown argument: $1" ;;
    esac
done

case "$ACTION" in
    start)
        # First check whether all services are already healthy and running
        if is_all_services_running; then
            if ! repair_running_frontend_assets; then
                warn "Automatic frontend repair failed; restarting the local services once ..."
                do_stop
                do_start
                run_foreground
                exit $?
            fi
            info "All services are already running."
            configure_windows_lan_access || true
            write_runtime_info || true
            echo ""
            printf '%s============================================%s\n' "$CYAN" "$RESET"
            printf '%s  Arkham Horror LCG (Already Running)%s\n' "$BOLD" "$RESET"
            printf '%s============================================%s\n' "$CYAN" "$RESET"
            echo ""
            print_access_urls
            echo ""
            printf '  %-14s PID %-8s Port %s\n' "PostgreSQL" "$(get_pg_pid)" "$PG_PORT"
            printf '  %-14s PID %-8s Port %s\n' "arkham-api" "$(get_api_pid)" "$API_PORT"
            printf '  %-14s PID %-8s Port %s\n' "nginx" "$(get_nginx_pid)" "$NGINX_PORT"
            echo ""
            printf '  This window will close automatically in 10 seconds.\n'
            echo ""
            warn_localhost_fallback_if_needed
            open_browser "$(get_browser_url)"
            sleep 10
            close_terminal_window_if_needed
            exit 10
        else
            do_start
            if [ "$_STARTED_BY_OTHER" = "1" ]; then
                echo ""
                printf '  Services are already running. This window will close automatically in 10 seconds.\n'
                echo ""
                warn_localhost_fallback_if_needed
                open_browser "$(get_browser_url)"
                sleep 10
                close_terminal_window_if_needed
                exit 10
            fi
            run_foreground
        fi
        ;;
    stop)   do_stop; write_runtime_info || true ;;
    status) do_status ;;
    repair-frontend) do_repair_frontend ;;
    import-sql) do_import_sql "$IMPORT_SQL_PATH" ;;
    reset-db) do_reset_db ;;
    list-accounts) do_list_accounts ;;
    delete-accounts) do_delete_accounts "$DELETE_ACCOUNT_IDS" ;;
    set-account-password) do_set_account_password "$ACCOUNT_EMAIL" "$ACCOUNT_PASSWORD" ;;
    backup-save) do_backup_save "$BACKUP_SAVE_PATH" ;;
    restore-save) do_restore_save "$RESTORE_SAVE_PATH" ;;
esac
