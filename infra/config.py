"""讀取 config/settings.toml → 核心的 RatingRules ＋ 翻譯層的 FormSpec。"""
import tomllib
from functools import lru_cache
from pathlib import Path

from adapters.form import FormSpec
from domain.models import Ability, Category, RatingRules

ROOT = Path(__file__).resolve().parent.parent
SETTINGS_PATH = ROOT / "config" / "settings.toml"


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
    )


def load_feedback_url(path: Path = SETTINGS_PATH) -> str:
    """[feedback] url：意見回饋表單的網址，空白 = 不顯示回饋按鈕。"""
    return str(_read(path).get("feedback", {}).get("url", "")).strip()


@lru_cache(maxsize=1)
def rules() -> RatingRules:
    return load_rules()


@lru_cache(maxsize=1)
def form_spec() -> FormSpec:
    return load_form_spec()


@lru_cache(maxsize=1)
def feedback_url() -> str:
    return load_feedback_url()
