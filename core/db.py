"""SQLite 資料庫：球員、比賽、比賽數據都存在這裡。

資料表：
- players       球員（每次從表單同步時整批更新）
- matches       比賽（之後影片分析寫入）
- match_stats   每位球員每場比賽的數據（之後影片分析寫入）

資料表結構要改時：在 MIGRATIONS 最後面「新增」一段 SQL，不要改舊的。
程式啟動時會自動把資料庫升級到最新版本，舊資料不會不見。
"""
import sqlite3
from pathlib import Path

import pandas as pd

from .config import ROOT, settings

DEFAULT_DB = ROOT / "data" / "team.db"

# 第 i 段 = 升到版本 i+1。只能往後加！
MIGRATIONS = [
    # v1：比賽相關資料表（players 由同步時依設定檔自動建立，才能跟著能力項目增減）
    """
    CREATE TABLE IF NOT EXISTS matches (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        played_on   TEXT NOT NULL,          -- 比賽日期 YYYY-MM-DD
        opponent    TEXT NOT NULL,
        goals_for   INTEGER,
        goals_against INTEGER,
        video_path  TEXT,                   -- 影片檔位置
        notes       TEXT
    );
    CREATE TABLE IF NOT EXISTS match_stats (
        match_id    INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        player_name TEXT NOT NULL,          -- 對應 players.name
        stat        TEXT NOT NULL,          -- 例如 distance_m、passes、sprints
        value       REAL NOT NULL,
        PRIMARY KEY (match_id, player_name, stat)
    );
    """,
]


def connect(db_path: Path = DEFAULT_DB) -> sqlite3.Connection:
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(db_path)
    con.execute("PRAGMA foreign_keys = ON")
    migrate(con)
    return con


def schema_version(con: sqlite3.Connection) -> int:
    return con.execute("PRAGMA user_version").fetchone()[0]


def migrate(con: sqlite3.Connection) -> None:
    for version in range(schema_version(con), len(MIGRATIONS)):
        con.executescript(MIGRATIONS[version])
        con.execute(f"PRAGMA user_version = {version + 1}")
    con.commit()


# ---------- 球員 ----------
def save_players(con: sqlite3.Connection, players: pd.DataFrame) -> None:
    """整批取代 players 資料表（欄位依設定檔的能力項目自動調整）。"""
    df = players.copy()
    df.insert(0, "id", range(1, len(df) + 1))
    df.to_sql("players", con, if_exists="replace", index=False)
    con.commit()


def load_players(con: sqlite3.Connection) -> pd.DataFrame:
    return pd.read_sql("SELECT * FROM players ORDER BY id", con)


# ---------- 比賽（給影片分析用） ----------
def add_match(con, played_on: str, opponent: str, goals_for=None, goals_against=None,
              video_path=None, notes=None) -> int:
    cur = con.execute(
        "INSERT INTO matches (played_on, opponent, goals_for, goals_against, video_path, notes) "
        "VALUES (?, ?, ?, ?, ?, ?)", (played_on, opponent, goals_for, goals_against, video_path, notes))
    con.commit()
    return cur.lastrowid


def save_match_stats(con, match_id: int, stats: dict[str, dict[str, float]]) -> None:
    """stats = {"林宥成": {"distance_m": 8200, "passes": 31}, ...}"""
    con.executemany(
        "INSERT OR REPLACE INTO match_stats (match_id, player_name, stat, value) VALUES (?, ?, ?, ?)",
        [(match_id, p, k, float(v)) for p, d in stats.items() for k, v in d.items()])
    con.commit()


def load_matches(con) -> pd.DataFrame:
    return pd.read_sql("SELECT * FROM matches ORDER BY played_on DESC", con)


def load_match_stats(con, match_id: int | None = None) -> pd.DataFrame:
    q = "SELECT * FROM match_stats" + (" WHERE match_id = ?" if match_id else "")
    return pd.read_sql(q, con, params=(match_id,) if match_id else None)


def sync_players(source, db_path: Path = DEFAULT_DB) -> pd.DataFrame:
    """資料來源 → 整理 → 存進資料庫 → 讀回來。網站每次載入都走這條路。"""
    from .ingest import normalize

    players = normalize(source.load(), settings())
    con = connect(db_path)
    try:
        save_players(con, players)
        return load_players(con)
    finally:
        con.close()
