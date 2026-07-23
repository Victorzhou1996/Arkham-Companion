#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNTIME_DIR="${1:-/Users/yunke/Documents/VSCode/Arkham/ArkhamHorror-macos-arm64-build-20260709-120317}"
CARD_SOURCE="${2:-/Users/yunke/Documents/VSCode/Arkham/cards}"
MANIFEST_SOURCE="$RUNTIME_DIR/frontend/dist/card-image-index.json"
APP_NAME="Arkham Companion"
APP_DIR="$RUNTIME_DIR/$APP_NAME.app"
CONTENTS="$APP_DIR/Contents"
MACOS="$CONTENTS/MacOS"
RESOURCES="$CONTENTS/Resources"
ICON_SOURCE="$SCRIPT_DIR/AppIcon.png"

rm -rf "$APP_DIR"
mkdir -p "$MACOS" "$RESOURCES"
[ -f "$MANIFEST_SOURCE" ] || { echo "Missing manifest: $MANIFEST_SOURCE" >&2; exit 1; }
[ -d "$CARD_SOURCE" ] || { echo "Missing card images: $CARD_SOURCE" >&2; exit 1; }
[ -f "$ICON_SOURCE" ] || { echo "Missing app icon: $ICON_SOURCE" >&2; exit 1; }

xcrun swiftc \
  -parse-as-library \
  -O \
  -framework SwiftUI \
  -framework AppKit \
	  -framework Network \
	  -framework Security \
	  -framework WebKit \
  "$SCRIPT_DIR/ArkhamCompanion.swift" \
  -o "$MACOS/ArkhamCompanion"

cp "$MANIFEST_SOURCE" "$RESOURCES/card-image-index.json"
ditto "$CARD_SOURCE" "$RESOURCES/CardImages"

ICON_WORK_DIR="$(mktemp -d)"
ICONSET="$ICON_WORK_DIR/AppIcon.iconset"
mkdir -p "$ICONSET"
while read -r name size; do
  sips -z "$size" "$size" "$ICON_SOURCE" --out "$ICONSET/$name" >/dev/null
done <<'SIZES'
icon_16x16.png 16
icon_16x16@2x.png 32
icon_32x32.png 32
icon_32x32@2x.png 64
icon_128x128.png 128
icon_128x128@2x.png 256
icon_256x256.png 256
icon_256x256@2x.png 512
icon_512x512.png 512
icon_512x512@2x.png 1024
SIZES
iconutil -c icns "$ICONSET" -o "$RESOURCES/AppIcon.icns"
rm -rf "$ICON_WORK_DIR"

cat > "$CONTENTS/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>zh_CN</string>
  <key>CFBundleDisplayName</key>
  <string>Arkham Companion</string>
  <key>CFBundleExecutable</key>
  <string>ArkhamCompanion</string>
  <key>CFBundleIdentifier</key>
  <string>local.arkhamhorror.companion</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon.icns</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Arkham Companion</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.6.0</string>
  <key>CFBundleVersion</key>
  <string>8</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

chmod +x "$MACOS/ArkhamCompanion"
xattr -cr "$APP_DIR" 2>/dev/null || true

echo "Built: $APP_DIR"
