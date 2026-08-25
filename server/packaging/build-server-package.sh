#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
RELEASE_DATE="${RELEASE_DATE:-$(date +%Y%m%d)}"
RELEASE_NAME="Arkham-Horror-Server-Linux-amd64-${RELEASE_DATE}"
OUTPUT_ROOT="${OUTPUT_ROOT:-$ROOT_DIR/releases}"
STAGING_DIR="$OUTPUT_ROOT/$RELEASE_NAME"
ARCHIVE_PATH="$OUTPUT_ROOT/$RELEASE_NAME.tar.gz"

if [ -e "$STAGING_DIR" ] || [ -e "$ARCHIVE_PATH" ]; then
  echo "Release output already exists: $RELEASE_NAME" >&2
  exit 1
fi

mkdir -p "$STAGING_DIR" "$OUTPUT_ROOT"
rsync -a --exclude '.DS_Store' "$ROOT_DIR/server/release/" "$STAGING_DIR/runtime/"
rsync -a --exclude '.DS_Store' "$ROOT_DIR/server/sidecar/" "$STAGING_DIR/sidecar/"
rsync -a --exclude '.DS_Store' "$ROOT_DIR/server/deploy/" "$STAGING_DIR/deploy/"
rsync -a --exclude '.DS_Store' "$ROOT_DIR/server/linux/" "$STAGING_DIR/linux/"

cp "$ROOT_DIR/server/RELEASE-20260825.md" "$STAGING_DIR/PACKAGE-README.md"

(
  cd "$STAGING_DIR"
  find . -type f ! -name SHA256SUMS -print0 \
    | LC_ALL=C sort -z \
    | xargs -0 shasum -a 256 > SHA256SUMS
)

tar -czf "$ARCHIVE_PATH" -C "$OUTPUT_ROOT" "$RELEASE_NAME"
shasum -a 256 "$ARCHIVE_PATH" > "$ARCHIVE_PATH.sha256"
echo "$ARCHIVE_PATH"
