"""賽程統計（Inner shell）：我們隊的賽程、戰績、裁判任務。"""
from dataclasses import dataclass
from datetime import date

from domain.fixture import DRAW, LOSS, WIN, Duty, Fixture

REFEREE, LINESMAN = "主審", "邊審"


def _order(f: Fixture):
    return (f.day, f.start)


def team_fixtures(fixtures: list[Fixture], team: str) -> list[Fixture]:
    return sorted((f for f in fixtures if f.involves(team)), key=_order)


def upcoming(fixtures: list[Fixture], team: str, today: date) -> list[Fixture]:
    """還沒踢的比賽（今天以後，由近到遠）。"""
    return [f for f in team_fixtures(fixtures, team) if not f.played and f.day >= today]


def finished(fixtures: list[Fixture], team: str) -> list[Fixture]:
    """有比分的比賽（由近到遠）。"""
    return [f for f in reversed(team_fixtures(fixtures, team)) if f.played]


def awaiting_score(fixtures: list[Fixture], team: str, today: date) -> list[Fixture]:
    """日期已過但比分還沒填的比賽。"""
    return [f for f in reversed(team_fixtures(fixtures, team)) if not f.played and f.day < today]


def form(fixtures: list[Fixture], team: str, n: int = 5) -> list[str]:
    """最近 n 場的 W/D/L，由舊到新（畫面上最右邊是最新一場）。"""
    return [f.result(team) for f in finished(fixtures, team)[:n]][::-1]


@dataclass(frozen=True)
class Record:
    wins: int = 0
    draws: int = 0
    losses: int = 0
    goals_for: int = 0
    goals_against: int = 0

    @property
    def played(self) -> int:
        return self.wins + self.draws + self.losses

    @property
    def points(self) -> int:
        return self.wins * 3 + self.draws


def record(fixtures: list[Fixture], team: str) -> Record:
    w = d = l = gf = ga = 0
    for f in finished(fixtures, team):
        r = f.result(team)
        w, d, l = w + (r == WIN), d + (r == DRAW), l + (r == LOSS)
        mine, theirs = f.goals(team)
        gf, ga = gf + mine, ga + theirs
    return Record(w, d, l, gf, ga)


def duties_for(fixtures: list[Fixture], team: str) -> list[Duty]:
    """賽程表裡寫我們隊名的主審 / 邊審欄位 = 我們要派人的裁判任務。"""
    own = team_fixtures(fixtures, team)
    out = []
    for f in sorted(fixtures, key=_order):
        same_day = next((o for o in own if o.day == f.day and o != f), None)
        if f.referee == team:
            out.append(Duty(f, REFEREE, 0, same_day))
        for i in range(sum(1 for x in f.linesmen if x == team)):
            out.append(Duty(f, LINESMAN, i, same_day))
    return out


def relation(duty: Duty, team: str) -> str:
    """裁判任務跟我們自己比賽的關係（排人時好參考）。"""
    own = duty.adjacent
    if own is None:
        return "當天沒有我們的比賽"
    when = "接在" if own.start < duty.fixture.start else "在"
    tail = "之後" if when == "接在" else "之前"
    return f"{when}我們對{own.opponent(team)}{tail}"
