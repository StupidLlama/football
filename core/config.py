"""讀取 config/settings.toml，整理成程式好用的結構。"""
import tomllib
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SETTINGS_PATH = ROOT / "config" / "settings.toml"


@dataclass(frozen=True)
class Ability:
    key: str       # 程式內部名稱（也是資料庫欄位名）
    column: str    # 表單欄位標題
    label: str     # 網站顯示名稱
    category: str
    color: str


@dataclass(frozen=True)
class Settings:
    form: dict
    message_overrides: dict
    categories: list          # [(name, color, [Ability, ...]), ...]
    abilities: list           # 攤平的 [Ability, ...]，順序即雷達圖順序
    position_weights: dict    # {"CB": {"heading": 0.15, ...}, ...}
    top_n: int

    @property
    def ability_keys(self) -> list:
        return [a.key for a in self.abilities]

    @property
    def positions(self) -> list:
        return list(self.position_weights)


def load_settings(path: Path = SETTINGS_PATH) -> Settings:
    with open(path, "rb") as f:
        raw = tomllib.load(f)
    categories, abilities = [], []
    for cat in raw["categories"]:
        items = [Ability(a["key"], a["column"], a["label"], cat["name"], cat["color"])
                 for a in cat["abilities"]]
        categories.append((cat["name"], cat["color"], items))
        abilities.extend(items)
    return Settings(
        form=raw["form"],
        message_overrides=raw.get("message_overrides", {}),
        categories=categories,
        abilities=abilities,
        position_weights=raw["positions"],
        top_n=raw.get("recommend", {}).get("top_n", 3),
    )


@lru_cache(maxsize=1)
def settings() -> Settings:
    """全程式共用的設定（只讀一次）。"""
    return load_settings()
