#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SAVE_FILE="${1:-}"
RUNTIME_ROOT="${2:-${ARKHAM_RUNTIME_ROOT:-$SCRIPT_DIR/../release}}"

if [[ -z "$SAVE_FILE" ]]; then
  printf 'Arkham JSON 存档路径: '
  read -r SAVE_FILE
fi

if [[ -z "$SAVE_FILE" || ! -f "$SAVE_FILE" ]]; then
  printf '找不到存档文件: %s\n' "$SAVE_FILE" >&2
  exit 1
fi

OUTPUT="$(python3 "$SCRIPT_DIR/save_history_viewer.py" "$SAVE_FILE" "$RUNTIME_ROOT")"
printf '操作记录页面已生成: %s\n' "$OUTPUT"

if command -v xdg-open >/dev/null 2>&1 && [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
  xdg-open "$OUTPUT" >/dev/null 2>&1 &
elif command -v gio >/dev/null 2>&1 && [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
  gio open "$OUTPUT" >/dev/null 2>&1 &
fi
