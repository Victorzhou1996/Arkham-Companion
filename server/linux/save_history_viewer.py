#!/usr/bin/env python3
"""Render an Arkham JSON export as a read-only text history page."""

from __future__ import annotations

import gzip
import html
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


NOISE_TAGS = {
    "CheckWindows",
    "Would",
    "Do",
    "DoStep",
    "ForTarget",
    "ForInvestigator",
    "InvestigatorMessage",
    "MoveWithSkillTest",
    "Run",
    "EndCheckWindow",
    "PhaseStep",
    "SetActiveInvestigator",
}

TAG_LABELS = {
    "PlayCard": "打出卡牌",
    "ResolvedPlayCard": "结算卡牌",
    "FinishedEvent_": "结算事件",
    "UseCardAbility": "发动卡牌能力",
    "ActivateAbility": "发动能力",
    "RunAbility": "发动能力",
    "DrawCards": "抽牌",
    "DoDrawCards": "抽牌",
    "DrawEnded": "完成抽牌",
    "RevealChaosToken": "抽取混乱标记",
    "DrawChaosToken": "抽取混乱标记",
    "ChaosTokenSelected": "选择混乱标记",
    "Move": "移动",
    "MoveTo": "移动",
    "InvestigatorMoved": "移动",
    "DiscoverClues": "发现线索",
    "GainResources": "获得资源",
    "SpendResources": "花费资源",
    "AssignDamage": "分配伤害",
    "DealDamage": "受到伤害",
    "AssignHorror": "分配恐惧",
    "DealHorror": "受到恐惧",
    "EnemyAttack": "敌人攻击",
    "BeginSkillTest": "开始技能检定",
    "SkillTestEnds": "结束技能检定",
    "BeginTurn": "开始回合",
    "EndTurn": "结束回合",
    "EndUpkeep": "结束补给阶段",
    "NextPhase": "进入下一阶段",
    "AdvanceAgenda": "推进密谋",
    "AdvanceAct": "推进场景",
    "SpawnEnemy": "生成敌人",
    "DefeatEnemy": "击败敌人",
    "EvadeEnemy": "躲避敌人",
    "EngageEnemy": "与敌人交战",
    "DiscardCard": "弃牌",
    "AddToHand": "加入手牌",
    "CommitCard": "投入卡牌",
    "Resign": "撤退",
}


