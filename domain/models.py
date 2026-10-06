"""核心的資料型別：能力、能力類別、評分規則。"""
from dataclasses import dataclass, field
from typing import Any, Mapping

# 一位球員 = 可以用能力 key 取分數的物件（dict、pandas Series 都可以）
Player = Mapping[str, Any]


@dataclass(frozen=True)
class Ability:
    key: str        # 內部名稱，例如 "passing"
    label: str      # 顯示名稱，例如 "傳球"
    category: str   # 所屬類別，例如 "技術"


@dataclass(frozen=True)
class Category:
    name: str
    color: str
    abilities: tuple[Ability, ...]


@dataclass(frozen=True)
class RatingRules:
    """評分規則：有哪些能力、每個位置看重哪些能力、推薦取前幾名。"""
    categories: tuple[Category, ...]
    position_weights: Mapping[str, Mapping[str, float]]
    top_n: int = 3
    good_bonus: float = 10    # 組隊：自評擅長加分（config/settings.toml 的 [lineup]）
    bad_penalty: float = 15   # 組隊：自評不擅長扣分
    min_score: int = 1
    max_score: int = 5
    _by_key: dict = field(default_factory=dict, compare=False, repr=False)

    @property
    def abilities(self) -> list[Ability]:
        return [a for c in self.categories for a in c.abilities]

    @property
    def ability_keys(self) -> list[str]:
        return [a.key for a in self.abilities]

    @property
    def positions(self) -> list[str]:
        return list(self.position_weights)

    def ability(self, key: str) -> Ability:
        if not self._by_key:
            self._by_key.update({a.key: a for a in self.abilities})
        return self._by_key[key]

    def category_color(self, name: str) -> str:
        return next(c.color for c in self.categories if c.name == name)

    def validate(self) -> list[str]:
        """回傳規則裡的問題（空 list = 沒問題）。"""
        problems = []
        keys = set(self.ability_keys)
        for pos, ws in self.position_weights.items():
            if abs(sum(ws.values()) - 1) > 1e-6:
                problems.append(f"{pos} 的權重加總不是 1（是 {sum(ws.values()):.2f}）")
            unknown = set(ws) - keys
            if unknown:
                problems.append(f"{pos} 用到不存在的能力：{sorted(unknown)}")
        return problems
