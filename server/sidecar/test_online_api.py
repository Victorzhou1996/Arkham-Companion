import json
import os
import tempfile
import unittest
import uuid
import zipfile
from io import BytesIO
from pathlib import Path
from unittest.mock import AsyncMock, patch

from aiohttp import web

os.environ.setdefault("JWT_SECRET", "test-secret")

from online_api import (
    MAX_OPEN_GAMES,
    STARTER_DECKS,
    ArchiveNotEnded,
    OnlineApi,
    code_digest,
    make_token,
    token_user_id,
    validate_registration,
)


class FakeCursor:
    def __init__(self, game_state="IsOver"):
        self.game_state = game_state
        self.query = ""
        self.rowcount = 0
        self.deletes = []

    def execute(self, query, _params=()):
        self.query = " ".join(query.split())
        if self.query.startswith("DELETE FROM"):
            table = self.query.split()[2]
            self.deletes.append(table)
            self.rowcount = 2 if table == "arkham_steps" else 1

    def fetchone(self):
        if "SELECT g.*" not in self.query:
            return None
        return {
            "id": uuid.UUID("11111111-1111-1111-1111-111111111111"),
            "name": "Campaign",
            "current_data": {"gameState": {"tag": self.game_state}},
            "step": 12,
            "multiplayer_variant": "WithFriends",
        }

    def fetchall(self):
        if "FROM arkham_players" in self.query:
            return [{"investigator_id": "01001", "arkham_game_id": uuid.uuid4()}]
        if "FROM arkham_steps" in self.query:
            return [
                {
                    "arkham_game_id": uuid.UUID("11111111-1111-1111-1111-111111111111"),
                    "choice": {"choiceMessages": []},
                    "step": 12,
                    "action_diff": [],
                },
                {
                    "arkham_game_id": uuid.UUID("11111111-1111-1111-1111-111111111111"),
                    "choice": {"choiceMessages": []},
                    "step": 11,
                    "action_diff": [],
                },
            ]
        return [{"arkham_game_id": uuid.uuid4()}]


class FakeTransaction:
    def __init__(self, connection):
        self.connection = connection

    def __enter__(self):
        return self

    def __exit__(self, exc_type, _exc, _traceback):
        self.connection.committed = exc_type is None
        self.connection.rolled_back = exc_type is not None


class FakeConnection:
    def __init__(self, game_state="IsOver"):
        self.cursor_instance = FakeCursor(game_state)
        self.committed = False
        self.rolled_back = False

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc, _traceback):
        return False

    def transaction(self):
        return FakeTransaction(self)

    def cursor(self):
        return self.cursor_instance


class FakeAsyncConnection:
    def __init__(self):
        self.queries = []
        self.closed = False

    async def execute(self, query, params=()):
        self.queries.append((" ".join(query.split()), params))

    async def close(self):
        self.closed = True


class FakeAsyncTransaction:
    def __init__(self, connection):
        self.connection = connection

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, _exc, _traceback):
        self.connection.committed = exc_type is None
        self.connection.rolled_back = exc_type is not None


class FakeStarterCursor:
    async def fetchone(self):
        return (42,)


class FakeStarterConnection:
    def __init__(self):
        self.queries = []
        self.closed = False
        self.committed = False
        self.rolled_back = False

    def transaction(self):
        return FakeAsyncTransaction(self)

    async def execute(self, query, params=()):
        normalized = " ".join(query.split())
        self.queries.append((normalized, params))
        return FakeStarterCursor() if normalized.startswith("INSERT INTO users") else None

    async def close(self):
        self.closed = True


class OnlineApiTests(unittest.TestCase):
    def test_hs256_token_round_trip(self):
        token = make_token(42, "test-secret", now=123)
        self.assertEqual(token_user_id(f"Token {token}", "test-secret"), 42)
        self.assertIsNone(token_user_id(f"Token {token}", "wrong-secret"))

    def test_codes_are_bound_to_email(self):
        self.assertNotEqual(
            code_digest("a@example.com", "123456", "secret"),
            code_digest("b@example.com", "123456", "secret"),
        )

    def test_registration_validation(self):
        self.assertEqual(
            validate_registration({"username": " Alice ", "email": "A@EXAMPLE.COM", "password": "12345678"}),
            ("Alice", "a@example.com", "12345678"),
        )
        with self.assertRaises(ValueError):
            validate_registration({"username": "A", "email": "bad", "password": "short"})


