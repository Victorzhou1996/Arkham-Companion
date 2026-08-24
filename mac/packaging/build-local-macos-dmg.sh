#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
RUNTIME_DIR="${RUNTIME_DIR:-$ROOT_DIR/mac/release/ArkhamHorror-macos-arm64}"
BACKEND_BIN="${BACKEND_BIN:-$RUNTIME_DIR/bin/arkham-api}"
CARDS_DIR="${CARDS_DIR:-$ROOT_DIR/shared/cards}"
RELEASE_DATE="${RELEASE_DATE:-$(date +%Y%m%d)}"
APP_VERSION="${APP_VERSION:-1.0.1}"
RELEASE_NAME="Arkham-Horror-Local-App-macOS-arm64-${RELEASE_DATE}"
RELEASES_DIR="$ROOT_DIR/releases"
STAGING_DIR="$RELEASES_DIR/$RELEASE_NAME"
APP_DIR="$STAGING_DIR/Arkham Horror Local.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
MANAGER_APP_DIR="$STAGING_DIR/Arkham Horror 管理工具.app"
MANAGER_CONTENTS_DIR="$MANAGER_APP_DIR/Contents"
MANAGER_MACOS_DIR="$MANAGER_CONTENTS_DIR/MacOS"
MANAGER_RESOURCES_DIR="$MANAGER_CONTENTS_DIR/Resources"
PAYLOAD_DIR="$RESOURCES_DIR/Payload"
GAME_DIR="$PAYLOAD_DIR/game"
DMG_PATH="$RELEASES_DIR/$RELEASE_NAME.dmg"

if [ ! -x "$BACKEND_BIN" ]; then
  echo "Missing macOS backend: $BACKEND_BIN" >&2
  exit 1
fi
if [ ! -f "$RUNTIME_DIR/data/setup.sql" ]; then
  echo "Missing clean database schema: $RUNTIME_DIR/data/setup.sql" >&2
  exit 1
fi
if [ ! -d "$CARDS_DIR" ]; then
  echo "Missing card image directory: $CARDS_DIR" >&2
  exit 1
fi
if [ -e "$STAGING_DIR" ] || [ -e "$DMG_PATH" ]; then
  echo "Release output already exists: $RELEASE_NAME" >&2
  exit 1
fi

mkdir -p "$MACOS_DIR" "$GAME_DIR/data" "$MANAGER_MACOS_DIR" "$MANAGER_RESOURCES_DIR"

rsync -a \
  --exclude '.DS_Store' \
  --exclude 'bin/backups/' \
  --exclude 'data/' \
  --exclude 'config/nginx.conf' \
  --exclude 'pgsql/lib/pgxs/' \
  --exclude 'pgsql/lib/pkgconfig/' \
  --exclude 'pgsql/lib/*.a' \
  "$RUNTIME_DIR/" "$GAME_DIR/"

cp "$BACKEND_BIN" "$GAME_DIR/bin/arkham-api"

relocate_macho_dependency() {
  local binary="$1" dependency="$2" basename target=""
  basename="$(basename "$dependency")"

  case "$binary" in
    "$GAME_DIR/bin/"*)
      [ -e "$GAME_DIR/lib/$basename" ] && target="@loader_path/../lib/$basename"
      [ -z "$target" ] && [ -e "$GAME_DIR/pgsql/lib/$basename" ] && target="@loader_path/../pgsql/lib/$basename"
      ;;
    "$GAME_DIR/pgsql/bin/"*)
      [ -e "$GAME_DIR/pgsql/lib/$basename" ] && target="@loader_path/../lib/$basename"
      [ -z "$target" ] && [ -e "$GAME_DIR/lib/$basename" ] && target="@loader_path/../../lib/$basename"
      ;;
    "$GAME_DIR/pgsql/lib/"*)
      [ -e "$GAME_DIR/pgsql/lib/$basename" ] && target="@loader_path/$basename"
      [ -z "$target" ] && [ -e "$GAME_DIR/lib/$basename" ] && target="@loader_path/../../lib/$basename"
      ;;
    "$GAME_DIR/lib/"*)
      [ -e "$GAME_DIR/lib/$basename" ] && target="@loader_path/$basename"
      [ -z "$target" ] && [ -e "$GAME_DIR/pgsql/lib/$basename" ] && target="@loader_path/../pgsql/lib/$basename"
      ;;
  esac

  if [ -z "$target" ]; then
    echo "Cannot relocate dependency $dependency used by $binary" >&2
    exit 1
  fi
  install_name_tool -change "$dependency" "$target" "$binary"
}

