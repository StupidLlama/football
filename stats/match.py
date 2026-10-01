"""比賽統計（給之後的影片分析用）。

輸入是影片翻譯後的數據列：{"match_id", "player_name", "stat", "value"}。
"""
from collections import defaultdict
from typing import Iterable, Mapping


def player_totals(rows: Iterable[Mapping], player_name: str) -> dict[str, float]:
    """某位球員所有比賽的各項數據加總。"""
    totals: dict[str, float] = defaultdict(float)
    for r in rows:
        if r["player_name"] == player_name:
            totals[r["stat"]] += float(r["value"])
    return dict(totals)


def matches_played(rows: Iterable[Mapping], player_name: str) -> int:
    return len({r["match_id"] for r in rows if r["player_name"] == player_name})