def read_json(path: Path) -> dict[str, Any]:
    raw = path.read_bytes()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    data = json.loads(raw.decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError("存档顶层不是 JSON 对象")
    return data


def load_card_names(runtime_root: Path) -> dict[str, str]:
    candidates = [
        runtime_root / "frontend" / "dist" / "cards_zh.json",
        runtime_root / "frontend-dist" / "cards_zh.json",
        runtime_root / "release" / "frontend-dist" / "cards_zh.json",
    ]
    cards: Any = None
    for path in candidates:
        try:
            cards = json.loads(path.read_text(encoding="utf-8"))
            break
        except (OSError, json.JSONDecodeError):
            continue
    if cards is None:
        return {}
    result: dict[str, str] = {}
    for card in cards if isinstance(cards, list) else []:
        if isinstance(card, dict) and card.get("code") and card.get("name"):
            result[str(card["code"])] = str(card["name"])
    return result


def normalize_code(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    code = value[1:] if value.startswith("c") else value
    return code if re.fullmatch(r"[0-9]{5}[a-z]*", code) else None


def walk(value: Any):
    yield value
    if isinstance(value, dict):
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def step_tags(step: dict[str, Any]) -> list[str]:
    tags: list[str] = []
    for value in walk(step.get("choice", {}).get("choiceMessages", [])):
        if isinstance(value, dict) and isinstance(value.get("tag"), str):
            tags.append(value["tag"])
    return tags


def step_card_names(step: dict[str, Any], cards: dict[str, str]) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for value in walk(step.get("choice", {}).get("choiceMessages", [])):
        candidates: list[Any] = []
        if isinstance(value, dict):
            candidates.extend(value.get(key) for key in ("cardCode", "originalCardCode", "owner"))
        elif isinstance(value, str):
            candidates.append(value)
        for candidate in candidates:
            code = normalize_code(candidate)
            name = cards.get(code or "")
            if name and name not in seen:
                seen.add(name)
                names.append(name)
    return names


def summarize_step(step: dict[str, Any], cards: dict[str, str]) -> str:
    tags = step_tags(step)
    names = step_card_names(step, cards)
    name_suffix = f"“{'、'.join(names[:3])}”" if names else ""

    for tag in tags:
        label = TAG_LABELS.get(tag)
        if label:
            if tag in {"PlayCard", "ResolvedPlayCard", "FinishedEvent_", "UseCardAbility", "ActivateAbility", "RunAbility"} and name_suffix:
                return f"{label}{name_suffix}"
            return label

    if name_suffix:
        return f"处理{name_suffix}"

    meaningful = next((tag for tag in tags if tag not in NOISE_TAGS), None)
    return f"游戏状态更新（{meaningful}）" if meaningful else "游戏状态更新"


TOKEN_RE = re.compile(
    r'\{(?P<kind>[^:}]+):"(?P<label>(?:[^"\\]|\\.)*)":"(?P<code>[^"]+)"(?::"[^"]*")?\}'
)


def localize_log_body(body: str, cards: dict[str, str]) -> str:
    def replace_token(match: re.Match[str]) -> str:
        try:
            label = json.loads(f'"{match.group("label")}"')
        except json.JSONDecodeError:
            label = match.group("label")
        code = normalize_code(match.group("code"))
        return cards.get(code or "", label)

    text = TOKEN_RE.sub(replace_token, body)
    replacements = {
        " played ": " 打出了 ",
        " draws ": " 抽取了 ",
        " chaos tokens": " 混乱标记",
        " chaos token": " 混乱标记",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    return text.strip()


def find_game_id(steps: list[dict[str, Any]]) -> str | None:
    for step in steps:
        value = step.get("arkhamGameId")
        if isinstance(value, str) and re.fullmatch(r"[0-9a-fA-F-]{36}", value):
            return value
    return None


def read_runtime_env(runtime_root: Path) -> dict[str, str]:
    keys = ("ARKHAM_PG_HOST", "ARKHAM_PG_PORT", "ARKHAM_PG_USER", "ARKHAM_DB")
    values = {
        "ARKHAM_PG_HOST": "127.0.0.1",
        "ARKHAM_PG_PORT": "5433",
        "ARKHAM_PG_USER": "arkham_user",
        "ARKHAM_DB": "arkham-horror-backend",
    }
    paths = [
        runtime_root / "data" / "runtime.env",
        runtime_root / "config" / "runtime.env",
        runtime_root / "config" / "ports.env",
    ]
    for path in paths:
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
        for line in lines:
            match = re.match(rf"\s*({'|'.join(keys)})\s*=\s*['\"]?([^'\"#\s]+)", line)
            if match:
                values[match.group(1)] = match.group(2)
    for key in keys:
        if os.environ.get(key):
            values[key] = os.environ[key]
    return values


def load_local_logs(runtime_root: Path, game_id: str | None) -> list[dict[str, Any]]:
    if not game_id:
        return []
    bundled_psql = runtime_root / "pgsql" / "bin" / "psql"
    psql = str(bundled_psql) if bundled_psql.exists() else shutil.which("psql")
    if not psql:
        return []
    env_values = read_runtime_env(runtime_root)
    query = (
        "select coalesce(json_agg(json_build_object("
        "'step',step,'createdAt',created_at,'body',body) order by step,created_at),"
        "'[]'::json) from arkham_log_entries where arkham_game_id='"
        + game_id
        + "';"
    )
    process_env = os.environ.copy()
    library_paths = [
        str(path)
        for path in (runtime_root / "lib", runtime_root / "pgsql" / "lib")
        if path.is_dir()
    ]
    if sys.platform == "darwin":
        variable = "DYLD_LIBRARY_PATH"
    else:
        variable = "LD_LIBRARY_PATH"
    if process_env.get(variable):
        library_paths.append(process_env[variable])
    if library_paths:
        process_env[variable] = os.pathsep.join(library_paths)
    try:
        result = subprocess.run(
            [
                psql, "-w", "-h", env_values["ARKHAM_PG_HOST"],
                "-p", env_values["ARKHAM_PG_PORT"], "-U", env_values["ARKHAM_PG_USER"],
                "-d", env_values["ARKHAM_DB"], "-Atqc", query,
            ],
            check=True,
            capture_output=True,
            env=process_env,
            text=True,
            timeout=4,
        )
        data = json.loads(result.stdout or "[]")
        return data if isinstance(data, list) else []
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError):
        return []


def extract_records(data: dict[str, Any], runtime_root: Path, cards: dict[str, str]):
    campaign = data.get("campaignData")
    if not isinstance(campaign, dict):
        raise ValueError("不是受支持的 Arkham 存档：缺少 campaignData")

    steps = [step for step in campaign.get("steps", []) if isinstance(step, dict)]
    logs = [entry for entry in campaign.get("log", []) if isinstance(entry, dict)]
    source = "存档内游戏日志"
    if not logs:
        logs = load_local_logs(runtime_root, find_game_id(steps))
        source = "本机游戏日志"

    if logs:
        records = [
            {
                "step": int(entry.get("step", 0)),
                "text": localize_log_body(str(entry.get("body", "")), cards),
                "time": str(entry.get("createdAt", "")),
            }
            for entry in logs
            if str(entry.get("body", "")).strip()
        ]
        records.sort(key=lambda record: (record["step"], record["time"]))
    else:
        source = "存档步骤摘要"
        records = [
            {"step": int(step.get("step", 0)), "text": summarize_step(step, cards), "time": ""}
            for step in steps
        ]
        records.sort(key=lambda record: record["step"])

    return campaign, source, records, len(steps)


def render_page(input_path: Path, runtime_root: Path) -> Path:
    data = read_json(input_path)
    cards = load_card_names(runtime_root)
    campaign, source, records, step_count = extract_records(data, runtime_root, cards)
    name = str(campaign.get("name") or input_path.stem)
    saved_step = campaign.get("step", "-")
    rows = "\n".join(
        f'<li data-search="{html.escape(str(record["text"]).lower())}">'
        f'<span class="step">{record["step"]}</span>'
        f'<span class="entry">{html.escape(str(record["text"]))}</span></li>'
        for record in records
    ) or '<li class="empty">这个存档中没有可显示的操作记录。</li>'

    page = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(name)} - 操作记录</title>
<style>
*{{box-sizing:border-box}} body{{margin:0;background:#222a37;color:#e8ebef;font:15px/1.55 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}}
header{{position:sticky;top:0;background:#18202b;border-bottom:1px solid #445064;padding:18px 24px;z-index:1}}
.wrap{{max-width:980px;margin:auto}} h1{{font-size:21px;margin:0 0 8px;letter-spacing:0}} .meta{{color:#aeb7c5;font-size:13px}}
input{{width:100%;margin-top:14px;padding:10px 12px;border:1px solid #566277;background:#2d3645;color:#fff;border-radius:4px;font-size:14px}}
main{{padding:18px 24px 40px}} ol{{list-style:none;margin:0;padding:0;border-top:1px solid #3b4658}}
li{{display:grid;grid-template-columns:72px 1fr;gap:12px;padding:11px 8px;border-bottom:1px solid #3b4658}}
li:hover{{background:#2a3443}} .step{{color:#93a1b5;font-variant-numeric:tabular-nums}} .entry{{overflow-wrap:anywhere}} .empty{{display:block;color:#aeb7c5}}
</style></head><body>
<header><div class="wrap"><h1>{html.escape(name)}</h1><div class="meta">保存步骤 {html.escape(str(saved_step))} · 存档步骤 {step_count} · 显示记录 {len(records)} · {html.escape(source)}</div>
<input id="search" type="search" placeholder="搜索操作记录" aria-label="搜索操作记录"></div></header>
<main class="wrap"><ol id="records">{rows}</ol></main>
<script>const q=document.querySelector('#search');q.addEventListener('input',()=>{{const v=q.value.trim().toLowerCase();document.querySelectorAll('#records li[data-search]').forEach(x=>x.hidden=v&&!x.dataset.search.includes(v))}});</script>
</body></html>"""

    output_dir = runtime_root / "data" / "save-history"
    try:
        output_dir.mkdir(parents=True, exist_ok=True)
    except OSError:
        state_root = Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local" / "state"))
        output_dir = state_root / "arkham-horror" / "save-history"
        output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / "latest.html"
    output.write_text(page, encoding="utf-8")
    return output


def self_test() -> None:
    cards = {"08064": "先见"}
    step = {
        "choice": {"choiceMessages": [{"tag": "ResolvedPlayCard", "contents": {"cardCode": "c08064"}}]},
        "step": 12,
    }
    assert summarize_step(step, cards) == "结算卡牌“先见”"
    body = '{investigator:"Agnes Baker":"01004"} played {card:"Foresight":"08064":"id"}'
    assert localize_log_body(body, {"01004": "艾格尼丝·贝克", **cards}) == "艾格尼丝·贝克 打出了 先见"
    print("OK")


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] == "--self-test":
        self_test()
        return 0
    if len(sys.argv) != 3:
        print("用法: save_history_viewer.py <存档.json或json.gz> <运行目录>", file=sys.stderr)
        return 2
    try:
        output = render_page(Path(sys.argv[1]).expanduser(), Path(sys.argv[2]).expanduser())
    except (OSError, ValueError, json.JSONDecodeError, gzip.BadGzipFile) as exc:
        print(f"无法读取存档：{exc}", file=sys.stderr)
        return 1
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