while IFS= read -r -d '' binary; do
  file "$binary" | grep -q 'Mach-O' || continue
  while IFS= read -r dependency; do
    case "$dependency" in
      /Users/*|/opt/homebrew/*) relocate_macho_dependency "$binary" "$dependency" ;;
    esac
  done < <(otool -L "$binary" 2>/dev/null | tail -n +2 | awk '{print $1}')

  case "$binary" in
    *.dylib) install_name_tool -id "@rpath/$(basename "$binary")" "$binary" ;;
  esac
done < <(find "$GAME_DIR" -type f -print0)

while IFS= read -r -d '' binary; do
  file "$binary" | grep -q 'Mach-O' || continue
  if otool -L "$binary" 2>/dev/null | grep -Eq '^\s+(/Users/|/opt/homebrew/)'; then
    echo "Non-portable Mach-O dependency remains: $binary" >&2
    otool -L "$binary" >&2
    exit 1
  fi
  codesign --force --sign - "$binary"
done < <(find "$GAME_DIR" -type f -print0)

cp "$RUNTIME_DIR/data/setup.sql" "$GAME_DIR/data/setup.sql"

# Bundle the Chinese card library once. The local image override directories
# are created at install time and fall back to this built-in library.
BUNDLED_CARDS_DIR="$GAME_DIR/frontend/dist/img/arkham/zh/cards"
mkdir -p "$BUNDLED_CARDS_DIR"
rsync -a --delete --exclude '.DS_Store' "$CARDS_DIR/" "$BUNDLED_CARDS_DIR/"

for starter_deck_id in qewhl3Do4yFlzop DYKly6vcYWthFOi; do
  if ! LC_ALL=C grep -a -q "$starter_deck_id" "$GAME_DIR/bin/arkham-api"; then
    echo "Backend does not contain starter deck: $starter_deck_id" >&2
    exit 1
  fi
done

cat > "$MACOS_DIR/ArkhamHorrorLocal" <<'APP_LAUNCH_EOF'
#!/usr/bin/env bash
set -e
RESOURCES_DIR="$(cd "$(dirname "$0")/../Resources" && pwd)"
open -a Terminal "$RESOURCES_DIR/launch-runtime.command"
APP_LAUNCH_EOF

cat > "$RESOURCES_DIR/launch-runtime.command" <<LAUNCH_EOF
#!/usr/bin/env bash
set -euo pipefail

RESOURCES_DIR="\$(cd "\$(dirname "\$0")" && pwd)"
PAYLOAD_DIR="\$RESOURCES_DIR/Payload"
INSTALL_ROOT="\$HOME/Library/Application Support/ArkhamHorrorLocal"
RUNTIME_ROOT="\$INSTALL_ROOT/runtime"
VERSION_FILE="\$INSTALL_ROOT/installed-version"
PACKAGE_VERSION="$APP_VERSION-$RELEASE_DATE"

mkdir -p "\$INSTALL_ROOT" "\$RUNTIME_ROOT"
mkdir -p "\$RUNTIME_ROOT/cards" "\$RUNTIME_ROOT/cards_en"

if [ ! -f "\$VERSION_FILE" ] || [ "\$(cat "\$VERSION_FILE" 2>/dev/null || true)" != "\$PACKAGE_VERSION" ]; then
  printf '\\n[ARKHAM] 正在安装或更新本地运行环境，请稍候……\\n'
  rsync -a --exclude '.DS_Store' "\$PAYLOAD_DIR/" "\$RUNTIME_ROOT/"
  printf '%s\\n' "\$PACKAGE_VERSION" > "\$VERSION_FILE"
  xattr -cr "\$RUNTIME_ROOT" 2>/dev/null || true
  printf '[ARKHAM] 本地运行环境已准备完成。\\n\\n'
fi

cd "\$RUNTIME_ROOT/game"
exec bash start.sh
LAUNCH_EOF

cat > "$CONTENTS_DIR/Info.plist" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>zh_CN</string>
  <key>CFBundleDisplayName</key>
  <string>Arkham Horror Local</string>
  <key>CFBundleExecutable</key>
  <string>ArkhamHorrorLocal</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleIdentifier</key>
  <string>local.arkhamhorror.offline</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Arkham Horror Local</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$APP_VERSION</string>
  <key>CFBundleVersion</key>
  <string>$RELEASE_DATE</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST_EOF

cp "$ROOT_DIR/companion/app/Arkham Companion.app/Contents/Resources/AppIcon.icns" "$RESOURCES_DIR/AppIcon.icns"

cat > "$MANAGER_MACOS_DIR/ArkhamHorrorManager" <<'MANAGER_LAUNCH_EOF'
#!/usr/bin/env bash
set -e

MANAGER_COMMAND="$HOME/Library/Application Support/ArkhamHorrorLocal/runtime/game/管理工具.command"
if [ ! -f "$MANAGER_COMMAND" ]; then
  osascript -e 'display alert "尚未安装本地运行环境" message "请先启动一次 Arkham Horror Local，等待游戏页面打开后，再使用管理工具。" as warning'
  exit 0
fi

open -a Terminal "$MANAGER_COMMAND"
MANAGER_LAUNCH_EOF

cat > "$MANAGER_CONTENTS_DIR/Info.plist" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>zh_CN</string>
  <key>CFBundleDisplayName</key>
  <string>Arkham Horror 管理工具</string>
  <key>CFBundleExecutable</key>
  <string>ArkhamHorrorManager</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleIdentifier</key>
  <string>local.arkhamhorror.offline.manager</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Arkham Horror Manager</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$APP_VERSION</string>
  <key>CFBundleVersion</key>
  <string>$RELEASE_DATE</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST_EOF

cp "$ROOT_DIR/companion/app/Arkham Companion.app/Contents/Resources/AppIcon.icns" "$MANAGER_RESOURCES_DIR/AppIcon.icns"

cat > "$STAGING_DIR/使用说明.txt" <<'README_EOF'
Arkham Horror 本地部署应用版（macOS Apple Silicon）

这是完整的本地游玩版本：
- 游戏页面、规则后端、PostgreSQL 数据库和中文卡图均已内置。
- 游玩不依赖 Unkai、Online 或原作者服务器。
- 不需要安装 Docker、Homebrew、Haskell、Node.js 或 PostgreSQL。

安装与启动：
1. 将“Arkham Horror Local.app”和“Arkham Horror 管理工具.app”一起拖入“应用程序”。
2. 从启动台或“应用程序”中打开 Arkham Horror Local。
3. 第一次启动会复制并初始化本地运行环境，可能需要约 1-3 分钟。
4. Terminal 会保留运行日志，浏览器会自动打开 http://localhost:3000。
5. 游玩期间请保持 Terminal 窗口开启；关闭窗口会安全停止本地服务并备份存档。

管理工具：
- 完成第一次游戏启动后，可随时从启动台打开“Arkham Horror 管理工具”。
- 不再需要手动输入运行目录或查找 command 文件。

存档位置：
~/Library/Application Support/ArkhamHorror/

应用运行文件：
~/Library/Application Support/ArkhamHorrorLocal/runtime/

如果 macOS 阻止首次运行：
按住 Control 点击 App，选择“打开”，再确认一次。

注意：
- 本包仅支持 Apple Silicon（M1/M2/M3/M4 系列）Mac。
- 请不要直接在只读的 DMG 窗口内启动，先将 App 拖入“应用程序”。
README_EOF

chmod +x \
  "$MACOS_DIR/ArkhamHorrorLocal" \
  "$MANAGER_MACOS_DIR/ArkhamHorrorManager" \
  "$RESOURCES_DIR/launch-runtime.command" \
  "$GAME_DIR/start.sh" \
  "$GAME_DIR/macOS用户双击我.command" \
  "$GAME_DIR/管理工具.command"

ln -s /Applications "$STAGING_DIR/应用程序"

find "$STAGING_DIR" -name '.DS_Store' -delete
xattr -cr "$STAGING_DIR" 2>/dev/null || true
codesign --force --deep --sign - "$APP_DIR"
codesign --verify --deep --strict "$APP_DIR"
codesign --force --deep --sign - "$MANAGER_APP_DIR"
codesign --verify --deep --strict "$MANAGER_APP_DIR"

hdiutil create \
  -volname "Arkham Horror Local" \
  -srcfolder "$STAGING_DIR" \
  -ov \
  -format UDZO \
  -imagekey zlib-level=9 \
  "$DMG_PATH"

shasum -a 256 "$DMG_PATH" > "$DMG_PATH.sha256"
echo "$DMG_PATH"
