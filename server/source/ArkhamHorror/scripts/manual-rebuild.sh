#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKSPACE_ROOT="$(cd "${PROJECT_ROOT}/.." && pwd)"
TOOLCHAIN_DIR="${ARKHAM_TOOLCHAIN_DIR:-${WORKSPACE_ROOT}/toolchain}"
OUTPUT_ROOT="${ARKHAM_BUILD_OUTPUT_ROOT:-${PROJECT_ROOT}/build-artifacts}"
LOCAL_RUNTIME_TEMPLATE="${ARKHAM_LOCAL_RUNTIME_TEMPLATE:-$(dirname "${WORKSPACE_ROOT}")/ArkhamHorror-macos-arm64}"
CARD_IMAGE_SOURCE="${ARKHAM_CARD_IMAGE_SOURCE:-$(dirname "${WORKSPACE_ROOT}")/cards}"
BUILD_JOBS="${ARKHAM_BUILD_JOBS:-4}"

SKIP_TESTS=false
SKIP_MAC=false
SKIP_LINUX=false
PREFLIGHT_ONLY=false
NON_INTERACTIVE=false

usage() {
  cat <<'EOF'
Usage: ./manual-rebuild.command [options]

Options:
  --preflight-only  Check the environment without compiling.
  --skip-tests      Skip frontend tests and type checking.
  --skip-mac        Skip the native macOS backend build.
  --skip-linux      Skip the Linux amd64 server backend build.
  --yes             Do not ask for confirmation.
  --help            Show this help.

Environment overrides:
  ARKHAM_TOOLCHAIN_DIR       Existing local Stack/GHC toolchain directory.
  ARKHAM_BUILD_OUTPUT_ROOT   Directory that receives build artifacts.
  ARKHAM_LOCAL_RUNTIME_TEMPLATE
                              Existing complete Mac runtime used as the package skeleton.
                              It must include the Build app, Build cache, and Build routes.
  ARKHAM_CARD_IMAGE_SOURCE    Complete Chinese AVIF card image directory.
  ARKHAM_BUILD_JOBS          Backend compiler parallelism (default: 4).
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --preflight-only) PREFLIGHT_ONLY=true ;;
    --skip-tests) SKIP_TESTS=true ;;
    --skip-mac) SKIP_MAC=true ;;
    --skip-linux) SKIP_LINUX=true ;;
    --yes) NON_INTERACTIVE=true ;;
    --help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
  shift
done

TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
RUN_DIR="${OUTPUT_ROOT}/${TIMESTAMP}"
LOG_DIR="${RUN_DIR}/logs"
REPORT_FILE="${RUN_DIR}/REPORT.md"
START_EPOCH="$(date +%s)"
CURRENT_STAGE="Preflight"
CURRENT_LOG=""
RUN_STATUS="FAILED"
ACTIVE_PID=""

mkdir -p "$LOG_DIR"

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

sha256_file() {
  if has_cmd shasum; then
    shasum -a 256 "$1"
  else
    sha256sum "$1"
  fi
}

format_elapsed() {
  local seconds="$1"
  printf '%02d:%02d:%02d' "$((seconds / 3600))" "$(((seconds % 3600) / 60))" "$((seconds % 60))"
}

render_bar() {
  local percent="$1"
  local label="$2"
  local detail="${3:-}"
  local width=32
  local filled=$((percent * width / 100))
  local empty=$((width - filled))
  local left right
  left="$(printf '%*s' "$filled" '' | tr ' ' '#')"
  right="$(printf '%*s' "$empty" '' | tr ' ' '-')"
  printf '[%s%s] %3d%%  %s%s\n' "$left" "$right" "$percent" "$label" "$detail"
}

last_log_line() {
  local log_file="$1"
  [ -s "$log_file" ] || return 0
  tail -n 20 "$log_file" 2>/dev/null \
    | sed -e 's/^[[:space:]]*//' -e '/^$/d' \
    | tail -n 1 \
    | cut -c1-120
}

