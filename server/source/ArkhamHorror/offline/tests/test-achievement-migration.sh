#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PG_BIN="${PG_BIN:?Set PG_BIN to the bundled PostgreSQL bin directory}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/arkham-achievement-test.XXXXXX")"
PG_PORT=$((50000 + ($$ % 10000)))

if [ "$(uname -s)" = "Darwin" ]; then
    PG_LIB="$(cd "$PG_BIN/../lib" && pwd)"
    PACKAGE_LIB="$(cd "$PG_BIN/../../lib" && pwd)"
    export DYLD_LIBRARY_PATH="$PG_LIB:$PACKAGE_LIB${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
fi

cleanup() {
    "$PG_BIN/pg_ctl" -D "$TMP_DIR/pgdata" -m immediate stop >/dev/null 2>&1 || true
    find "$TMP_DIR" -depth -delete 2>/dev/null || true
}
trap cleanup EXIT

psql_cmd() {
    "$PG_BIN/psql" -h "$TMP_DIR/socket" -p "$PG_PORT" -U arkham_user \
        -d postgres -X -A -t -v ON_ERROR_STOP=1 "$@"
}

"$PG_BIN/initdb" -D "$TMP_DIR/pgdata" -U arkham_user --no-locale -E UTF8 >/dev/null
mkdir -p "$TMP_DIR/socket"
"$PG_BIN/pg_ctl" -D "$TMP_DIR/pgdata" -l "$TMP_DIR/postgres.log" \
    -o "-k '$TMP_DIR/socket' -p $PG_PORT -c listen_addresses=''" start >/dev/null

for _ in $(seq 1 30); do
    "$PG_BIN/pg_isready" -h "$TMP_DIR/socket" -p "$PG_PORT" -U arkham_user \
        >/dev/null 2>&1 && break
    sleep 0.2
done

psql_cmd >/dev/null <<'SQL'
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
CREATE TABLE users (id bigint PRIMARY KEY);
CREATE TABLE arkham_games (id uuid PRIMARY KEY);
SQL

awk '/^-- Added locally: official arkham_epic migration/{flag=1} flag{print}' \
    "$PROJECT_ROOT/setup.sql" > "$TMP_DIR/migrations.sql"

# Applying the startup migrations twice must be harmless.
psql_cmd -f "$TMP_DIR/migrations.sql" >/dev/null
psql_cmd -f "$TMP_DIR/migrations.sql" >/dev/null

test "$(psql_cmd -c "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='arkham_achievements'")" = "6"
test "$(psql_cmd -c "SELECT count(*) FROM pg_constraint WHERE conrelid='public.arkham_achievements'::regclass")" = "4"
test "$(psql_cmd -c "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='arkham_achievements' AND indexname='idx_arkham_achievements_game'")" = "1"

write_count="$(psql_cmd <<'SQL'
BEGIN;
INSERT INTO users(id) VALUES (9000001);
INSERT INTO arkham_games(id) VALUES ('00000000-0000-0000-0000-000000000001');
INSERT INTO arkham_achievements(user_id, achievement, earned_at, arkham_game_id, progress)
VALUES (9000001, 'migration-test', now(), '00000000-0000-0000-0000-000000000001', '{"complete": true}');
SELECT count(*) FROM arkham_achievements WHERE achievement='migration-test';
ROLLBACK;
SQL
)"
test "$(printf '%s\n' "$write_count" | sed -n '/^[0-9][0-9]*$/p' | tail -n 1)" = "1"
test "$(psql_cmd -c 'SELECT count(*) FROM arkham_achievements')" = "0"

printf 'achievement migration test: PASS\n'
