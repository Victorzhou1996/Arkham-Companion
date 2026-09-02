#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PG_BIN="${PG_BIN:?Set PG_BIN to the bundled PostgreSQL bin directory}"
API_BIN="${API_BIN:?Set API_BIN to the packaged arkham-api binary}"
API_WORKDIR="${API_WORKDIR:-$(cd "$(dirname "$API_BIN")/.." && pwd)}"
TMP_DIR="$(mktemp -d /tmp/arkham-ach-api.XXXXXX)"
PG_PORT=$((48000 + ($$ % 1000)))
API_PORT=$((49000 + ($$ % 1000)))
DB_NAME="arkham-horror-backend"
API_PID=""

if [ "$(uname -s)" = "Darwin" ]; then
    PG_LIB="$(cd "$PG_BIN/../lib" && pwd)"
    PACKAGE_LIB="$(cd "$PG_BIN/../../lib" && pwd)"
    export DYLD_LIBRARY_PATH="$PG_LIB:$PACKAGE_LIB${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
fi

stop_api() {
    if [ -n "$API_PID" ] && kill -0 "$API_PID" 2>/dev/null; then
        kill "$API_PID"
        wait "$API_PID" 2>/dev/null || true
    fi
    API_PID=""
}

cleanup() {
    stop_api
    "$PG_BIN/pg_ctl" -D "$TMP_DIR/pgdata" -m immediate stop >/dev/null 2>&1 || true
    find "$TMP_DIR" -depth -delete 2>/dev/null || true
}
trap cleanup EXIT
trap 'cat "$TMP_DIR/api.log" >&2 2>/dev/null || true' ERR

psql_cmd() {
    "$PG_BIN/psql" -h "$TMP_DIR/socket" -p "$PG_PORT" -U arkham_user \
        -d "$DB_NAME" -X -A -t -v ON_ERROR_STOP=1 "$@"
}

psql_admin() {
    "$PG_BIN/psql" -h "$TMP_DIR/socket" -p "$PG_PORT" -U arkham_user \
        -d postgres -X -A -t -v ON_ERROR_STOP=1 "$@"
}

start_api() {
    (
        cd "$API_WORKDIR"
        exec env \
            DATABASE_URL="postgres://arkham_user@127.0.0.1:$PG_PORT/$DB_NAME" \
            PORT="$API_PORT" \
            PGHOST="127.0.0.1" \
            PGPORT="$PG_PORT" \
            PGSSLMODE="disable" \
            JWT_SECRET="achievement-upgrade-integration-test-only" \
            ASSET_HOST="" \
            "$API_BIN" > "$TMP_DIR/api.log" 2>&1
    ) &
    API_PID=$!

    for _ in $(seq 1 100); do
        curl -fsS --max-time 1 "http://127.0.0.1:$API_PORT/health" >/dev/null 2>&1 && return 0
        kill -0 "$API_PID" 2>/dev/null || {
            cat "$TMP_DIR/api.log" >&2
            return 1
        }
        sleep 0.1
    done
    cat "$TMP_DIR/api.log" >&2
    return 1
}

api_post() {
    local route="$1" body="$2"
    curl -fsS --max-time 15 -H 'Content-Type: application/json' \
        -H "Authorization: Token $TOKEN" -d "$body" \
        "http://127.0.0.1:$API_PORT/api/v1/$route"
}

api_get() {
    local route="$1"
    curl -fsS --max-time 15 -H "Authorization: Token $TOKEN" \
        "http://127.0.0.1:$API_PORT/api/v1/$route"
}

"$PG_BIN/initdb" -D "$TMP_DIR/pgdata" -U arkham_user --no-locale -E UTF8 >/dev/null
mkdir -p "$TMP_DIR/socket"
if ! "$PG_BIN/pg_ctl" -D "$TMP_DIR/pgdata" -l "$TMP_DIR/postgres.log" \
    -o "-k '$TMP_DIR/socket' -p $PG_PORT -c listen_addresses='127.0.0.1'" start >/dev/null; then
    cat "$TMP_DIR/postgres.log" >&2
    exit 1
