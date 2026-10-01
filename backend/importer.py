"""把 v1 的資料搬進 v2 資料庫（Google 表單回覆 + 系際聯賽賽程表）。

用法（在專案資料夾）：
    py -m backend.importer --code CSIE-2026 --name 資訊系足 --season 2026-27 --dry-run   # 先試跑，不寫入
    py -m backend.importer --code CSIE-2026 --name 資訊系足 --season 2026-27             # 真的寫入

- 資料來源跟 v1 網站一樣：.streamlit/secrets.toml 有 Google 試算表設定就讀試算表，否則讀 data/ 裡的檔案。
- 可以重複執行：已經存在的隊伍、球員、賽程會更新，不會重複新增；能力自評依填表時間只加新的。
- 用管理者身分寫入（不受 RLS 限制），所以只能在你自己的電腦執行，不要放到網站上。
"""
import argparse
import tomllib
from dataclasses import replace
from pathlib import Path

from adapters.form import normalize
from domain.positions import split_positions
from infra import config
from stats.schedule import duties_for

ROOT = Path(__file__).resolve().parent.parent
SECRETS = ROOT / ".streamlit" / "secrets.toml"
DEFAULT_TIME = "2026-01-01T00:00:00+08:00"     # 表單沒有時間戳記時用的固定時間（重跑才不會重複）


# ---------- 純轉換（不碰資料庫，方便測試）----------
def submitted_at(text) -> str:
    """表單時間是台灣時間、沒有時區 → 補上 +08:00。"""
    t = str(text or "").strip()
    if not t or t in ("NaT", "nan", "None"):
        return DEFAULT_TIME
    t = t.replace(" ", "T", 1)
    return t if ("+" in t[10:] or t.endswith("Z")) else f"{t}+08:00"


def player_rows(players: list[dict], rules, roles: dict | None = None, numbers: dict | None = None) -> list[dict]:
    roles, numbers = roles or {}, numbers or {}
    rows = []
    for p in players:
        name = str(p["name"]).strip()
        badge = str(roles.get(name, "")).upper() or None
        rows.append({
            "name": name,
            "nickname": "" if p.get("nickname") in (None, name) else str(p["nickname"]),
            "jersey_number": str(numbers[name]) if name in numbers else None,
            "badge": badge if badge in ("C", "VC") else None,
            "good_positions": split_positions(p.get("good_positions")),
            "bad_positions": split_positions(p.get("bad_positions")),
            "weak_side": p.get("weak_side") if p.get("weak_side") in ("left", "right") else "",
            "message": str(p.get("message") or ""),
            "scores": {k: int(p[k]) for k in rules.ability_keys if k in p},
            "submitted_at": submitted_at(p.get("submitted_at")),
        })
    return rows


def fixture_rows(fixtures) -> list[dict]:
    return [{
        "day": f.day.isoformat(), "start_time": f.start or None, "end_time": f.end or None,
        "home": f.home, "away": f.away, "round": f.round, "match_no": f.no,
        "home_score": f.score[0] if f.score else None, "away_score": f.score[1] if f.score else None,
        "referee": f.referee, "linesmen": list(f.linesmen), "note": f.note,
    } for f in fixtures]


def fixture_key(row: dict) -> tuple:
    return (row["day"], row["start_time"], row["home"], row["away"])


# ---------- 讀 v1 的資料 ----------
def load_v1(secrets_path: Path = SECRETS):
    from infra.schedule import get_schedule_source, load_fixtures
    from infra.sources import get_source
    secrets = tomllib.loads(secrets_path.read_text(encoding="utf-8")) if secrets_path.exists() else {}
    spec = config.form_spec()
    overrides = secrets.get("message_overrides", {})
    if overrides:
        spec = replace(spec, message_overrides={**spec.message_overrides, **overrides})
    players = normalize(get_source(secrets).load(), spec, config.rules()).to_dict("records")
    sched = config.schedule_settings()
    fixtures = load_fixtures(get_schedule_source(secrets), sched.worksheet)
    return players, fixtures, secrets.get("roles", {}), secrets.get("jersey_numbers", {})


