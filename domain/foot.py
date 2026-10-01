"""慣用腳：哪一腳強、哪一腳弱，以及弱腳有多好（決定畫面上弱腳的亮度）。"""
from dataclasses import dataclass

from .models import Player, RatingRules

SIDE_LABEL = {"left": "左腳", "right": "右腳"}
WEAK_FOOT_KEY = "weak_foot"   # 弱腳能力的 key（config/settings.toml）
MIN_BRIGHTNESS = 0.2          # 弱腳 1 分時的亮度；5 分 = 1（兩腳一樣亮）


@dataclass(frozen=True)
class Feet:
    strong: str             # "left" / "right" / ""（看不出來）
    weak: str
    weak_score: float
    weak_brightness: float  # 0.2–1

    @property
    def known(self) -> bool:
        return bool(self.strong)

    @property
    def strong_label(self) -> str:
        return f"慣用{SIDE_LABEL[self.strong]}" if self.known else "慣用腳未填"

    @property
    def weak_label(self) -> str:
        return f"弱腳 {self.weak_score:.0f} 分"

    @property
    def label(self) -> str:
        if not self.known:
            return f"慣用腳未填 · 弱腳 {self.weak_score:.0f} 分"
        return f"慣用{SIDE_LABEL[self.strong]} · 弱腳 {self.weak_score:.0f} 分"


def feet(player: Player, rules: RatingRules) -> Feet:
    weak = str(player.get("weak_side", "") or "")
    strong = {"left": "right", "right": "left"}.get(weak, "")
    score = float(player.get(WEAK_FOOT_KEY, rules.min_score))
    span = rules.max_score - rules.min_score
    brightness = MIN_BRIGHTNESS + (1 - MIN_BRIGHTNESS) * (score - rules.min_score) / span
    return Feet(strong, weak if strong else "", score, round(min(max(brightness, MIN_BRIGHTNESS), 1), 2))