log_error_locations() {
  local log_file="$1"
  [ -s "$log_file" ] || return 0
  grep -E ':[0-9]+:[0-9]+: error:| error TS[0-9]+:' "$log_file" 2>/dev/null \
    | sed -E 's#^.*(/backend/|backend/)#backend/#' \
    | LC_ALL=C sort -u \
    || true
}

run_logged() {
  local label="$1"
  local start_percent="$2"
  local end_percent="$3"
  local estimate_seconds="$4"
  local log_file="$5"
  shift 5

  CURRENT_STAGE="$label"
  CURRENT_LOG="$log_file"
  render_bar "$start_percent" "$label" " (starting)"

  local stage_start elapsed span estimated_gain shown_percent latest rc
  stage_start="$(date +%s)"
  ("$@") >"$log_file" 2>&1 &
  ACTIVE_PID=$!

  while kill -0 "$ACTIVE_PID" 2>/dev/null; do
    sleep 5
    elapsed=$(($(date +%s) - stage_start))
    span=$((end_percent - start_percent))
    estimated_gain=$((elapsed * span / estimate_seconds))
    if [ "$estimated_gain" -ge "$span" ]; then
      estimated_gain=$((span - 1))
    fi
    if [ "$estimated_gain" -lt 0 ]; then
      estimated_gain=0
    fi
    shown_percent=$((start_percent + estimated_gain))
    latest="$(last_log_line "$log_file")"
    render_bar "$shown_percent" "$label" " | elapsed $(format_elapsed "$elapsed")${latest:+ | ${latest}}"
  done

  if wait "$ACTIVE_PID"; then
    rc=0
  else
    rc=$?
  fi
  ACTIVE_PID=""

  elapsed=$(($(date +%s) - stage_start))
  if [ "$rc" -ne 0 ]; then
    render_bar "$start_percent" "$label" " | FAILED after $(format_elapsed "$elapsed")"
    echo ""
    echo "Error locations found in the full log:" >&2
    log_error_locations "$log_file" >&2
    echo "" >&2
    echo "Last 80 log lines (${log_file}):" >&2
    tail -n 80 "$log_file" >&2 || true
    return "$rc"
  fi

  render_bar "$end_percent" "$label" " | done in $(format_elapsed "$elapsed")"
}

write_failure_report() {
  local exit_code="$1"
  local ended elapsed commit branch
  ended="$(date '+%Y-%m-%d %H:%M:%S %z')"
  elapsed=$(($(date +%s) - START_EPOCH))
  commit="$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
  branch="$(git -C "$PROJECT_ROOT" branch --show-current 2>/dev/null || echo unknown)"

  cat >"$REPORT_FILE" <<EOF
# Arkham Horror Manual Rebuild Report

- Status: **FAILED**
- Failed stage: ${CURRENT_STAGE}
- Exit code: ${exit_code}
- Finished: ${ended}
- Elapsed: $(format_elapsed "$elapsed")
- Source: ${PROJECT_ROOT}
- Branch: ${branch}
- Commit: ${commit}
- Relevant log: ${CURRENT_LOG:-none}

No runtime was replaced, no server was contacted, and no database or save file was changed.
EOF

  if [ -n "${CURRENT_LOG:-}" ] && [ -s "$CURRENT_LOG" ]; then
    {
      echo ""
      echo "## Error locations"
      echo ""
      echo '```text'
      log_error_locations "$CURRENT_LOG"
      echo '```'
    } >>"$REPORT_FILE"
  fi
}

on_exit() {
  local exit_code=$?
  if [ "$RUN_STATUS" != "SUCCEEDED" ]; then
    write_failure_report "$exit_code" || true
    echo ""
    echo "Failure report: ${REPORT_FILE}" >&2
  fi
}

terminate_process_tree() {
  local parent="$1" child
  while IFS= read -r child; do
    [ -n "$child" ] && terminate_process_tree "$child"
  done < <(pgrep -P "$parent" 2>/dev/null || true)
  kill -TERM "$parent" 2>/dev/null || true
}

