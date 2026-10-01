"""球隊統計。players = 一串球員（每位是能用能力 key 取分數的 dict）。"""
from collections import Counter
from statistics import mean
from typing import Iterable

from domain.models import Player, RatingRules
from domain.positions import split_positions
from domain.rating import average, category_scores


def team_average(players: list[Player], rules: RatingRules) -> dict[str, float]:
    """每項能力的全隊平均，可以當成一位「平均球員」丟進雷達圖。"""
    if not players:
        return {k: 0.0 for k in rules.ability_keys}
    return {k: round(mean(float(p[k]) for p in players), 2) for k in rules.ability_keys}


def team_overall(players: list[Player], rules: RatingRules) -> float:
    return round(mean(average(p, rules) for p in players), 2) if players else 0.0


def category_averages(players: list[Player], rules: RatingRules) -> dict[str, float]:
    return category_scores(team_average(players, rules), rules)


def good_position_counts(players: Iterable[Player], positions: list[str]) -> dict[str, int]:
    """每個位置有幾個人自評擅長（照 positions 的順序）。"""
    c = Counter(pos for p in players for pos in split_positions(p["good_positions"]))
    return {pos: c.get(pos, 0) for pos in positions}
