"""讀取 config/settings.toml → 核心的 RatingRules ＋ 翻譯層的 FormSpec。"""
import tomllib
from functools import lru_cache
from pathlib import Path

from adapters.form import FormSpec
from domain.formations import Formation, Slot
from domain.models import Ability, Category, RatingRules
from domain.performance import Dimension, PerformanceRules

ROOT = Path(__file__).resolve().parent.parent
SETTINGS_PATH = ROOT / "config" / "settings.toml"
FORMATIONS_PATH = ROOT / "config" / "formations.toml"
PERFORMANCE_PATH = ROOT / "config" / "performance.toml"


def _read(path: Path) -> dict:
    with open(path, "rb") as f:
        return tomllib.load(f)


def load_rules(path: Path = SETTINGS_PATH) -> RatingRules:
    raw = _read(path)
    categories = tuple(
        Category(c["name"], c["color"], tuple(Ability(a["key"], a["label"], c["name"]) for a in c["abilities"]))
        for c in raw["categories"])
    return RatingRules(categories=categories, position_weights=raw["positions"],
                       top_n=raw.get("recommend", {}).get("top_n", 3))


def load_form_spec(path: Path = SETTINGS_PATH) -> FormSpec:
    raw = _read(path)
    form = raw["form"]
    return FormSpec(
        columns={k: form[k] for k in ("name", "nickname", "good_positions", "bad_positions")},
        ability_columns={a["key"]: a["column"] for c in raw["categories"] for a in c["abilities"]},
        message_prefix=form["message_prefix"],
        timestamp=form.get("timestamp"),
        message_overrides=raw.get("message_overrides", {}),
        weak_side=form.get("weak_side"),
    )


def load_feedback_url(path: Path = SETTINGS_PATH) -> str:
    """[feedback] url：意見回饋表單的網址，空白 = 不顯示回饋按鈕。"""
    return str(_read(path).get("feedback", {}).get("url", "")).strip()


def load_formations(path: Path = FORMATIONS_PATH) -> tuple[Formation, ...]:
    return tuple(
        Formation(f["name"], int(f["size"]),
                  tuple(Slot(s["code"], s["role"], float(s["x"]), float(s["y"])) for s in f["slots"]))
        for f in _read(path)["formations"])


def load_performance(path: Path = PERFORMANCE_PATH) -> PerformanceRules:
    raw = _read(path)
    return PerformanceRules(
        dimensions=tuple(Dimension(d["key"], d["label"]) for d in raw["dimensions"]),
        tasks={role: p["task"] for role, p in raw["positions"].items()},
        weights={role: p["weights"] for role, p in raw["positions"].items()},
    )


@lru_cache(maxsize=1)
def rules() -> RatingRules:
    return load_rules()


@lru_cache(maxsize=1)
def form_spec() -> FormSpec:
    return load_form_spec()


@lru_cache(maxsize=1)
def feedback_url() -> str:
    return load_feedback_url()


@lru_cache(maxsize=1)
def formations() -> tuple[Formation, ...]:
    return load_formations()


@lru_cache(maxsize=1)
def performance() -> PerformanceRules:
    return load_performance()
