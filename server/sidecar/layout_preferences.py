"""Account-scoped UI preferences, separate from game databases and saves."""
import asyncio
import json
import math
import sqlite3
from contextlib import closing
from pathlib import Path

from aiohttp import web

LIMITS = {"left": (12, 32), "investigator": (12, 32), "right": (10, 25),
          "log": (0, 30), "upper": (42, 76), "threat": (12, 65), "hand": (30, 70)}


def validate_patch(value):
    if not isinstance(value, dict) or set(value) - set(LIMITS):
        raise ValueError("Unknown layout fields")
    result = {}
    for key, number in value.items():
        if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number):
            raise ValueError("Invalid panel size")
        low, high = LIMITS[key]
        result[key] = round(max(low, min(high, number)), 4)
    return result


class LayoutStore:
    def __init__(self, path):
        self.path = Path(path)

    def access(self, user_id, patch=None):
        # SQLite serializes small per-field merges across workers; no lost fields.
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.path, timeout=5)) as db, db:
            db.execute("CREATE TABLE IF NOT EXISTS layouts (user_id INTEGER PRIMARY KEY, panels TEXT NOT NULL)")
            if patch is not None:
                patch = validate_patch(patch)
                db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT panels FROM layouts WHERE user_id = ?", (user_id,)).fetchone()
            panels = validate_patch(json.loads(row[0])) if row else {}
            if patch:
                panels.update(patch)
                db.execute("INSERT INTO layouts VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET panels=excluded.panels",
                           (user_id, json.dumps(panels, separators=(",", ":"))))
            return {"version": 1, "panels": panels}


def install_layout_routes(app, online, path):
    store = LayoutStore(path)

    async def layout(request):
        user_id = online.require_user(request)
        # Reject deleted accounts too, even if an old signed token survives.
        exists = await online.sql("SELECT 1 FROM users WHERE id=:'user_id'::bigint LIMIT 1;", user_id=str(user_id))
        if not exists:
            raise web.HTTPUnauthorized()
        patch = None
        if request.method == "PUT":
            body = bytearray()
            async for chunk in request.content.iter_chunked(4096):
                body.extend(chunk)
                if len(body) > 8192:
                    raise web.HTTPRequestEntityTooLarge(max_size=8192, actual_size=len(body))
            try:
                patch = validate_patch(json.loads(body))
            except (ValueError, TypeError, UnicodeError):
                raise web.HTTPBadRequest(text="Invalid layout preferences")
        result = await asyncio.to_thread(store.access, user_id, patch)
        return web.json_response(result, headers={"Cache-Control": "no-store"})

    app.router.add_get("/api/v1/account/tabletop-layout", layout)
    app.router.add_put("/api/v1/account/tabletop-layout", layout)
