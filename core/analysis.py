"""球員分析：位置適合度、推薦位置、擅長/不擅長位置。"""
import pandas as pd

from .config import settings
from .ingest import split_positions


def fitness(player: pd.Series) -> dict[str, float]:
    """每個位置的適合度（0–100）= 相關能力加權平均 × 20。"""
    return {pos: round(float(sum(player[a] * w for a, w in ws.items())) * 20, 1)
            for pos, ws in settings().position_weights.items()}


def recommended(player: pd.Series, top: int | None = None) -> list[str]:
    fit = fitness(player)
    return sorted(fit, key=fit.get, reverse=True)[: top or settings().top_n]


def good_positions(player: pd.Series) -> list[str]:
    return split_positions(player["good_positions"])


def bad_positions(player: pd.Series) -> list[str]:
    return split_positions(player["bad_positions"])


def display_name(player: pd.Series) -> str:
    nick = player["nickname"]
    return f"{player['name']}（{nick}）" if nick and nick != player["name"] else player["name"]


def has_message(player: pd.Series) -> bool:
    return bool(player["message"])