on_signal() {
  trap - INT TERM
  echo ""
  echo "Stopping the active build stage..." >&2
  if [ -n "$ACTIVE_PID" ] && kill -0 "$ACTIVE_PID" 2>/dev/null; then
    terminate_process_tree "$ACTIVE_PID"
    wait "$ACTIVE_PID" 2>/dev/null || true
    ACTIVE_PID=""
  fi
  exit 130
}

trap on_exit EXIT
trap on_signal INT TERM

require_cmd() {
  has_cmd "$1" || { echo "Missing required command: $1" >&2; return 1; }
}

check_backend_module_list() {
  local source_modules cabal_modules missing_modules
  source_modules="$(mktemp)"
  cabal_modules="$(mktemp)"
  missing_modules="$(mktemp)"

  find "${PROJECT_ROOT}/backend/arkham-api/library" -name '*.hs' -type f -print0 \
    | xargs -0 awk '/^module [A-Z]/{print $2; nextfile}' \
    | sed 's/[[:space:]]*(.*$//' \
    | sort -u >"$source_modules"
  awk '
    /^[[:space:]]*(exposed-modules|other-modules):/ { in_modules=1; next }
    in_modules && /^[[:space:]]+[A-Z][A-Za-z0-9_.]*[[:space:]]*$/ {
      gsub(/^[[:space:]]+|[[:space:]]+$/, ""); print; next
    }
    in_modules { in_modules=0 }
  ' "${PROJECT_ROOT}/backend/arkham-api/arkham-api.cabal" | sort -u >"$cabal_modules"
  comm -23 "$source_modules" "$cabal_modules" >"$missing_modules"

  if [ -s "$missing_modules" ]; then
    echo "Backend modules missing from arkham-api.cabal:" >&2
    sed 's/^/  /' "$missing_modules" >&2
    rm -f "$source_modules" "$cabal_modules" "$missing_modules"
    return 1
  fi

  rm -f "$source_modules" "$cabal_modules" "$missing_modules"
}