class StarterDeckTests(unittest.IsolatedAsyncioTestCase):
    def test_starter_decks_include_cards_notes_and_mark_customization(self):
        self.assertEqual([deck["list"]["id"] for deck in STARTER_DECKS], ["qewhl3Do4yFlzop", "DYKly6vcYWthFOi"])
        self.assertEqual([sum(deck["list"]["slots"].values()) for deck in STARTER_DECKS], [35, 35])
        self.assertEqual([sum(deck["list"]["sideSlots"].values()) for deck in STARTER_DECKS], [25, 15])
        metas = [json.loads(deck["list"]["meta"]) for deck in STARTER_DECKS]
        self.assertTrue(all(meta["arkham_horror_description_md"].strip() for meta in metas))
        self.assertEqual(metas[1]["cus_09022"], "0|0,1|1,4|0,5|2,7|0")

    async def test_registration_inserts_user_and_both_decks_atomically(self):
        api = OnlineApi.__new__(OnlineApi)
        api.pg_connect_kwargs = lambda: {}
        connection = FakeStarterConnection()
        with patch(
            "online_api.psycopg.AsyncConnection.connect",
            new=AsyncMock(return_value=connection),
        ):
            user_id = await api.create_user_with_starter_decks(
                "Alice",
                "alice@example.com",
                "password-hash",
                pending_email="alice@example.com",
            )

        self.assertEqual(user_id, 42)
        self.assertTrue(connection.committed)
        self.assertFalse(connection.rolled_back)
        self.assertTrue(connection.closed)
        deck_inserts = [item for item in connection.queries if item[0].startswith("INSERT INTO arkham_decks")]
        self.assertEqual(len(deck_inserts), 2)
        self.assertEqual([json.loads(item[1][4])["id"] for item in deck_inserts], ["qewhl3Do4yFlzop", "DYKly6vcYWthFOi"])
        self.assertTrue(connection.queries[-1][0].startswith("DELETE FROM pending_registrations"))


class GameLimitTests(unittest.IsolatedAsyncioTestCase):
    def test_default_limit_is_five(self):
        self.assertEqual(MAX_OPEN_GAMES, 5)

    async def test_next_unarchived_game_is_blocked_at_limit(self):
        api = OnlineApi.__new__(OnlineApi)
        api.require_user = lambda _request: 42
        api.open_game_count = AsyncMock(return_value=MAX_OPEN_GAMES)
        with self.assertRaises(web.HTTPConflict):
            await api.enforce_game_limit(object())

    async def test_archived_games_do_not_fill_limit(self):
        api = OnlineApi.__new__(OnlineApi)
        api.require_user = lambda _request: 42
        api.open_game_count = AsyncMock(return_value=MAX_OPEN_GAMES - 1)
        await api.enforce_game_limit(object())

    async def test_zero_limit_disables_quota(self):
        api = OnlineApi.__new__(OnlineApi)
        api.require_user = lambda _request: 42
        api.open_game_count = AsyncMock()
        with patch("online_api.MAX_OPEN_GAMES", 0):
            await api.enforce_game_limit(object())
        api.open_game_count.assert_not_awaited()

    async def test_quota_lock_uses_database_session_lock(self):
        api = OnlineApi.__new__(OnlineApi)
        api.pg_connect_kwargs = lambda: {}
        connection = FakeAsyncConnection()
        with patch(
            "online_api.psycopg.AsyncConnection.connect",
            new=AsyncMock(return_value=connection),
        ):
            async with api.quota_lock(42):
                self.assertFalse(connection.closed)

        self.assertTrue(connection.closed)
        self.assertIn("pg_advisory_lock", connection.queries[0][0])
        self.assertIn("pg_advisory_unlock", connection.queries[1][0])


