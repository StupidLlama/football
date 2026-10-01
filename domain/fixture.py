"""聯賽賽程（Core）：一場比賽、比分、勝負，和我們要負責的裁判任務。純 Python。"""
from dataclasses import dataclass, field
from datetime import date

WIN, DRAW, LOSS = "W", "D", "L"
RESULT_LABEL = {WIN: "勝", DRAW: "和", LOSS: "負"}


@dataclass(frozen=True)
class Fixture:
    """聯賽裡的一場比賽（不一定有我們）。"""
    day: date
    start: str                    # "19:00"
    end: str                      # "20:00"
    home: str
    away: str
    no: int | None = None         # 場次
    round: int | None = None      # 輪次
    score: tuple[int, int] | None = None   # (主場, 客場)；還沒踢 = None
    referee: str = ""             # 主審（隊名或人名）
    linesmen: tuple[str, ...] = ()
    note: str = ""

    @property
    def played(self) -> bool:
        return self.score is not None

    def involves(self, team: str) -> bool:
        return team in (self.home, self.away)

    def is_home(self, team: str) -> bool:
        return self.home == team

    def opponent(self, team: str) -> str:
        return self.away if self.home == team else self.home

    def goals(self, team: str) -> tuple[int, int] | None:
        """(我方, 對方)。"""
        if self.score is None:
            return None
        h, a = self.score
        return (h, a) if self.home == team else (a, h)

    def result(self, team: str) -> str | None:
        g = self.goals(team)
        if g is None:
            return None
        return WIN if g[0] > g[1] else LOSS if g[0] < g[1] else DRAW


@dataclass(frozen=True)
class Duty:
    """我們隊要派人去當裁判的一場比賽。"""
    fixture: Fixture
    role: str                     # "主審" / "邊審"
    index: int = 0                # 同一場同一個角色要派第幾個人（通常 0）
    adjacent: Fixture | None = field(default=None, compare=False)   # 同一天我們自己的比賽

    @property
    def key(self) -> str:
        """穩定的識別碼：存檔用，賽程表重新整理也不會變。"""
        f = self.fixture
        return f"{f.day.isoformat()}_{f.start}_{f.home}-{f.away}_{self.role}{self.index}"
