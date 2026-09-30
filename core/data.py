"""資料層：讀取 Google 表單匯出的 xlsx → 存進 SQLite → 計算位置適合度。

之後影片分析專案的比賽數據，也存進同一個 SQLite（例如新增 match_stats 資料表），
網站就能同時顯示「自評能力」和「比賽實測」。
"""
import sqlite3
from pathlib import Path

import pandas as pd

# ---------- 能力分類（顏色也在這裡設定） ----------
CATEGORIES = [
    ("技術", "#3B82F6", [("ball_control", "Ball Control", "控球"),
                        ("passing", "Passing", "傳球"),
                        ("crossing", "Crossing / Long Ball", "傳中/長傳"),
                        ("dribbling", "Dribbling", "盤帶"),
                        ("ball_keeping", "Ball Keeping", "護球"),
                        ("weak_foot", "Weak Foot 2", "弱腳能力")]),
    ("進攻", "#EF4444", [("finishing", "Finishing", "射門"),
                        ("heading", "Heading", "頭球"),
                        ("set_piece", "Set Piece Taking", "定位球")]),
    ("心智", "#A855F7", [("pressure", "Pressure Handling", "抗壓"),
                        ("space", "Space Awareness", "空間感"),
                        ("play_reading", "Play Reading", "閱讀比賽"),
                        ("football_iq", "Football IQ", "球商")]),
    ("防守", "#10B981", [("duel", "1v1 Duel", "1v1 對抗"),
                        ("aerial", "1v1 Aerial Duel", "空中對抗"),
                        ("intercepting", "Intercepting", "攔截"),
                        ("goalkeeping", "Goal Keeping", "守門")]),
    ("身體", "#F59E0B", [("speed", "Speed", "速度"),
                        ("stamina", "Stamina", "體能"),
                        ("physical", "Physical Contact", "身體對抗"),
                        ("explosive", "Explosive Power", "爆發力")]),
]
# 攤平成 [(key, 表單欄位, 中文, 類別, 顏色), ...]
ABILITIES = [(k, col, zh, cat, color) for cat, color, items in CATEGORIES for k, col, zh in items]
ABILITY_KEYS = [a[0] for a in ABILITIES]

# ---------- 位置適合度：相關能力的加權平均（權重可自行調整） ----------
POSITION_WEIGHTS = {
    "GK": {"goalkeeping": .85, "explosive": .05, "pressure": .05, "play_reading": .05},
    "CB": {"heading": .15, "aerial": .15, "duel": .15, "intercepting": .15,
           "play_reading": .15, "physical": .15, "passing": .10},
    "LB/RB": {"duel": .20, "intercepting": .15, "speed": .15, "stamina": .15,
              "crossing": .10, "play_reading": .10, "space": .15},
    "LWB/RWB": {"stamina": .20, "speed": .15, "crossing": .15, "dribbling": .10,
                "duel": .15, "intercepting": .10, "ball_control": .15},
    "CDM": {"intercepting": .20, "play_reading": .20, "passing": .15, "duel": .15,
            "pressure": .10, "stamina": .10, "physical": .10},
    "CM": {"passing": .20, "ball_keeping": .15, "football_iq": .15, "stamina": .15,
           "space": .15, "pressure": .10, "ball_control": .10},
    "CAM": {"passing": .15, "football_iq": .15, "space": .15, "dribbling": .15,
            "ball_control": .15, "finishing": .15, "set_piece": .10},
    "LM/RM": {"crossing": .20, "stamina": .20, "speed": .15, "dribbling": .15,
              "passing": .15, "ball_control": .15},
    "LW/RW": {"dribbling": .25, "speed": .20, "explosive": .15, "finishing": .15,
              "crossing": .10, "ball_control": .15},
    "ST": {"finishing": .30, "heading": .15, "ball_keeping": .15, "explosive": .15,
           "physical": .10, "space": .15},
}
POSITIONS = list(POSITION_WEIGHTS)

# 表單欄位 → 資料庫欄位
INFO_COLUMNS = {
    "姓名": "name",
    "希望別人怎麼叫你 (ex:暱稱)": "nickname",
    "擅長的位子": "good_positions",
    "不擅長的位子": "bad_positions",
}
MESSAGE_PREFIX = "有什麼是你希望球隊上的人知道的"


def _split(s) -> list[str]:
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return []
    return [x.strip() for x in str(s).replace("，", ",").split(",") if x.strip()]


def build_db(xlsx_path: Path, db_path: Path) -> None:
    """把表單 xlsx 轉成 SQLite 的 players 資料表（每次重建）。"""
    raw = pd.read_excel(xlsx_path)
    msg_col = next((c for c in raw.columns if str(c).startswith(MESSAGE_PREFIX)), None)
    df = pd.DataFrame()
    for src, dst in INFO_COLUMNS.items():
        df[dst] = raw[src].astype(str).str.strip()
    df["message"] = raw[msg_col].fillna("").astype(str).str.strip() if msg_col else ""
    for key, col, *_ in ABILITIES:
        df[key] = pd.to_numeric(raw[col], errors="coerce").fillna(1).clip(1, 5).astype(int)
    df.insert(0, "id", range(1, len(df) + 1))
    with sqlite3.connect(db_path) as con:
        df.to_sql("players", con, if_exists="replace", index=False)


def load_players(db_path: Path) -> pd.DataFrame:
    with sqlite3.connect(db_path) as con:
        return pd.read_sql("SELECT * FROM players ORDER BY id", con)


def ensure_db(xlsx_path: Path, db_path: Path) -> None:
    """xlsx 比資料庫新（或資料庫不存在）就重建。"""
    if not db_path.exists() or xlsx_path.stat().st_mtime > db_path.stat().st_mtime:
        build_db(xlsx_path, db_path)


# ---------- 分析 ----------
def fitness(player: pd.Series) -> dict[str, float]:
    """回傳每個位置的適合度（0–100）。"""
    return {pos: round(float(sum(player[a] * w for a, w in ws.items())) * 20, 1)
            for pos, ws in POSITION_WEIGHTS.items()}


def recommended(player: pd.Series, top: int = 3) -> list[str]:
    fit = fitness(player)
    return sorted(fit, key=fit.get, reverse=True)[:top]


def good_positions(player: pd.Series) -> list[str]:
    return _split(player["good_positions"])


def bad_positions(player: pd.Series) -> list[str]:
    return _split(player["bad_positions"])


def display_name(player: pd.Series) -> str:
    return f"{player['name']}（{player['nickname']}）" if player["nickname"] not in ("", player["name"]) \
        else player["name"]