class ArchiveTests(unittest.TestCase):
    game_id = "11111111-1111-1111-1111-111111111111"

    def make_api(self, archive_dir: Path):
        api = OnlineApi.__new__(OnlineApi)
        api.archive_dir = archive_dir
        api.pg_connect_kwargs = lambda: {}
        return api

    def test_archive_writes_both_backups_before_transaction_commits(self):
        with tempfile.TemporaryDirectory() as directory:
            api = self.make_api(Path(directory))
            connection = FakeConnection()
            with patch("online_api.psycopg.connect", return_value=connection):
                result = api.archive_game_sync(42, self.game_id)

            self.assertTrue(connection.committed)
            self.assertFalse(connection.rolled_back)
            self.assertEqual(result["deletedSteps"], 2)
            self.assertEqual(
                connection.cursor_instance.deletes,
                [
                    "arkham_log_entries",
                    "arkham_game_undo_floors",
                    "arkham_ml_decisions",
                    "arkham_steps",
                ],
            )
            database_backup = Path(directory) / result["backup"]
            full_export = Path(directory) / result["fullExport"]
            self.assertTrue(database_backup.is_file())
            self.assertTrue(full_export.is_file())
            exported = json.loads(full_export.read_text())
            self.assertEqual(exported["campaignPlayers"], ["01001"])
            self.assertEqual(len(exported["steps"]), 2)

    def test_archive_write_failure_rolls_back_without_deleting(self):
        with tempfile.TemporaryDirectory() as directory:
            api = self.make_api(Path(directory))
            connection = FakeConnection()
            api.atomic_write_json = lambda *_args: (_ for _ in ()).throw(OSError("disk full"))
            with patch("online_api.psycopg.connect", return_value=connection):
                with self.assertRaises(OSError):
                    api.archive_game_sync(42, self.game_id)

            self.assertFalse(connection.committed)
            self.assertTrue(connection.rolled_back)
            self.assertEqual(connection.cursor_instance.deletes, [])

    def test_archive_rejects_game_that_is_not_over(self):
        with tempfile.TemporaryDirectory() as directory:
            api = self.make_api(Path(directory))
            connection = FakeConnection("IsInProgress")
            with patch("online_api.psycopg.connect", return_value=connection):
                with self.assertRaises(ArchiveNotEnded):
                    api.archive_game_sync(42, self.game_id)
            self.assertTrue(connection.rolled_back)
            self.assertEqual(connection.cursor_instance.deletes, [])


class BugExportTests(unittest.TestCase):
    def make_api(self, bug_reports_dir: Path):
        api = OnlineApi.__new__(OnlineApi)
        api.bug_reports_dir = bug_reports_dir
        return api

    def test_export_contains_markdown_and_attached_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            snapshot = root / "snapshots" / "bug-1.json"
            snapshot.parent.mkdir()
            snapshot.write_text('{"steps":[{"step":30}]}', encoding="utf-8")
            api = self.make_api(root)
            reports = [
                {
                    "id": "bug-1",
                    "createdAt": "2026-07-23T00:00:00Z",
                    "updatedAt": "2026-07-23T00:00:00Z",
                    "gameId": "11111111-1111-1111-1111-111111111111",
                    "submitterUserId": "42",
                    "submitterUsername": "Victor",
                    "submitterEmail": "victor@example.com",
                    "title": "测试问题",
                    "description": "复现描述",
                    "pageUrl": "https://example.test/#/games/1",
                    "exportFile": "snapshots/bug-1.json",
                }
            ]

            archive_bytes = api.build_bug_export_zip(reports)
            with zipfile.ZipFile(BytesIO(archive_bytes)) as archive:
                names = archive.namelist()
                self.assertIn("bug-list.md", names)
                save_name = (
                    "saves/bug-1-11111111-1111-1111-1111-111111111111.json"
                )
                self.assertIn(save_name, names)
                markdown = archive.read("bug-list.md").decode()
                self.assertIn("测试问题", markdown)
                self.assertIn("复现描述", markdown)
                self.assertIn(save_name, markdown)

    def test_bug_report_path_rejects_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            api = self.make_api(Path(directory))
            self.assertIsNone(api.bug_report_file("../outside.json"))


class DeploymentRoutingTests(unittest.TestCase):
    def test_unkai_nginx_routes_sidecar_endpoints_before_generic_proxy(self):
        config = (
            Path(__file__).parents[1] / "deploy" / "unkai-arkham-online.nginx.conf"
        ).read_text()
        sidecar_route = "(archive|archive-status|full-export|join|claim-seat|file-bug)"
        self.assertIn(sidecar_route, config)
        self.assertIn("location = /api/v1/arkham/games/import", config)
        self.assertLess(config.index(sidecar_route), config.index("location / {"))

    def test_unkai_nginx_does_not_fall_back_to_html_for_missing_assets(self):
        config = (
            Path(__file__).parents[1] / "deploy" / "unkai-arkham-online.nginx.conf"
        ).read_text()
        self.assertIn("location /assets/ {", config)
        self.assertIn("try_files $uri =404;", config)
        self.assertNotIn("^/(assets|img|fonts)/", config)

    def test_database_role_has_only_required_write_privileges(self):
        setup = (
            Path(__file__).parents[1] / "deploy" / "setup-arkham-sidecar-role.sql"
        ).read_text()
        self.assertNotIn("GRANT CREATE", setup)
        self.assertIn("REVOKE CREATE ON SCHEMA public FROM PUBLIC", setup)
        self.assertNotIn("UPDATE ON TABLE arkham_games", setup)
        self.assertIn("GRANT INSERT ON TABLE users, password_resets, arkham_decks", setup)
        self.assertIn("GRANT DELETE ON TABLE", setup)


if __name__ == "__main__":
    unittest.main()