# ---------- 寫入 ----------
def write(conn, team: dict, players: list[dict], fixtures, league_name: str) -> dict:
    from psycopg.types.json import Jsonb
    team_id = conn.execute(
        """insert into public.teams (code, name, season, league_name) values (%(code)s, %(name)s, %(season)s, %(league)s)
           on conflict (code) do update set name = excluded.name, season = excluded.season,
                                            league_name = excluded.league_name
           returning id""", team).fetchone()["id"]
    stats = {"players": 0, "ratings": 0, "fixtures": 0, "duties": 0}
    for p in players:
        pid = conn.execute(
            """insert into public.players (team_id, name, nickname, jersey_number, badge, good_positions, bad_positions,
                                          weak_side, message)
               values (%(team_id)s, %(name)s, %(nickname)s, %(jersey_number)s, %(badge)s, %(good_positions)s,
                       %(bad_positions)s, %(weak_side)s, %(message)s)
               on conflict (team_id, name) do update set nickname = excluded.nickname,
                   jersey_number = coalesce(excluded.jersey_number, players.jersey_number),
                   badge = coalesce(excluded.badge, players.badge),
                   good_positions = excluded.good_positions, bad_positions = excluded.bad_positions,
                   weak_side = excluded.weak_side, message = excluded.message
               returning id""", {**p, "team_id": team_id}).fetchone()["id"]
        stats["players"] += 1
        cur = conn.execute(
            """insert into public.ability_ratings (team_id, player_id, scores, source, submitted_at)
               values (%s, %s, %s, 'google_form', %s) on conflict (player_id, submitted_at) do nothing""",
            (team_id, pid, Jsonb(p["scores"]), p["submitted_at"]))
        stats["ratings"] += cur.rowcount
    ids = {}
    for f in fixture_rows(fixtures):
        ids[fixture_key(f)] = conn.execute(
            """insert into public.fixtures (team_id, day, start_time, end_time, home, away, round, match_no,
                                           home_score, away_score, referee, linesmen, note)
               values (%(team_id)s, %(day)s, %(start_time)s, %(end_time)s, %(home)s, %(away)s, %(round)s,
                       %(match_no)s, %(home_score)s, %(away_score)s, %(referee)s, %(linesmen)s, %(note)s)
               on conflict (team_id, day, start_time, home, away) do update set end_time = excluded.end_time,
                   round = excluded.round, match_no = excluded.match_no, home_score = excluded.home_score,
                   away_score = excluded.away_score, referee = excluded.referee, linesmen = excluded.linesmen,
                   note = excluded.note
               returning id""", {**f, "team_id": team_id}).fetchone()["id"]
        stats["fixtures"] += 1
    for d in duties_for(fixtures, league_name):
        key = fixture_key(fixture_rows([d.fixture])[0])
        cur = conn.execute(
            """insert into public.duties (team_id, fixture_id, role, slot) values (%s, %s, %s, %s)
               on conflict (fixture_id, role, slot) do nothing""", (team_id, ids[key], d.role, d.index))
        stats["duties"] += cur.rowcount
    stats["team_id"] = str(team_id)
    return stats


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description="把 v1 的球員、自評、賽程匯入 v2 資料庫")
    ap.add_argument("--code", required=True, help="Team ID，例如 CSIE-2026")
    ap.add_argument("--name", required=True, help="隊伍名稱，例如 資訊系足")
    ap.add_argument("--season", default=None, help="賽季，例如 2026-27")
    ap.add_argument("--dry-run", action="store_true", help="只試跑，最後不寫入")
    args = ap.parse_args(argv)

    from . import db
    league = config.schedule_settings().team
    players, fixtures, roles, numbers = load_v1()
    rows = player_rows(players, config.rules(), roles, numbers)
    print(f"讀到 {len(rows)} 位球員、{len(fixtures)} 場聯賽比賽（我們隊名：{league}）")
    team = {"code": args.code, "name": args.name, "season": args.season, "league": league}
    with db.admin() as conn:
        with conn.transaction(force_rollback=args.dry_run):
            stats = write(conn, team, rows, fixtures, league)
    print(("試跑（沒有寫入）：" if args.dry_run else "完成：") + str(stats))


if __name__ == "__main__":
    main()