preflight() {
  [ "$(uname -s)" = "Darwin" ] || {
    echo "This manual entry currently builds the macOS local binary and must run on macOS." >&2
    return 1
  }

  require_cmd git
  require_cmd tar
  require_cmd find
  require_cmd xargs
  require_cmd pgrep

  case "$BUILD_JOBS" in
    ''|*[!0-9]*|0)
      echo "ARKHAM_BUILD_JOBS must be a positive integer." >&2
      return 1
      ;;
  esac

  [ -x "${TOOLCHAIN_DIR}/bin/stack" ] || {
    echo "Stack toolchain not found: ${TOOLCHAIN_DIR}/bin/stack" >&2
    return 1
  }
  [ -x "${TOOLCHAIN_DIR}/bin/node" ] || {
    echo "Node.js toolchain not found: ${TOOLCHAIN_DIR}/bin/node" >&2
    return 1
  }
  [ -x "${TOOLCHAIN_DIR}/bin/pg_config" ] || {
    echo "PostgreSQL build helper not found: ${TOOLCHAIN_DIR}/bin/pg_config" >&2
    return 1
  }
  [ -x "${TOOLCHAIN_DIR}/bin/pcre-config" ] || {
    echo "PCRE build helper not found: ${TOOLCHAIN_DIR}/bin/pcre-config" >&2
    return 1
  }

  export PATH="${TOOLCHAIN_DIR}/bin:${PATH}"
  require_cmd node
  require_cmd npm
  require_cmd stack

  [ -f "${PROJECT_ROOT}/frontend/package-lock.json" ] || {
    echo "frontend/package-lock.json is missing." >&2
    return 1
  }
  [ -f "${PROJECT_ROOT}/backend/stack.yaml" ] || {
    echo "backend/stack.yaml is missing." >&2
    return 1
  }

  if [ -n "$(git -C "$PROJECT_ROOT" ls-files -u)" ]; then
    echo "The source tree contains unresolved merge conflicts." >&2
    return 1
  fi
  git -C "$PROJECT_ROOT" diff --check
  check_backend_module_list

  local free_kb
  free_kb="$(df -Pk "$PROJECT_ROOT" | awk 'NR==2 {print $4}')"
  if [ "${free_kb:-0}" -lt 15728640 ]; then
    echo "At least 15 GB of free disk space is required." >&2
    return 1
  fi

  if [ "$SKIP_LINUX" = false ]; then
    require_cmd docker
    if ! docker buildx version >/dev/null 2>&1; then
      echo "Docker Buildx is unavailable." >&2
      return 1
    fi
  fi

  if [ "$SKIP_MAC" = false ]; then
    require_cmd ditto
    local runtime_file
    for runtime_file in \
      bin/nginx \
      pgsql/bin/postgres \
      frontend/dist/index.html \
      build/index.html \
      build-api/v1/cache/cards/zh \
      start.sh \
      macOS用户双击我.command; do
      [ -e "${LOCAL_RUNTIME_TEMPLATE}/${runtime_file}" ] || {
        echo "Complete Mac runtime template is missing: ${LOCAL_RUNTIME_TEMPLATE}/${runtime_file}" >&2
        echo "Set ARKHAM_LOCAL_RUNTIME_TEMPLATE to a working ArkhamHorror-macos-arm64 directory." >&2
        return 1
      }
    done
    if ! grep -Fq 'location /build/' "${LOCAL_RUNTIME_TEMPLATE}/start.sh" || \
       ! grep -Fq 'location /build-api/' "${LOCAL_RUNTIME_TEMPLATE}/start.sh"; then
      echo "Complete Mac runtime template does not contain the Build routes: ${LOCAL_RUNTIME_TEMPLATE}/start.sh" >&2
      return 1
    fi
    for runtime_file in 09099.avif 09119.avif; do
      [ -f "${CARD_IMAGE_SOURCE}/${runtime_file}" ] || {
        echo "Chinese card image source is missing: ${CARD_IMAGE_SOURCE}/${runtime_file}" >&2
        echo "Set ARKHAM_CARD_IMAGE_SOURCE to the complete card image directory." >&2
        return 1
      }
    done
  fi
}

write_source_snapshot() {
  {
    echo "timestamp=$(date '+%Y-%m-%d %H:%M:%S %z')"
    echo "source=${PROJECT_ROOT}"
    echo "branch=$(git -C "$PROJECT_ROOT" branch --show-current)"
    echo "commit=$(git -C "$PROJECT_ROOT" rev-parse HEAD)"
    echo "describe=$(git -C "$PROJECT_ROOT" describe --always --dirty --tags)"
    echo "macos=$(sw_vers -productVersion)"
    echo "architecture=$(uname -m)"
    echo "node=$(node --version)"
    echo "npm=$(npm --version)"
    echo "stack=$(stack --numeric-version)"
  } >"${RUN_DIR}/source-state.txt"

  git -C "$PROJECT_ROOT" status --short >"${RUN_DIR}/git-status.txt"
  git -C "$PROJECT_ROOT" diff --binary >"${RUN_DIR}/working-tree.patch"
}

ensure_node_modules() {
  cd "${PROJECT_ROOT}/frontend"
  npm ci --prefer-offline --no-audit --no-fund
}

run_frontend_tests() {
  cd "${PROJECT_ROOT}/frontend"
  npm test
}

run_frontend_typecheck() {
  cd "${PROJECT_ROOT}/frontend"
  npm run tc
}

build_frontend() {
  cd "${PROJECT_ROOT}/frontend"
  rm -rf "${RUN_DIR}/frontend"
  VITE_ASSET_HOST="" npm run build -- --outDir "${RUN_DIR}/frontend" --emptyOutDir
  test -f "${RUN_DIR}/frontend/index.html"
}

