"""資料庫的列 → domain 的物件（翻譯），以及 API 回傳的格式。這裡不碰資料庫連線，方便測試。"""
from datetime import date, time

from domain.fixture import Fixture

FIXTURE_COLUMNS = ("day, start_time, end_time, home, away, round, match_no, home_score, away_score, "
                   "referee, linesmen, note, analyzed_at")


def _hm(t) -> str:
    if t is None:
        return ""
    if isinstance(t, time):
        return t.strftime("%H:%M")
    return str(t)[:5]


def row_to_fixture(row: dict) -> Fixture:
    score = None
    if row.get("home_score") is not None and row.get("away_score") is not None:
        score = (int(row["home_score"]), int(row["away_score"]))
    day = row["day"] if isinstance(row["day"], date) else date.fromisoformat(str(row["day"]))
    return Fixture(day=day, start=_hm(row.get("start_time")), end=_hm(row.get("end_time")),
                   home=row["home"], away=row["away"], no=row.get("match_no"), round=row.get("round"),
                   score=score, referee=row.get("referee") or "", linesmen=tuple(row.get("linesmen") or ()),
                   note=row.get("note") or "")


def match_status(row: dict, today: date) -> str:
    """規格裡的三種狀態：upcoming（即將進行）/ finished（已結束）/ analyzed（已分析）。"""
    if row.get("analyzed_at"):
        return "analyzed"
    f = row_to_fixture(row)
    return "finished" if f.played or f.day < today else "upcoming"


def fixture_json(row: dict, team: str, today: date) -> dict:
    f = row_to_fixture(row)
    involved = bool(team) and f.involves(team)
    return {
        "day": f.day.isoformat(), "start": f.start, "end": f.end, "home": f.home, "away": f.away,
        "round": f.round, "score": list(f.score) if f.score else None, "note": f.note,
        "status": match_status(row, today),
        "ours": involved,
        "opponent": f.opponent(team) if involved else None,
        "result": f.result(team) if involved else None,
    }
