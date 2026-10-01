"""球員統計：隊內排名、強項弱項、兩人比較。"""
from dataclasses import dataclass

from domain.models import Player, RatingRules
from domain.rating import average


def rank(value: float, values: list[float]) -> int:
    """隊內排名（1 = 最高；同分同名次）。"""
    return 1 + sum(1 for v in values if v > value)


def ability_ranks(player: Player, players: list[Player], rules: RatingRules) -> dict[str, int]:
    return {k: rank(float(player[k]), [float(p[k]) for p in players]) for k in rules.ability_keys}


def overall_rank(player: Player, players: list[Player], rules: RatingRules) -> int:
    return rank(average(player, rules), [average(p, rules) for p in players])


@dataclass(frozen=True)
class AbilityNote:
    key: str
    label: str
    score: float
    rank: int


def strengths(player: Player, players: list[Player], rules: RatingRules, n: int = 3) -> list[AbilityNote]:
    """分數最高的能力（同分時隊內排名高的優先）。"""
    ranks = ability_ranks(player, players, rules)
    keys = sorted(rules.ability_keys, key=lambda k: (-float(player[k]), ranks[k]))
    return [AbilityNote(k, rules.ability(k).label, float(player[k]), ranks[k]) for k in keys[:n]]


def weaknesses(player: Player, players: list[Player], rules: RatingRules, n: int = 3) -> list[AbilityNote]:
    ranks = ability_ranks(player, players, rules)
    keys = sorted(rules.ability_keys, key=lambda k: (float(player[k]), -ranks[k]))
    return [AbilityNote(k, rules.ability(k).label, float(player[k]), ranks[k]) for k in keys[:n]]


@dataclass(frozen=True)
class Difference:
    key: str
    label: str
    category: str
    a: float
    b: float

    @property
    def diff(self) -> float:
        return self.a - self.b


def biggest_differences(a: Player, b: Player, rules: RatingRules, n: int = 5) -> list[Difference]:
    """兩位球員（或球員 vs 全隊平均）差最多的 n 項能力。"""
    diffs = [Difference(x.key, x.label, x.category, float(a[x.key]), float(b[x.key])) for x in rules.abilities]
    return sorted(diffs, key=lambda d: -abs(d.diff))[:n]