configure_native_build_env() {
  export PATH="${TOOLCHAIN_DIR}/bin:${PATH}"
  export STACK_ROOT="${TOOLCHAIN_DIR}/stack-root"

  local pg_include pg_lib pcre_cflags pcre_lib_dir
  pg_include="$(pg_config --includedir)"
  pg_lib="$(pg_config --libdir)"
  pcre_cflags="$(pcre-config --cflags)"
  pcre_lib_dir="$(pcre-config --libs | sed -n 's/.*-L\([^ ]*\).*/\1/p')"

  export C_INCLUDE_PATH="${pg_include}:${pcre_cflags#-I}${C_INCLUDE_PATH:+:${C_INCLUDE_PATH}}"
  export LIBRARY_PATH="${pg_lib}${pcre_lib_dir:+:${pcre_lib_dir}}${LIBRARY_PATH:+:${LIBRARY_PATH}}"
  export DYLD_LIBRARY_PATH="${pg_lib}${pcre_lib_dir:+:${pcre_lib_dir}}${DYLD_LIBRARY_PATH:+:${DYLD_LIBRARY_PATH}}"
}

build_mac_backend() {
  configure_native_build_env
  mkdir -p "${RUN_DIR}/macos-arm64"
  cd "${PROJECT_ROOT}/backend"
  # A release rebuild should never link against objects from an older module list.
  stack clean arkham-api
  stack build --jobs "$BUILD_JOBS" --fast --no-terminal --ghc-options="-j${BUILD_JOBS}"
  stack --local-bin-path "${RUN_DIR}/macos-arm64" install arkham-api --jobs "$BUILD_JOBS" --fast --no-terminal --ghc-options="-j${BUILD_JOBS}"
  test -x "${RUN_DIR}/macos-arm64/arkham-api"
}

wait_for_docker() {
  if docker info >/dev/null 2>&1; then
    return 0
  fi

  echo "Docker Desktop is not running; opening it now."
  open -a Docker
  local waited=0
  while ! docker info >/dev/null 2>&1; do
    sleep 5
    waited=$((waited + 5))
    echo "Waiting for Docker Desktop (${waited}s / 300s) ..."
    if [ "$waited" -ge 300 ]; then
      echo "Docker Desktop did not become ready within 5 minutes." >&2
      return 1
    fi
  done
}

build_linux_backend() {
  wait_for_docker
  rm -rf "${RUN_DIR}/linux-amd64"
  mkdir -p "${RUN_DIR}/linux-amd64"
  cd "$PROJECT_ROOT"
  docker buildx build \
    --platform linux/amd64 \
    --target api-artifact \
    --output "type=local,dest=${RUN_DIR}/linux-amd64" \
    .
  test -f "${RUN_DIR}/linux-amd64/arkham-api"
  chmod +x "${RUN_DIR}/linux-amd64/arkham-api"
}

