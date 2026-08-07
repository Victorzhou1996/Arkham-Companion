#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

clear
echo "Arkham Horror manual rebuild"
echo "Source: ${SCRIPT_DIR}"
echo "Default: frontend + complete Mac local package + Linux server backend"
echo "Docker Desktop starts automatically when the Linux stage begins."
echo ""

bash "${SCRIPT_DIR}/scripts/manual-rebuild.sh" "$@"
status=$?

echo ""
if [ "$status" -eq 0 ]; then
  echo "Build finished. The report path is shown above."
else
  echo "Build failed (exit code: ${status}). Check the failure report and log shown above."
fi
echo ""
read -r -p "Press Enter to close this window..." _
exit "$status"
