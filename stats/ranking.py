"""排行榜：依平均能力、某個類別或某一項能力，把全隊由高到低排名（同分同名次）。"""
from dataclasses import dataclass

from domain.models import Player, RatingRules
from domain.rating import average, category_scores

from .player import rank

AVERAGE = "average"   # 排行依據：平均能力；其他可以是類別名稱（例如 "技術"）或能力 key（例如 "passing"）


def metrics(rules: RatingRules) -> list[str]:
    """所有可以排名的項目：平均能力 → 各類別 → 各項能力。"""
    return [AVERAGE] + [c.name for c in rules.categories] + rules.ability_keys


def metric_label(metric: str, rules: RatingRules) -> str:
    if metric == AVERAGE:
        return "平均能力"
    if metric in {c.name for c in rules.categories}:
        return f"{metric}（類別）"
    a = rules.ability(metric)
    return f"{a.label}（{a.category}）"


def metric_value(player: Player, metric: str, rules: RatingRules) -> float:
    if metric == AVERAGE:
        return average(player, rules)
    if metric in {c.name for c in rules.categories}:
        return category_scores(player, rules)[metric]
    if metric in rules.ability_keys:
        return float(player[metric])
    raise KeyError(f"不知道怎麼排名：{metric}")


@dataclass(frozen=True)
class Entry:
    rank: int
    name: str
    score: float


def leaderboard(players: list[Player], metric: str, rules: RatingRules) -> list[Entry]:
    values = {p["name"]: metric_value(p, metric, rules) for p in players}
    all_values = list(values.values())
    entries = [Entry(rank(v, all_values), n, v) for n, v in values.items()]
    return sorted(entries, key=lambda e: (e.rank, e.name))


def category_ranks(player: Player, players: list[Player], rules: RatingRules) -> dict[str, int]:
    """這位球員每個類別的隊內排名，例如 {"技術": 3, "進攻": 7, ...}。"""
    team = [category_scores(p, rules) for p in players]
    mine = category_scores(player, rules)
    return {c: rank(mine[c], [t[c] for t in team]) for c in mine}