package_outputs() {
  cd "$RUN_DIR"

  # Public nginx may run as a different user from the game service.
  find "${RUN_DIR}/frontend" -type d -exec chmod 755 {} +
  find "${RUN_DIR}/frontend" -type f -exec chmod 644 {} +

  if [ -d macos-arm64 ]; then
    COPYFILE_DISABLE=1 tar --no-xattrs -czf local-update-macos-arm64.tar.gz frontend macos-arm64

    local complete_dir="${RUN_DIR}/ArkhamHorror-macos-arm64"
    rm -rf "$complete_dir"
    ditto "$LOCAL_RUNTIME_TEMPLATE" "$complete_dir"

    rm -rf "${complete_dir}/frontend/dist"
    mkdir -p "${complete_dir}/frontend/dist"
    ditto "${RUN_DIR}/frontend" "${complete_dir}/frontend/dist"
    mkdir -p "${complete_dir}/frontend/dist/img/arkham/zh/cards"
    ditto "$CARD_IMAGE_SOURCE" "${complete_dir}/frontend/dist/img/arkham/zh/cards"
    install -m 755 "${RUN_DIR}/macos-arm64/arkham-api" "${complete_dir}/bin/arkham-api"

    find "$complete_dir" -name .DS_Store -delete
    rm -rf "${complete_dir}/bin/backups" "${complete_dir}/data/nginx_temp"
    rm -f \
      "${complete_dir}/data/"*.log \
      "${complete_dir}/data/"*.pid \
      "${complete_dir}/data/access.log" \
      "${complete_dir}/data/error.log"

    test -x "${complete_dir}/bin/arkham-api"
    test -x "${complete_dir}/bin/nginx"
    test -x "${complete_dir}/pgsql/bin/postgres"
    test -f "${complete_dir}/frontend/dist/index.html"
    test -f "${complete_dir}/frontend/dist/img/arkham/zh/cards/09099.avif"
    test -f "${complete_dir}/frontend/dist/img/arkham/zh/cards/09119.avif"
    test -f "${complete_dir}/build/index.html"
    test -f "${complete_dir}/build-api/v1/cache/cards/zh"
    grep -Fq 'location /build/' "${complete_dir}/start.sh"
    grep -Fq 'location /build-api/' "${complete_dir}/start.sh"
    test -x "${complete_dir}/macOS用户双击我.command"

    COPYFILE_DISABLE=1 tar --no-xattrs -czf ArkhamHorror-macos-arm64-complete.tar.gz ArkhamHorror-macos-arm64
  fi
  if [ -d linux-amd64 ]; then
    COPYFILE_DISABLE=1 tar --no-xattrs -czf server-update-linux-amd64.tar.gz frontend linux-amd64
  fi

  : >SHA256SUMS
  for path in frontend macos-arm64 linux-amd64; do
    [ -e "$path" ] || continue
    while IFS= read -r file; do
      sha256_file "$file" >>SHA256SUMS
    done < <(find "$path" -type f -print | LC_ALL=C sort)
  done
  for file in \
    local-update-macos-arm64.tar.gz \
    ArkhamHorror-macos-arm64-complete.tar.gz \
    server-update-linux-amd64.tar.gz; do
    [ -f "$file" ] && sha256_file "$file" >>SHA256SUMS
  done
}

