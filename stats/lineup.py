"""組隊：選好陣型後，自動把球員排到最適合的位置，並列出替補和每個位置的所有人選。

每個人排某個位置的分數 = 位置適合度（0–100）＋ 自評擅長加分 − 自評不擅長扣分。
用指派問題的演算法求「全隊總分最高」的排法，不是一個位置一個位置挑最強的。
"""
from dataclasses import dataclass

from domain.formations import Formation, Slot
from domain.models import Player, RatingRules
from domain.positions import split_positions
from domain.rating import fitness

from .assignment import max_assignment

GOOD_BONUS = 10      # 自評擅長這個位置
BAD_PENALTY = 15     # 自評不擅長這個位置
GK_PRIORITY = 1000   # 人數不夠時，門將一定先排


@dataclass(frozen=True)
class Option:
    """某位球員踢某個位置的評估。"""
    name: str
    slot: str          # 位置名稱（陣型裡的 code）
    role: str          # 位置類型（算適合度用）
    fit: float         # 位置適合度 0–100
    good: bool         # 自評擅長
    bad: bool          # 自評不擅長
    score: float       # 排人用的分數

    @property
    def reason(self) -> str:
        tag = "自評擅長" if self.good else "自評不擅長" if self.bad else "數據推算"
        return f"適合度 {self.fit:.0f} · {tag}"


@dataclass(frozen=True)
class Lineup:
    formation: Formation
    starters: list[Option]       # 照陣型的位置順序；沒人的位置不在這裡
    empty: list[Slot]            # 人數不夠時沒排到人的位置
    bench: list[Option]          # 所有沒先發的人，每人附上最適合替補的位置，分數高的在前

    @property
    def total(self) -> float:
        return round(sum(o.score for o in self.starters), 1)


def option(player: Player, slot: Slot, rules: RatingRules, fit: dict | None = None) -> Option:
    fit = fit if fit is not None else fitness(player, rules)
    good = slot.role in split_positions(player["good_positions"])
    bad = slot.role in split_positions(player["bad_positions"])
    f = fit[slot.role]
    return Option(player["name"], slot.code, slot.role, f, good, bad,
                  round(f + (GOOD_BONUS if good else 0) - (BAD_PENALTY if bad else 0), 1))


def candidates(players: list[Player], slot: Slot, rules: RatingRules) -> list[Option]:
    """這個位置的所有人選，分數高到低（同分照名字排，結果固定）。"""
    return sorted((option(p, slot, rules) for p in players), key=lambda o: (-o.score, o.name))


def auto_lineup(players: list[Player], formation: Formation, rules: RatingRules,
                locked: dict[str, str] | None = None) -> Lineup:
    """players = 這場出賽的人；locked = {位置 code: 球員名字}，先固定再排其他人。"""
    locked = {s: n for s, n in (locked or {}).items() if n}
    by_name = {p["name"]: p for p in players}
    unknown = [n for n in locked.values() if n not in by_name]
    if unknown:
        raise ValueError(f"鎖定的球員不在出賽名單裡：{unknown}")
    if len(set(locked.values())) != len(locked):
        raise ValueError("同一位球員不能鎖在兩個位置")

    fits = {p["name"]: fitness(p, rules) for p in players}
    picked: dict[str, Option] = {code: option(by_name[name], formation.slot(code), rules, fits[name])
                                 for code, name in locked.items()}
    free_slots = [s for s in formation.slots if s.code not in picked]
    free_players = sorted((p for p in players if p["name"] not in locked.values()), key=lambda p: p["name"])
    table = [[option(p, s, rules, fits[p["name"]]) for p in free_players] for s in free_slots]
    # 人數不夠時，一定先把門將排滿（其他位置空著還能踢，沒有門將不行）
    short = len(free_players) < len(free_slots)
    weights = [[o.score + (GK_PRIORITY if short and o.role == "GK" else 0) for o in row] for row in table]
    for i, j in enumerate(max_assignment(weights)):
        if j >= 0:
            picked[free_slots[i].code] = table[i][j]

    starters = [picked[s.code] for s in formation.slots if s.code in picked]
    starting = {o.name for o in starters}
    bench = []
    for p in players:
        if p["name"] in starting:
            continue
        best = max((option(p, s, rules, fits[p["name"]]) for s in formation.slots), key=lambda o: o.score)
        bench.append(best)
    bench.sort(key=lambda o: (-o.score, o.name))
    return Lineup(formation, starters, [s for s in formation.slots if s.code not in picked], bench)
