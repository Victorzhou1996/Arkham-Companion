#!/usr/bin/env python3
"""Online-only API additions for arkham-horror.online."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import time
import uuid
import zipfile
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from email.utils import parseaddr
from pathlib import Path
from typing import Any

import bcrypt
import psycopg
from aiohttp import ClientSession, ClientTimeout, web
from psycopg.rows import dict_row


API_PREFIX = "/api/v1"
MAX_OPEN_GAMES = int(os.getenv("MAX_OPEN_GAMES", "5"))
CODE_TTL_SECONDS = 600
RESEND_SECONDS = 60
MAX_CODE_ATTEMPTS = 5
GAME_ID_RE = re.compile(r"^[0-9a-fA-F-]{36}$")


class ArchiveNotFound(Exception):
    pass


class ArchiveNotEnded(Exception):
    pass


class ArchiveAlreadyComplete(Exception):
    pass


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def make_token(user_id: int, secret: str, now: int | None = None) -> str:
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = b64url(
        json.dumps(
            {"iss": "arkham", "iat": now or int(time.time()), "jwt": user_id},
            separators=(",", ":"),
        ).encode()
    )
    signature = b64url(hmac.new(secret.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"


def token_user_id(authorization: str | None, secret: str) -> int | None:
    if not authorization or not authorization.lower().startswith("token "):
        return None
    try:
        token = authorization.split(None, 1)[1]
        header, payload, signature = token.split(".")
        expected = hmac.new(secret.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, b64url_decode(signature)):
            return None
        header_json = json.loads(b64url_decode(header))
        claims = json.loads(b64url_decode(payload))
        if header_json.get("alg") != "HS256" or claims.get("iss") != "arkham":
            return None
        return int(claims["jwt"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None


def code_digest(email: str, code: str, secret: str) -> str:
    return hmac.new(secret.encode(), f"{email}\0{code}".encode(), hashlib.sha256).hexdigest()


def validate_registration(payload: dict[str, Any]) -> tuple[str, str, str]:
    username = str(payload.get("username", "")).strip()
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    if not 2 <= len(username) <= 50 or any(c in username for c in "\r\n\t"):
        raise ValueError("用户名长度应为 2 到 50 个字符")
    if parseaddr(email)[1] != email or "@" not in email or len(email) > 254:
        raise ValueError("邮箱格式不正确")
    if not 8 <= len(password) <= 200:
        raise ValueError("密码长度应为 8 到 200 个字符")
    return username, email, password


def _slots(value: str) -> dict[str, int]:
    return {
        f"c{code}": int(quantity)
        for item in value.split()
        for code, quantity in [item.split(":", 1)]
    }


TRISH_NOTES = """有4经验先卖洞察力提升牌效，熟能生巧找2级洞察力1过4，买完以后2经验买一张黑市替换一张刨根问底，再买2级推理。
大肆借贷买了以后就可以买协同组件了，加入马队和欺骗制度，0费1过4和1费飞行，分别替换捷径和浮士德
还有经验买超级加倍，2海量研究，1神秘笔记替换超级加倍，2海量研究替换专业的直觉。
6经验买杀手锏，换掉最后一张神秘笔迹，狐朋狗友按照我发的点。
狐朋狗友把素描像加入手牌，相当于1费快速抽3，这个时候狐朋狗友可以换构建动机。
因为有协同组件，资源是远远溢出的，如果还嫌上限不够可以放大镜换一张黑色扇子，常态8动基本上够用了。
后面如果缺san，替换掉皮夹克，买宝物猎人和珍贵记忆。
干一天活拿一天钱和街头浪子可以偏后期点。
"""

MARK_NOTES = """先升级符文斧，点出古代力量，刻铭匠 如果是2循需要先点荣耀
饮血者弱点用拘留拷住
升级完符文斧以后再升级大压制，大致命打击
后面再升级2级安全护卫，原定计划里压吃一堑，最坏的打算，拘留，这样上来哪个弱点都是可以快速解决的，后面附魔武器给符文斧贴
"""


def _starter_deck(
    *,
    deck_id: str,
    name: str,
    investigator_code: str,
    investigator_name: str,
    slots: str,
    side_slots: str,
    notes: str,
    customizations: dict[str, str] | None = None,
) -> dict[str, Any]:
    url = f"https://arkham.build/deck/view/{deck_id}"
    meta = {"arkham_horror_description_md": notes, **(customizations or {})}
    return {
        "name": name,
        "investigator_name": investigator_name,
        "url": url,
        "list": {
            "id": deck_id,
            "investigator_code": f"c{investigator_code}",
            "investigator_name": investigator_name,
            "meta": json.dumps(meta, ensure_ascii=False, separators=(",", ":")),
            "name": name,
            "sideSlots": _slots(side_slots),
            "slots": _slots(slots),
            "taboo_id": 10,
            "url": url,
        },
    }


STARTER_DECKS = (
    _starter_deck(
        deck_id="qewhl3Do4yFlzop",
        name="间谍 运转至上 古神级",
        investigator_code="07003",
        investigator_name="Trish Scarborough",
        slots="""
            01030:1 01048:1 01090:2 02022:2 03308:1 05116:1 06024:1 06159:1
            06197:2 07010:1 07011:1 07028:2 08125:1 09052:1 10048:2 10067:1
            12038:2 12039:2 12050:2 60104:1 60215:2 60268:2 60310:1 60370:2
        """,
        side_slots="""
            01695:1 02189:1 02266:1 05320:1 06198:2 08036:2 08050:2 08055:1
            08113:1 08114:1 09060:2 12056:2 12095:1 51003:1 60228:2 60275:2 60373:2
        """,
        notes=TRISH_NOTES,
    ),
    _starter_deck(
        deck_id="DYKly6vcYWthFOi",
        name="马克，运转至上 古神级",
        investigator_code="03001",
        investigator_name="Mark Harrigan",
        slots="""
            01020:1 01021:1 01088:2 01091:2 02022:2 02116:1 02147:1 02184:1
            03007:1 03008:1 03009:1 04149:1 04150:1 05313:1 06111:2 06197:2
            08125:1 09022:2 09121:1 10023:1 12025:2 60110:1 60115:2 60161:2
            60165:1 60554:1
        """,
        side_slots="""
            02148:1 03023:1 03264:1 06156:1 06196:2 07261:1 09038:1 10032:1
            51001:1 54002:1 60126:2 60176:2
        """,
        notes=MARK_NOTES,
        customizations={"cus_09022": "0|0,1|1,4|0,5|2,7|0"},
    ),
)


class OnlineApi:
    def __init__(self) -> None:
        self.jwt_secret = os.environ["JWT_SECRET"]
        self.backend = os.getenv("ARKHAM_BACKEND", "http://127.0.0.1:39102")
        self.public_base_url = os.getenv("PUBLIC_BASE_URL", "http://arkham-horror.online").rstrip("/")
        self.mailtrap_token = os.getenv("MAILTRAP_API_TOKEN", "")
        self.require_email_verification = os.getenv("REQUIRE_EMAIL_VERIFICATION", "true").lower() == "true"
        self.mail_from = os.getenv("MAIL_FROM", "noreply@arkham-horror.online")
        pg_root = Path(os.getenv("ARKHAM_PG_ROOT", "/opt/arkham-horror/game/pgsql"))
        self.psql = str(pg_root / "bin" / "psql")
        self.pg_lib = str(pg_root / "lib")
        self.pg_socket = os.getenv("ARKHAM_PG_SOCKET", "/opt/arkham-horror/game/data")
        self.pg_port = os.getenv("ARKHAM_PG_PORT", "15434")
        self.pg_user = os.getenv("ARKHAM_PG_USER", "arkham_sidecar")
        self.pg_password = os.getenv("ARKHAM_PG_PASSWORD", "")
        self.pg_database = os.getenv("ARKHAM_PG_DATABASE", "arkham-horror-backend")
        self.bug_reports_dir = Path(
            os.getenv("ARKHAM_BUG_REPORTS_DIR", "/var/lib/arkham-horror-public-v2/bug-reports")
        )
        self.archive_dir = Path(
            os.getenv("ARKHAM_ARCHIVE_DIR", "/var/lib/arkham-horror-public-v2/archives")
        )
        self.bug_admin_password = os.getenv("BUG_ADMIN_PASSWORD", "960504")
        self.session: ClientSession | None = None
        self.bug_lock = asyncio.Lock()
        self.archive_lock = asyncio.Lock()

    async def start(self, _app: web.Application) -> None:
        self.session = ClientSession(timeout=ClientTimeout(total=120), auto_decompress=False)
        self.bug_reports_dir.mkdir(parents=True, exist_ok=True)
        (self.bug_reports_dir / "entries").mkdir(exist_ok=True)
        (self.bug_reports_dir / "snapshots").mkdir(exist_ok=True)
        self.archive_dir.mkdir(parents=True, exist_ok=True)

    async def stop(self, _app: web.Application) -> None:
        if self.session:
            await self.session.close()

    async def sql(self, query: str, **variables: str) -> str:
        args = self.psql_args(**variables)
        process = await asyncio.create_subprocess_exec(
            *args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=self.psql_env(),
        )
        stdout, stderr = await process.communicate(query.encode())
        if process.returncode:
            raise RuntimeError(stderr.decode().strip())
        return stdout.decode().strip()

    def psql_args(self, **variables: str) -> list[str]:
        args = [
            self.psql,
            "-h", self.pg_socket,
            "-p", self.pg_port,
            "-U", self.pg_user,
            "-d", self.pg_database,
            "-Atq",
            "-F", "\t",
            "-v", "ON_ERROR_STOP=1",
        ]
        for key, value in variables.items():
            args.extend(["-v", f"{key}={value}"])
        return args

    def psql_env(self) -> dict[str, str]:
        env = os.environ.copy()
        env["LD_LIBRARY_PATH"] = self.pg_lib
        if self.pg_password:
            env["PGPASSWORD"] = self.pg_password
        return env

    def pg_connect_kwargs(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "host": self.pg_socket,
            "port": int(self.pg_port),
            "user": self.pg_user,
            "dbname": self.pg_database,
        }
        if self.pg_password:
            result["password"] = self.pg_password
        return result

    @asynccontextmanager
    async def quota_lock(self, user_id: int):
        connection = await psycopg.AsyncConnection.connect(
            **self.pg_connect_kwargs(), autocommit=True
        )
        try:
            await connection.execute(
                "SELECT pg_advisory_lock(hashtextextended(%s, 0));",
                (f"arkham-quota:{user_id}",),
            )
            yield connection
        finally:
            try:
                await connection.execute(
                    "SELECT pg_advisory_unlock(hashtextextended(%s, 0));",
                    (f"arkham-quota:{user_id}",),
                )
            finally:
                await connection.close()

    def require_user(self, request: web.Request) -> int:
        user_id = token_user_id(request.headers.get("Authorization"), self.jwt_secret)
        if user_id is None:
            raise web.HTTPUnauthorized(text=json.dumps({"message": "请先登录"}), content_type="application/json")
        return user_id

    async def user_info(self, user_id: int) -> dict[str, str]:
        row = await self.sql(
            "SELECT username, email FROM users WHERE id=:'user_id'::bigint LIMIT 1;",
            user_id=str(user_id),
        )
        if not row:
            return {"id": str(user_id), "username": "", "email": ""}
        username, email = (row.split("\t", 1) + [""])[:2]
        return {"id": str(user_id), "username": username, "email": email}

    async def create_user_with_starter_decks(
        self,
        username: str,
        email: str,
        password_hash: str,
        *,
        pending_email: str | None = None,
    ) -> int:
        connection = await psycopg.AsyncConnection.connect(**self.pg_connect_kwargs())
        try:
            async with connection.transaction():
                cursor = await connection.execute(
                    """
                    INSERT INTO users (username, email, password_digest, beta, admin)
                    VALUES (%s, %s, %s, false, false)
                    RETURNING id;
                    """,
                    (username, email, password_hash),
                )
                row = await cursor.fetchone()
                if row is None:
                    raise RuntimeError("registration did not return a user id")
                user_id = int(row[0])
                for deck in STARTER_DECKS:
                    await connection.execute(
                        """
                        INSERT INTO arkham_decks
                          (id, user_id, name, investigator_name, list, url)
                        VALUES (%s, %s, %s, %s, %s::jsonb, %s);
                        """,
                        (
                            uuid.uuid4(),
                            user_id,
                            deck["name"],
                            deck["investigator_name"],
                            json.dumps(deck["list"], ensure_ascii=False, separators=(",", ":")),
                            deck["url"],
                        ),
                    )
                if pending_email is not None:
                    await connection.execute(
                        "DELETE FROM pending_registrations WHERE email=%s;",
                        (pending_email,),
                    )
            return user_id
        finally:
            await connection.close()

    def bug_index_path(self) -> Path:
        return self.bug_reports_dir / "index.json"

    def read_bug_reports(self) -> list[dict[str, Any]]:
        path = self.bug_index_path()
        if not path.exists():
            return []
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return [item for item in data if isinstance(item, dict)]
        except (OSError, json.JSONDecodeError):
            pass
        return []

    def write_bug_reports(self, reports: list[dict[str, Any]]) -> None:
        path = self.bug_index_path()
        tmp_path = path.with_suffix(".json.tmp")
        tmp_path.write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp_path.replace(path)

    def write_bug_report_text(self, report: dict[str, Any]) -> None:
        text_path = self.bug_reports_dir / str(report["textFile"])
        text_path.parent.mkdir(parents=True, exist_ok=True)
        lines = [
            f"Bug ID: {report['id']}",
            f"Created At: {report['createdAt']}",
            f"Updated At: {report['updatedAt']}",
            f"Game ID: {report['gameId']}",
            f"Submitter User ID: {report['submitterUserId']}",
            f"Submitter Username: {report.get('submitterUsername', '')}",
            f"Submitter Email: {report.get('submitterEmail', '')}",
            f"Page URL: {report.get('pageUrl') or ''}",
            "",
            f"Title: {report['title']}",
            "",
            "Description:",
            str(report["description"]),
            "",
        ]
        text_path.write_text("\n".join(lines), encoding="utf-8")

    def clean_bug_title(self, value: Any) -> str:
        title = str(value or "").strip()
        return title[:160] or "未命名Bug"

    def clean_bug_description(self, value: Any) -> str:
        return str(value or "").strip()[:20000]

    def bug_report_file(self, relative_path: str) -> Path | None:
        if not relative_path:
            return None
        root = self.bug_reports_dir.resolve()
        candidate = (root / relative_path).resolve()
        if candidate != root and root not in candidate.parents:
            return None
        return candidate

    def game_export_sync(self, game_id: str, step_limit: int = 30) -> dict[str, Any] | None:
        with psycopg.connect(**self.pg_connect_kwargs(), row_factory=dict_row) as connection:
            cursor = connection.cursor()
            cursor.execute(
                "SELECT * FROM arkham_games WHERE id=%s::uuid;",
                (game_id,),
            )
            game = cursor.fetchone()
            if not game:
                return None
            cursor.execute(
                "SELECT * FROM arkham_players WHERE arkham_game_id=%s::uuid ORDER BY investigator_id;",
                (game_id,),
            )
            players = cursor.fetchall()
            cursor.execute(
                """
                SELECT * FROM arkham_steps
                WHERE arkham_game_id=%s::uuid
                ORDER BY step DESC
                LIMIT %s;
                """,
                (game_id, step_limit),
            )
            steps = cursor.fetchall()
        return self.full_export_from_snapshot(
            {
                "game": game,
                "players": players,
                "steps": steps,
            }
        )

    def write_bug_snapshot(self, relative_path: str, game_id: str) -> int:
        snapshot = self.game_export_sync(game_id, step_limit=30)
        if snapshot is None:
            raise FileNotFoundError(game_id)
        snapshot_path = self.bug_report_file(relative_path)
        if snapshot_path is None:
            raise ValueError("invalid bug snapshot path")
        self.atomic_write_json(snapshot_path, snapshot)
        return len(snapshot["steps"])

    def bug_export_markdown(
        self,
        reports: list[dict[str, Any]],
        snapshot_files: dict[str, str | None],
    ) -> str:
        generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        lines = [
            "# Arkham Horror Bug 列表",
            "",
            f"- 导出时间：{generated_at}",
            f"- Bug 数量：{len(reports)}",
            "- 存档范围：提交时最近 30 步；旧报告若无快照，则使用导出时仍可读取的最近 30 步。",
            "",
        ]
        for index, report in enumerate(reports, start=1):
            bug_id = str(report.get("id", ""))
            snapshot_name = snapshot_files.get(bug_id)
            lines.extend(
                [
                    f"## {index}. {report.get('title') or '未命名Bug'}",
                    "",
                    f"- Bug ID：{bug_id}",
                    f"- 创建时间：{report.get('createdAt', '')}",
                    f"- 更新时间：{report.get('updatedAt', '')}",
                    f"- 游戏 ID：{report.get('gameId', '')}",
                    (
                        f"- 提交者：{report.get('submitterUsername', '')} "
                        f"(用户 ID：{report.get('submitterUserId', '')}，"
                        f"邮箱：{report.get('submitterEmail', '')})"
                    ),
                    f"- 页面：{report.get('pageUrl') or '无'}",
                    f"- 存档：{snapshot_name or '不可用（游戏已删除或数据库中不存在）'}",
                    "",
                    "### 描述",
                    "",
                    str(report.get("description") or "无"),
                    "",
                ]
            )
        return "\n".join(lines)

    def build_bug_export_zip(self, reports: list[dict[str, Any]]) -> bytes:
        output = io.BytesIO()
        snapshot_files: dict[str, str | None] = {}
        snapshots: dict[str, bytes] = {}
        for report in reports:
            bug_id = str(report.get("id", ""))
            game_id = str(report.get("gameId", ""))
            archive_name = f"saves/{bug_id}-{game_id}.json"
            snapshot_bytes: bytes | None = None
            snapshot_path = self.bug_report_file(str(report.get("exportFile") or ""))
            if snapshot_path and snapshot_path.is_file():
                snapshot_bytes = snapshot_path.read_bytes()
            elif GAME_ID_RE.fullmatch(game_id):
                snapshot = self.game_export_sync(game_id, step_limit=30)
                if snapshot is not None:
                    snapshot_bytes = json.dumps(
                        snapshot,
                        ensure_ascii=False,
                        separators=(",", ":"),
                        default=self.json_default,
                    ).encode()
            if snapshot_bytes is not None:
                snapshot_files[bug_id] = archive_name
                snapshots[archive_name] = snapshot_bytes
            else:
                snapshot_files[bug_id] = None

        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("bug-list.md", self.bug_export_markdown(reports, snapshot_files))
            for archive_name, snapshot_bytes in snapshots.items():
                archive.writestr(archive_name, snapshot_bytes)
        return output.getvalue()

    async def bugs(self, request: web.Request) -> web.Response:
        user_id = self.require_user(request)
        rows = await self.sql(
            "SELECT arkham_game_id::text FROM arkham_players WHERE user_id=:'user_id'::bigint;",
            user_id=str(user_id),
        )
        accessible_games = set(rows.splitlines()) if rows else set()
        async with self.bug_lock:
            reports = [
                {
                    **report,
                    "canOpenPage": str(report.get("gameId", "")) in accessible_games,
                    "hasSnapshot": bool(
                        (snapshot_path := self.bug_report_file(str(report.get("exportFile") or "")))
                        and snapshot_path.is_file()
                    ),
                }
                for report in self.read_bug_reports()
            ]
        return web.json_response(reports)

    async def bug_admin_login(self, request: web.Request) -> web.Response:
        try:
            payload = await request.json()
        except json.JSONDecodeError:
            payload = {}
        return web.json_response({"ok": str(payload.get("password", "")) == self.bug_admin_password})

    def require_bug_admin(self, payload: dict[str, Any]) -> None:
        if str(payload.get("password", "")) != self.bug_admin_password:
            raise web.HTTPForbidden(text=json.dumps({"message": "管理员密码错误"}), content_type="application/json")

    async def update_bug(self, request: web.Request) -> web.Response:
        try:
            payload = await request.json()
        except json.JSONDecodeError:
            raise web.HTTPBadRequest(text=json.dumps({"message": "请求格式不正确"}), content_type="application/json")
        self.require_bug_admin(payload)
        bug_id = request.match_info["bug_id"]
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        async with self.bug_lock:
            reports = self.read_bug_reports()
            for report in reports:
                if report.get("id") == bug_id:
                    report["title"] = self.clean_bug_title(payload.get("title"))
                    report["description"] = self.clean_bug_description(payload.get("description"))
                    report["updatedAt"] = now
                    self.write_bug_report_text(report)
                    self.write_bug_reports(reports)
                    return web.json_response(report)
        raise web.HTTPNotFound(text=json.dumps({"message": "Bug报告不存在"}), content_type="application/json")

    async def delete_bug(self, request: web.Request) -> web.Response:
        try:
            payload = await request.json()
        except json.JSONDecodeError:
            payload = {}
        self.require_bug_admin(payload)
        bug_id = request.match_info["bug_id"]
        async with self.bug_lock:
            reports = self.read_bug_reports()
            kept = [report for report in reports if report.get("id") != bug_id]
            if len(kept) == len(reports):
                raise web.HTTPNotFound(text=json.dumps({"message": "Bug报告不存在"}), content_type="application/json")
            for report in reports:
                if report.get("id") != bug_id:
                    continue
                for key in ("textFile", "exportFile"):
                    report_path = self.bug_report_file(str(report.get(key) or ""))
                    if report_path:
                        try:
                            report_path.unlink()
                        except FileNotFoundError:
                            pass
            self.write_bug_reports(kept)
        return web.json_response({"ok": True})

    async def export_bugs(self, request: web.Request) -> web.Response:
        try:
            payload = await request.json()
        except json.JSONDecodeError:
            payload = {}
        self.require_bug_admin(payload)
        async with self.bug_lock:
            reports = self.read_bug_reports()
        archive = await asyncio.to_thread(self.build_bug_export_zip, reports)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        return web.Response(
            body=archive,
            headers={
                "Content-Type": "application/zip",
                "Content-Disposition": f'attachment; filename="arkham-bugs-{timestamp}.zip"',
                "Cache-Control": "no-store",
            },
        )

    async def file_bug(self, request: web.Request) -> web.Response:
        user_id = self.require_user(request)
        game_id = request.match_info["game_id"]
        if not GAME_ID_RE.fullmatch(game_id):
            raise web.HTTPNotFound()
        membership = await self.sql(
            "SELECT 1 FROM arkham_players WHERE user_id=:'user_id'::bigint AND arkham_game_id=:'game_id'::uuid LIMIT 1;",
            user_id=str(user_id),
            game_id=game_id,
        )
        if not membership:
            raise web.HTTPNotFound(text=json.dumps({"message": "未找到可提交的剧本"}), content_type="application/json")
        try:
            payload = await request.json()
        except json.JSONDecodeError:
            raise web.HTTPBadRequest(text=json.dumps({"message": "请求格式不正确"}), content_type="application/json")
        user = await self.user_info(user_id)
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        bug_id = str(uuid.uuid4())
        snapshot_relative = f"snapshots/{bug_id}.json"
        report = {
            "id": bug_id,
            "createdAt": now,
            "updatedAt": now,
            "gameId": game_id,
            "submitterUserId": user["id"],
            "submitterUsername": user["username"],
            "submitterEmail": user["email"],
            "title": self.clean_bug_title(payload.get("title")),
            "description": self.clean_bug_description(payload.get("description")),
            "pageUrl": str(payload.get("pageUrl") or "") or None,
            "textFile": f"entries/{bug_id}.txt",
            "exportFile": snapshot_relative,
        }
        try:
            report["snapshotStepCount"] = await asyncio.to_thread(
                self.write_bug_snapshot,
                snapshot_relative,
                game_id,
            )
        except (FileNotFoundError, OSError, RuntimeError, ValueError):
            report["exportFile"] = ""
            report["snapshotStepCount"] = 0
            report["snapshotError"] = "提交时未能生成存档快照"
        async with self.bug_lock:
            reports = self.read_bug_reports()
            self.write_bug_report_text(report)
            self.write_bug_reports([report, *reports])
        return web.json_response(report)

    async def proxy(self, request: web.Request) -> web.Response:
        assert self.session is not None
        body = await request.read()
        headers = {
            key: value for key, value in request.headers.items()
            if key.lower() not in {"host", "content-length", "connection", "upgrade"}
        }
        async with self.session.request(
            request.method,
            f"{self.backend}{request.rel_url}",
            data=body,
            headers=headers,
            allow_redirects=False,
        ) as response:
            response_body = await response.read()
            response_headers = {
                key: value for key, value in response.headers.items()
                if key.lower() not in {"content-length", "transfer-encoding", "connection"}
            }
            return web.Response(status=response.status, body=response_body, headers=response_headers)

    async def send_code(self, email: str, code: str) -> None:
        if not self.mailtrap_token:
            raise web.HTTPServiceUnavailable(
                text=json.dumps({"message": "邮件服务尚未配置"}),
                content_type="application/json",
            )
        assert self.session is not None
        payload = {
            "from": {"email": self.mail_from, "name": "Arkham Horror Online"},
            "to": [{"email": email}],
            "subject": "Arkham Horror Online 邮箱验证码",
            "text": f"你的验证码是 {code}。验证码在 10 分钟内有效；如果不是你本人操作，请忽略本邮件。",
            "category": "Registration Verification",
        }
        async with self.session.post(
            "https://send.api.mailtrap.io/api/send",
            json=payload,
            headers={
                "Authorization": f"Bearer {self.mailtrap_token}",
                "User-Agent": "ArkhamHorrorOnline/1.0",
            },
        ) as response:
            if response.status >= 300:
                raise web.HTTPBadGateway(
                    text=json.dumps({"message": "验证码邮件发送失败"}),
                    content_type="application/json",
                )

    async def send_password_reset(self, email: str, token: str) -> None:
        if not self.mailtrap_token:
            raise web.HTTPServiceUnavailable(
                text=json.dumps({"message": "邮件服务尚未配置"}),
                content_type="application/json",
            )
        assert self.session is not None
        url = f"{self.public_base_url}/#/password-reset/{token}"
        payload = {
            "from": {"email": self.mail_from, "name": "Arkham Horror Online"},
            "to": [{"email": email}],
            "subject": "Arkham Horror Online 密码重置",
            "text": "\n".join(
                [
                    "你请求重置 Arkham Horror Online 的密码。",
                    "",
                    "请点击下面的链接设置新密码：",
                    "",
                    url,
                    "",
                    "如果不是你本人操作，请忽略本邮件。",
                ]
            ),
            "category": "Password Reset",
        }
        async with self.session.post(
            "https://send.api.mailtrap.io/api/send",
            json=payload,
            headers={
                "Authorization": f"Bearer {self.mailtrap_token}",
                "User-Agent": "ArkhamHorrorOnline/1.0",
            },
        ) as response:
            if response.status >= 300:
                raise web.HTTPBadGateway(
                    text=json.dumps({"message": "密码重置邮件发送失败"}),
                    content_type="application/json",
                )

    async def request_password_reset(self, request: web.Request) -> web.Response:
        try:
            payload = await request.json()
        except json.JSONDecodeError:
            raise web.HTTPBadRequest(text=json.dumps({"message": "请求格式不正确"}), content_type="application/json")
        email = str(payload.get("email", "")).strip().lower()
        if parseaddr(email)[1] != email or "@" not in email:
            raise web.HTTPBadRequest(text=json.dumps({"message": "邮箱格式不正确"}), content_type="application/json")

        user_id = await self.sql("SELECT id FROM users WHERE lower(email)=:'email' LIMIT 1;", email=email)
        if not user_id:
            return web.Response(status=204)
        reset_id = await self.sql(
            """
            INSERT INTO password_resets (user_id, expires_at)
            VALUES (:'user_id'::bigint, now() + interval '1 day')
            RETURNING id;
            """,
            user_id=user_id.splitlines()[0],
        )
        await self.send_password_reset(email, reset_id.splitlines()[0])
        return web.Response(status=204)

    async def register(self, request: web.Request) -> web.Response:
        try:
            username, email, password = validate_registration(await request.json())
        except (ValueError, json.JSONDecodeError) as exc:
            raise web.HTTPBadRequest(text=json.dumps({"message": str(exc)}), content_type="application/json")
        if not self.require_email_verification:
            duplicate = await self.sql(
                "SELECT 1 FROM users WHERE lower(username)=lower(:'username') OR lower(email)=:'email' LIMIT 1;",
                username=username,
                email=email,
            )
            if duplicate:
                raise web.HTTPConflict(
                    text=json.dumps({"message": "用户名或邮箱已被使用"}), content_type="application/json"
                )
            password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()
            try:
                user_id = await self.create_user_with_starter_decks(username, email, password_hash)
            except psycopg.Error:
                raise web.HTTPConflict(
                    text=json.dumps({"message": "用户名或邮箱已被使用"}), content_type="application/json"
                )
            return web.json_response({"token": make_token(user_id, self.jwt_secret)})
        if not self.mailtrap_token:
            raise web.HTTPServiceUnavailable(
                text=json.dumps({"message": "邮件服务尚未配置"}), content_type="application/json"
            )

        duplicate = await self.sql(
            "SELECT 1 FROM users WHERE lower(username)=lower(:'username') OR lower(email)=:'email' LIMIT 1;",
            username=username,
            email=email,
        )
        if duplicate:
            raise web.HTTPConflict(
                text=json.dumps({"message": "用户名或邮箱已被使用"}), content_type="application/json"
            )

        cooling_down = await self.sql(
            "SELECT 1 FROM pending_registrations WHERE (email=:'email' OR username=:'username') AND last_sent_at > now() - interval '60 seconds';",
            email=email,
            username=username,
        )
        if cooling_down:
            raise web.HTTPTooManyRequests(
                text=json.dumps({"message": "请等待 60 秒后重新发送"}), content_type="application/json"
            )

        code = f"{secrets.randbelow(1_000_000):06d}"
        password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()
        digest = code_digest(email, code, self.jwt_secret)
        try:
            await self.sql(
                """
                DELETE FROM pending_registrations WHERE expires_at < now();
                DELETE FROM pending_registrations WHERE email=:'email' OR username=:'username';
                INSERT INTO pending_registrations
                  (email, username, password_digest, code_digest, expires_at, attempts, last_sent_at)
                VALUES
                  (:'email', :'username', :'password_hash', :'digest', now() + interval '10 minutes', 0, now());
                """,
                email=email,
                username=username,
                password_hash=password_hash,
                digest=digest,
            )
            await self.send_code(email, code)
        except web.HTTPException:
            await self.sql("DELETE FROM pending_registrations WHERE email=:'email';", email=email)
            raise
        except RuntimeError:
            raise web.HTTPConflict(
                text=json.dumps({"message": "用户名或邮箱正在等待验证"}), content_type="application/json"
            )
        return web.json_response({"verificationRequired": True, "email": email})

    async def verify(self, request: web.Request) -> web.Response:
        try:
            payload = await request.json()
        except json.JSONDecodeError:
            raise web.HTTPBadRequest(text=json.dumps({"message": "请求格式不正确"}), content_type="application/json")
        email = str(payload.get("email", "")).strip().lower()
        code = str(payload.get("code", "")).strip()
        if not re.fullmatch(r"\d{6}", code):
            raise web.HTTPBadRequest(text=json.dumps({"message": "请输入 6 位验证码"}), content_type="application/json")
        row = await self.sql(
            """
            SELECT username, password_digest, code_digest, attempts,
                   CASE WHEN expires_at > now() THEN 1 ELSE 0 END
            FROM pending_registrations WHERE email=:'email';
            """,
            email=email,
        )
        if not row:
            raise web.HTTPBadRequest(text=json.dumps({"message": "验证码不存在或已失效"}), content_type="application/json")
        username, password_hash, expected, attempts, valid = row.split("\t")
        if valid != "1" or int(attempts) >= MAX_CODE_ATTEMPTS:
            await self.sql("DELETE FROM pending_registrations WHERE email=:'email';", email=email)
            raise web.HTTPBadRequest(text=json.dumps({"message": "验证码不存在或已失效"}), content_type="application/json")
        if not hmac.compare_digest(expected, code_digest(email, code, self.jwt_secret)):
            await self.sql(
                "UPDATE pending_registrations SET attempts=attempts+1 WHERE email=:'email';",
                email=email,
            )
            raise web.HTTPBadRequest(text=json.dumps({"message": "验证码错误"}), content_type="application/json")
        try:
            user_id = await self.create_user_with_starter_decks(
                username,
                email,
                password_hash,
                pending_email=email,
            )
        except (RuntimeError, psycopg.Error):
            raise web.HTTPConflict(text=json.dumps({"message": "用户名或邮箱已被使用"}), content_type="application/json")
        return web.json_response({"token": make_token(user_id, self.jwt_secret)})

    async def open_game_count(self, user_id: int, connection: Any = None) -> int:
        if connection is not None:
            cursor = await connection.execute(
                """
                SELECT count(DISTINCT p.arkham_game_id)
                FROM arkham_players p
                WHERE p.user_id=%s
                  AND EXISTS (SELECT 1 FROM arkham_steps s WHERE s.arkham_game_id=p.arkham_game_id);
                """,
                (user_id,),
            )
            row = await cursor.fetchone()
            return int(row[0] if row else 0)
        result = await self.sql(
            """
            SELECT count(DISTINCT p.arkham_game_id)
            FROM arkham_players p
            WHERE p.user_id=:'user_id'::bigint
              AND EXISTS (SELECT 1 FROM arkham_steps s WHERE s.arkham_game_id=p.arkham_game_id);
            """,
            user_id=str(user_id),
        )
        return int(result or 0)

    async def enforce_game_limit(
        self, request: web.Request, game_id: str | None = None, connection: Any = None
    ) -> None:
        user_id = self.require_user(request)
        if MAX_OPEN_GAMES <= 0:
            return
        if game_id:
            if connection is None:
                existing = await self.sql(
                    "SELECT 1 FROM arkham_players WHERE user_id=:'user_id'::bigint AND arkham_game_id=:'game_id'::uuid LIMIT 1;",
                    user_id=str(user_id),
                    game_id=game_id,
                )
            else:
                cursor = await connection.execute(
                    "SELECT 1 FROM arkham_players WHERE user_id=%s AND arkham_game_id=%s::uuid LIMIT 1;",
                    (user_id, game_id),
                )
                existing = await cursor.fetchone()
            if existing:
                return
        if await self.open_game_count(user_id, connection) >= MAX_OPEN_GAMES:
            raise web.HTTPConflict(
                text=json.dumps({"message": f"每个账号最多保留 {MAX_OPEN_GAMES} 个未归档剧本"}),
                content_type="application/json",
            )

    async def games(self, request: web.Request) -> web.Response:
        if request.method != "POST":
            return await self.proxy(request)
        user_id = self.require_user(request)
        async with self.quota_lock(user_id) as connection:
            await self.enforce_game_limit(request, connection=connection)
            return await self.proxy(request)

    async def import_game(self, request: web.Request) -> web.Response:
        user_id = self.require_user(request)
        async with self.quota_lock(user_id) as connection:
            await self.enforce_game_limit(request, connection=connection)
            return await self.proxy(request)

    async def join_game(self, request: web.Request) -> web.Response:
        user_id = self.require_user(request)
        async with self.quota_lock(user_id) as connection:
            await self.enforce_game_limit(
                request, request.match_info["game_id"], connection
            )
            return await self.proxy(request)

    async def proxy_join(self, request: web.Request) -> web.Response:
        return await self.proxy(request)

    async def archive_status(self, request: web.Request) -> web.Response:
        user_id = self.require_user(request)
        game_id = request.match_info["game_id"]
        if not GAME_ID_RE.fullmatch(game_id):
            raise web.HTTPNotFound()
        result = await self.sql(
            """
            SELECT CASE WHEN EXISTS (SELECT 1 FROM arkham_steps s WHERE s.arkham_game_id=:'game_id'::uuid)
                        THEN 0 ELSE 1 END
            FROM arkham_players p
            WHERE p.user_id=:'user_id'::bigint AND p.arkham_game_id=:'game_id'::uuid;
            """,
            user_id=str(user_id),
            game_id=game_id,
        )
        if not result:
            raise web.HTTPNotFound()
        return web.json_response({"archived": result == "1"})

    async def full_export(self, request: web.Request) -> web.StreamResponse:
        user_id = self.require_user(request)
        game_id = request.match_info["game_id"]
        if not GAME_ID_RE.fullmatch(game_id):
            raise web.HTTPNotFound()
        metadata = await self.sql(
            """
            SELECT json_build_object(
              'campaignPlayers', (SELECT coalesce(json_agg(p2.investigator_id), '[]'::json)
                                  FROM arkham_players p2 WHERE p2.arkham_game_id=g.id),
              'name', g.name,
              'currentData', g.current_data,
              'step', g.step,
              'multiplayerVariant', g.multiplayer_variant
            )::text
            FROM arkham_games g
            WHERE g.id=:'game_id'::uuid
              AND EXISTS (SELECT 1 FROM arkham_players p
                          WHERE p.arkham_game_id=g.id AND p.user_id=:'user_id'::bigint);
            """,
            game_id=game_id,
            user_id=str(user_id),
        )
        if not metadata:
            raise web.HTTPNotFound()
        data = json.loads(metadata)
        response = web.StreamResponse(
            headers={
                "Content-Type": "application/json",
                "Content-Disposition": f'attachment; filename="arkham-full-export-{game_id}.json"',
            }
        )
        await response.prepare(request)
        prefix = {
            "campaignPlayers": data["campaignPlayers"],
            "campaignData": {
                "name": data["name"],
                "currentData": data["currentData"],
                "step": data["step"],
            },
        }
        encoded = json.dumps(prefix, ensure_ascii=False, separators=(",", ":"))
        await response.write(encoded[:-2].encode() + b',"steps":[')

        query = """
        SELECT json_build_object(
          'arkhamGameId', arkham_game_id,
          'choice', choice,
          'step', step,
          'actionDiff', action_diff
        )::text
        FROM arkham_steps WHERE arkham_game_id=:'game_id'::uuid ORDER BY step DESC;
        """
        process = await asyncio.create_subprocess_exec(
            *self.psql_args(game_id=game_id),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=self.psql_env(),
        )
        assert process.stdin and process.stdout
        process.stdin.write(query.encode())
        await process.stdin.drain()
        process.stdin.close()
        first = True
        async for line in process.stdout:
            line = line.strip()
            if not line:
                continue
            if not first:
                await response.write(b",")
            first = False
            await response.write(line)
        if await process.wait():
            raise RuntimeError("full export query failed")
        suffix = json.dumps(data["multiplayerVariant"], ensure_ascii=False)
        await response.write(f'],"log":[],"multiplayerVariant":{suffix}}}}}'.encode())
        await response.write_eof()
        return response

    @staticmethod
    def json_default(value: Any) -> str:
        if isinstance(value, (datetime, uuid.UUID)):
            return value.isoformat() if isinstance(value, datetime) else str(value)
        if isinstance(value, bytes):
            return base64.b64encode(value).decode()
        return str(value)

    @staticmethod
    def game_state_tag(current_data: Any) -> str | None:
        if isinstance(current_data, str):
            try:
                current_data = json.loads(current_data)
            except json.JSONDecodeError:
                return None
        if not isinstance(current_data, dict):
            return None
        for candidate in (
            current_data,
            current_data.get("game"),
            current_data.get("currentData"),
        ):
            if not isinstance(candidate, dict):
                continue
            state = candidate.get("gameState")
            if isinstance(state, dict) and isinstance(state.get("tag"), str):
                return state["tag"]
        return None

    def atomic_write_json(self, path: Path, value: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
        try:
            with temporary.open("w", encoding="utf-8") as handle:
                json.dump(
                    value,
                    handle,
                    ensure_ascii=False,
                    separators=(",", ":"),
                    default=self.json_default,
                )
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            temporary.replace(path)
        finally:
            try:
                temporary.unlink()
            except FileNotFoundError:
                pass

    @staticmethod
    def full_export_from_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
        game = snapshot["game"]
        return {
            "campaignPlayers": [player["investigator_id"] for player in snapshot["players"]],
            "campaignData": {
                "name": game["name"],
                "currentData": game["current_data"],
                "step": game["step"],
            },
            "steps": [
                {
                    "arkhamGameId": step["arkham_game_id"],
                    "choice": step["choice"],
                    "step": step["step"],
                    "actionDiff": step["action_diff"],
                }
                for step in snapshot["steps"]
            ],
            "log": [],
            "multiplayerVariant": game["multiplayer_variant"],
        }

    def archive_game_sync(self, user_id: int, game_id: str) -> dict[str, Any]:
        with psycopg.connect(**self.pg_connect_kwargs(), row_factory=dict_row) as connection:
            with connection.transaction():
                cursor = connection.cursor()
                cursor.execute(
                    "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0));",
                    (f"arkham-archive:{game_id}",),
                )
                cursor.execute(
                    """
                    SELECT g.*
                    FROM arkham_games g
                    WHERE g.id=%s::uuid
                      AND EXISTS (
                        SELECT 1 FROM arkham_players p
                        WHERE p.arkham_game_id=g.id AND p.user_id=%s
                      );
                    """,
                    (game_id, user_id),
                )
                game = cursor.fetchone()
                if not game:
                    raise ArchiveNotFound()
                if self.game_state_tag(game["current_data"]) != "IsOver":
                    raise ArchiveNotEnded()

                snapshot: dict[str, Any] = {
                    "schemaVersion": 1,
                    "archivedAt": datetime.now(timezone.utc),
                    "game": game,
                }
                for key, table in (
                    ("players", "arkham_players"),
                    ("steps", "arkham_steps"),
                    ("logEntries", "arkham_log_entries"),
                    ("undoFloors", "arkham_game_undo_floors"),
                    ("mlDecisions", "arkham_ml_decisions"),
                ):
                    cursor.execute(
                        f"SELECT * FROM {table} WHERE arkham_game_id=%s::uuid;",
                        (game_id,),
                    )
                    snapshot[key] = cursor.fetchall()
                snapshot["steps"].sort(key=lambda row: row["step"], reverse=True)
                if not snapshot["steps"]:
                    raise ArchiveAlreadyComplete()

                timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
                output_dir = self.archive_dir / game_id / timestamp
                database_backup = output_dir / "database-backup.json"
                full_export = output_dir / f"arkham-full-export-{game_id}.json"
                self.atomic_write_json(database_backup, snapshot)
                self.atomic_write_json(full_export, self.full_export_from_snapshot(snapshot))

                deleted: dict[str, int] = {}
                for key, table in (
                    ("logEntries", "arkham_log_entries"),
                    ("undoFloors", "arkham_game_undo_floors"),
                    ("mlDecisions", "arkham_ml_decisions"),
                    ("steps", "arkham_steps"),
                ):
                    cursor.execute(
                        f"DELETE FROM {table} WHERE arkham_game_id=%s::uuid;",
                        (game_id,),
                    )
                    deleted[key] = cursor.rowcount

        return {
            "archived": True,
            "deletedSteps": deleted["steps"],
            "backup": str(database_backup.relative_to(self.archive_dir)),
            "fullExport": str(full_export.relative_to(self.archive_dir)),
        }

    async def archive(self, request: web.Request) -> web.Response:
        user_id = self.require_user(request)
        game_id = request.match_info["game_id"]
        if not GAME_ID_RE.fullmatch(game_id):
            raise web.HTTPNotFound()
        try:
            async with self.archive_lock:
                result = await asyncio.to_thread(self.archive_game_sync, user_id, game_id)
        except ArchiveNotFound:
            raise web.HTTPNotFound()
        except ArchiveNotEnded:
            raise web.HTTPConflict(
                text=json.dumps({"message": "只有已经结束的剧本可以归档"}), content_type="application/json"
            )
        except ArchiveAlreadyComplete:
            raise web.HTTPConflict(
                text=json.dumps({"message": "这个剧本已经归档"}), content_type="application/json"
            )
        return web.json_response(result)


def create_app() -> web.Application:
    online = OnlineApi()
    app = web.Application(client_max_size=1024 * 1024 * 1024)
    app.on_startup.append(online.start)
    app.on_cleanup.append(online.stop)
    app.router.add_post(f"{API_PREFIX}/register", online.register)
    app.router.add_post(f"{API_PREFIX}/register/verify", online.verify)
    app.router.add_post(f"{API_PREFIX}/password-reset", online.request_password_reset)
    app.router.add_get(f"{API_PREFIX}/arkham/bugs", online.bugs)
    app.router.add_post(f"{API_PREFIX}/arkham/bugs/admin-login", online.bug_admin_login)
    app.router.add_post(f"{API_PREFIX}/arkham/bugs/export", online.export_bugs)
    app.router.add_put(f"{API_PREFIX}/arkham/bugs/{{bug_id}}", online.update_bug)
    app.router.add_delete(f"{API_PREFIX}/arkham/bugs/{{bug_id}}", online.delete_bug)
    app.router.add_route("*", f"{API_PREFIX}/arkham/games", online.games)
    app.router.add_post(f"{API_PREFIX}/arkham/games/import", online.import_game)
    app.router.add_get(f"{API_PREFIX}/arkham/games/{{game_id}}/join", online.proxy_join)
    app.router.add_put(f"{API_PREFIX}/arkham/games/{{game_id}}/join", online.join_game)
    app.router.add_post(f"{API_PREFIX}/arkham/games/{{game_id}}/claim-seat", online.join_game)
    app.router.add_post(f"{API_PREFIX}/arkham/games/{{game_id}}/file-bug", online.file_bug)
    app.router.add_get(f"{API_PREFIX}/arkham/games/{{game_id}}/full-export", online.full_export)
    app.router.add_get(f"{API_PREFIX}/arkham/games/{{game_id}}/archive-status", online.archive_status)
    app.router.add_post(f"{API_PREFIX}/arkham/games/{{game_id}}/archive", online.archive)
    return app


if __name__ == "__main__":
    web.run_app(create_app(), host="127.0.0.1", port=int(os.getenv("ONLINE_API_PORT", "39103")))