fi

for _ in $(seq 1 30); do
    "$PG_BIN/pg_isready" -h "$TMP_DIR/socket" -p "$PG_PORT" -U arkham_user \
        >/dev/null 2>&1 && break
    sleep 0.2
done
"$PG_BIN/psql" -h "$TMP_DIR/socket" -p "$PG_PORT" -U arkham_user -d postgres \
    -X -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$DB_NAME\";" >/dev/null

# Simulate an existing installation: complete base schema, but no newer local migrations.
awk '/^-- Added locally: official arkham_epic migration/{exit} {print}' \
    "$PROJECT_ROOT/setup.sql" > "$TMP_DIR/old-setup.sql"
psql_cmd -f "$TMP_DIR/old-setup.sql" >/dev/null
test "$(psql_cmd -c "SELECT COALESCE(to_regclass('public.arkham_achievements')::text, 'missing')")" = "missing"

start_api
REGISTER_RESPONSE="$(curl -fsS --max-time 15 -H 'Content-Type: application/json' \
    -d '{"username":"upgrade-test","email":"upgrade-test@example.invalid","password":"test-password"}' \
    "http://127.0.0.1:$API_PORT/api/v1/register")"
TOKEN="$(printf '%s' "$REGISTER_RESPONSE" | jq -er '.token')"

OLD_GAME_RESPONSE="$(api_post 'arkham/games' \
    '{"deckIds":[null],"playerCount":1,"campaignId":"01","scenarioId":null,"difficulty":"Standard","campaignName":"Old save compatibility","multiplayerVariant":"Solo","includeTarotReadings":false,"options":[],"achievementsEnabled":false,"ultimatumsAndBoons":[],"undoMode":"full"}')"
OLD_GAME_ID="$(printf '%s' "$OLD_GAME_RESPONSE" | jq -er '.id')"
[[ "$OLD_GAME_ID" =~ ^[0-9a-f-]{36}$ ]]
OLD_GAME_HASH="$(psql_cmd -c "SELECT md5(current_data::text) FROM arkham_games WHERE id = '$OLD_GAME_ID'::uuid")"
OLD_PLAYER_COUNT="$(psql_cmd -c "SELECT count(*) FROM arkham_players WHERE arkham_game_id = '$OLD_GAME_ID'::uuid")"
OLD_STEP_COUNT="$(psql_cmd -c "SELECT count(*) FROM arkham_steps WHERE arkham_game_id = '$OLD_GAME_ID'::uuid")"
stop_api

# This is exactly what the updated launcher applies to an existing database.
awk '/^-- Added locally: official arkham_epic migration/{flag=1} flag{print}' \
    "$PROJECT_ROOT/setup.sql" > "$TMP_DIR/post-restore-migrations.sql"
psql_cmd -f "$TMP_DIR/post-restore-migrations.sql" >/dev/null

test "$(psql_cmd -c "SELECT md5(current_data::text) FROM arkham_games WHERE id = '$OLD_GAME_ID'::uuid")" = "$OLD_GAME_HASH"
test "$(psql_cmd -c "SELECT count(*) FROM arkham_players WHERE arkham_game_id = '$OLD_GAME_ID'::uuid")" = "$OLD_PLAYER_COUNT"
test "$(psql_cmd -c "SELECT count(*) FROM arkham_steps WHERE arkham_game_id = '$OLD_GAME_ID'::uuid")" = "$OLD_STEP_COUNT"

start_api
OLD_GAME_AFTER_UPGRADE="$(api_get "arkham/games/$OLD_GAME_ID")"
test "$(printf '%s' "$OLD_GAME_AFTER_UPGRADE" | jq -er '.game.id')" = "$OLD_GAME_ID"