write_success_report() {
  local ended elapsed commit branch dirty mac_hash linux_hash frontend_hash
  ended="$(date '+%Y-%m-%d %H:%M:%S %z')"
  elapsed=$(($(date +%s) - START_EPOCH))
  commit="$(git -C "$PROJECT_ROOT" rev-parse HEAD)"
  branch="$(git -C "$PROJECT_ROOT" branch --show-current)"
  dirty="$(git -C "$PROJECT_ROOT" status --short | wc -l | tr -d ' ')"
  mac_hash="not built"
  linux_hash="not built"
  frontend_hash="$(sha256_file "${RUN_DIR}/frontend/index.html" | awk '{print $1}')"
  [ -f "${RUN_DIR}/macos-arm64/arkham-api" ] && mac_hash="$(sha256_file "${RUN_DIR}/macos-arm64/arkham-api" | awk '{print $1}')"
  [ -f "${RUN_DIR}/linux-amd64/arkham-api" ] && linux_hash="$(sha256_file "${RUN_DIR}/linux-amd64/arkham-api" | awk '{print $1}')"

  cat >"$REPORT_FILE" <<EOF
# Arkham Horror Manual Rebuild Report

- Status: **SUCCEEDED**
- Finished: ${ended}
- Elapsed: $(format_elapsed "$elapsed")
- Source: ${PROJECT_ROOT}
- Branch: ${branch}
- Commit: ${commit}
- Working-tree entries after build: ${dirty}

## Verification

- Frontend tests: $([ "$SKIP_TESTS" = true ] && echo skipped || echo passed)
- Frontend type check: $([ "$SKIP_TESTS" = true ] && echo skipped || echo passed)
- Frontend build: passed
- macOS arm64 backend: $([ "$SKIP_MAC" = true ] && echo skipped || echo passed)
- Complete runnable Mac package: $([ "$SKIP_MAC" = true ] && echo skipped || echo passed)
- Linux amd64 backend: $([ "$SKIP_LINUX" = true ] && echo skipped || echo passed)

## Key hashes

- frontend/index.html: ${frontend_hash}
- macOS arkham-api: ${mac_hash}
- Linux arkham-api: ${linux_hash}

## Deployment safety

This run only produced build artifacts. It did not replace the local runtime, contact a server, or change any database or save file.

Before deployment, review \`SHA256SUMS\` and the logs in \`${LOG_DIR}\`.
EOF
}

main() {
  echo ""
  echo "Arkham Horror fixed rebuild workflow"
  echo "Source:     ${PROJECT_ROOT}"
  echo "Toolchain:  ${TOOLCHAIN_DIR}"
  echo "Output:     ${RUN_DIR}"
  echo ""
  echo "This build does NOT deploy, replace a runtime, or touch saves."
  echo "The displayed percentage is stage-weighted progress, not an exact GHC module count."
  echo ""

  render_bar 0 "Preflight"
  preflight
  render_bar 5 "Preflight" " | passed"

  export PATH="${TOOLCHAIN_DIR}/bin:${PATH}"

  if [ "$PREFLIGHT_ONLY" = true ]; then
    CURRENT_STAGE="Preflight only"
    cat >"$REPORT_FILE" <<EOF
# Arkham Horror Manual Rebuild Preflight

- Status: **PASSED**
- Source: ${PROJECT_ROOT}
- Toolchain: ${TOOLCHAIN_DIR}
- Checked: $(date '+%Y-%m-%d %H:%M:%S %z')

No compilation or deployment was performed.
EOF
    RUN_STATUS="SUCCEEDED"
    trap - EXIT
    render_bar 100 "Preflight only" " | passed"
    echo "Report: ${REPORT_FILE}"
    return 0
  fi

  if [ "$NON_INTERACTIVE" = false ]; then
    read -r -p "Continue with the full rebuild? [y/N] " answer
    case "$answer" in
      y|Y|yes|YES) ;;
      *) echo "Cancelled."; RUN_STATUS="SUCCEEDED"; trap - EXIT; return 0 ;;
    esac
  fi

  CURRENT_STAGE="Source snapshot"
  write_source_snapshot
  render_bar 8 "Source snapshot" " | recorded"

  run_logged "Frontend dependencies" 8 16 180 "${LOG_DIR}/frontend-dependencies.log" ensure_node_modules

  if [ "$SKIP_TESTS" = false ]; then
    run_logged "Frontend tests" 16 24 120 "${LOG_DIR}/frontend-tests.log" run_frontend_tests
    run_logged "Frontend type check" 24 34 240 "${LOG_DIR}/frontend-typecheck.log" run_frontend_typecheck
  else
    render_bar 34 "Frontend tests and type check" " | skipped"
  fi

  run_logged "Frontend production build" 34 46 300 "${LOG_DIR}/frontend-build.log" build_frontend

  if [ "$SKIP_MAC" = false ]; then
    run_logged "macOS backend build" 46 70 5400 "${LOG_DIR}/macos-backend.log" build_mac_backend
  else
    render_bar 70 "macOS backend build" " | skipped"
  fi

  if [ "$SKIP_LINUX" = false ]; then
    run_logged "Linux server backend build" 70 94 7200 "${LOG_DIR}/linux-backend.log" build_linux_backend
  else
    render_bar 94 "Linux server backend build" " | skipped"
  fi

  CURRENT_STAGE="Packaging and checksums"
  package_outputs
  render_bar 99 "Packaging and checksums" " | complete"

  write_success_report
  ln -sfn "$TIMESTAMP" "${OUTPUT_ROOT}/latest"
  RUN_STATUS="SUCCEEDED"
  trap - EXIT

  render_bar 100 "Manual rebuild" " | SUCCEEDED"
  echo ""
  echo "Report: ${REPORT_FILE}"
  echo "Artifacts: ${RUN_DIR}"
  echo ""
  echo "Send REPORT.md to Codex for review. Deployment remains a separate, explicit step."
}

main
