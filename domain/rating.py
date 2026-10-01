"""評分規則：平均能力、類別分數、位置適合度、推薦位置。"""
from statistics import mean

from .models import Player, RatingRules


def average(player: Player, rules: RatingRules) -> float:
    return round(mean(float(player[k]) for k in rules.ability_keys), 2)


def category_scores(player: Player, rules: RatingRules) -> dict[str, float]:
    """每個類別的平均分數，例如 {"技術": 3.2, "進攻": 2.7, ...}。"""
    return {c.name: round(mean(float(player[a.key]) for a in c.abilities), 2) for c in rules.categories}


def fitness(player: Player, rules: RatingRules) -> dict[str, float]:
    """每個位置的適合度（0–100）= 相關能力加權平均 ÷ 滿分 × 100。"""
    scale = 100 / rules.max_score
    return {pos: round(sum(float(player[a]) * w for a, w in ws.items()) * scale, 1)
            for pos, ws in rules.position_weights.items()}


def recommended(player: Player, rules: RatingRules, top: int | None = None) -> list[str]:
    fit = fitness(player, rules)
    return sorted(fit, key=fit.get, reverse=True)[: top or rules.top_n]