NEW_GAME_RESPONSE="$(api_post 'arkham/games' \
    '{"deckIds":[null],"playerCount":1,"campaignId":"01","scenarioId":null,"difficulty":"Standard","campaignName":"New save with achievements","multiplayerVariant":"Solo","includeTarotReadings":false,"options":[],"achievementsEnabled":true,"ultimatumsAndBoons":[],"undoMode":"full"}')"
NEW_GAME_ID="$(printf '%s' "$NEW_GAME_RESPONSE" | jq -er '.id')"
[[ "$NEW_GAME_ID" =~ ^[0-9a-f-]{36}$ ]]
test "$(printf '%s' "$NEW_GAME_RESPONSE" | jq -r '.. | .settingsAchievementsEnabled? // empty' | head -n 1)" = "true"
test "$(api_get 'arkham/achievements' | jq -r 'length')" = "0"

psql_cmd -v game_id="$NEW_GAME_ID" >/dev/null <<'SQL'
INSERT INTO arkham_achievements(user_id, achievement, earned_at, arkham_game_id, progress)
SELECT id, 'TheZealotsRevenge', now(), :'game_id'::uuid, '{}'::jsonb
FROM users WHERE email = 'upgrade-test@example.invalid';
SQL

test "$(api_get 'arkham/achievements' | jq -r 'length')" = "1"
test "$(api_get "arkham/games/$NEW_GAME_ID/achievements" | jq -r 'length')" = "1"
test "$(psql_cmd -c 'SELECT count(*) FROM arkham_achievements')" = "1"

stop_api
psql_admin -c "DROP DATABASE \"$DB_NAME\";" >/dev/null
psql_admin -c "CREATE DATABASE \"$DB_NAME\";" >/dev/null
psql_cmd -f "$PROJECT_ROOT/setup.sql" >/dev/null
test "$(psql_cmd -c "SELECT COALESCE(to_regclass('public.arkham_achievements')::text, 'missing')")" = "arkham_achievements"

start_api
REGISTER_RESPONSE="$(curl -fsS --max-time 15 -H 'Content-Type: application/json' \
    -d '{"username":"fresh-test","email":"fresh-test@example.invalid","password":"test-password"}' \
    "http://127.0.0.1:$API_PORT/api/v1/register")"
TOKEN="$(printf '%s' "$REGISTER_RESPONSE" | jq -er '.token')"

FRESH_GAME_RESPONSE="$(api_post 'arkham/games' \
    '{"deckIds":[null],"playerCount":1,"campaignId":"01","scenarioId":null,"difficulty":"Standard","campaignName":"Fresh new-version save","multiplayerVariant":"Solo","includeTarotReadings":false,"options":[],"achievementsEnabled":true,"ultimatumsAndBoons":[],"undoMode":"full"}')"
FRESH_GAME_ID="$(printf '%s' "$FRESH_GAME_RESPONSE" | jq -er '.id')"
[[ "$FRESH_GAME_ID" =~ ^[0-9a-f-]{36}$ ]]
test "$(printf '%s' "$FRESH_GAME_RESPONSE" | jq -r '.. | .settingsAchievementsEnabled? // empty' | head -n 1)" = "true"
test "$(api_get 'arkham/achievements' | jq -r 'length')" = "0"

psql_cmd -v game_id="$FRESH_GAME_ID" >/dev/null <<'SQL'
INSERT INTO arkham_achievements(user_id, achievement, earned_at, arkham_game_id, progress)
SELECT id, 'TheZealotsRevenge', now(), :'game_id'::uuid, '{}'::jsonb
FROM users WHERE email = 'fresh-test@example.invalid';
SQL

test "$(api_get 'arkham/achievements' | jq -r 'length')" = "1"
test "$(api_get "arkham/games/$FRESH_GAME_ID/achievements" | jq -r 'length')" = "1"

printf 'old save upgrade API test: PASS\n'
printf 'new save achievements API test: PASS\n'
printf 'fresh new-version achievements API test: PASS\n'
