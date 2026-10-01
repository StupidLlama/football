"""SQLite：建立連線、自動升級資料表。

資料表：
- players       球員（每次從表單同步時整批更新，欄位跟著設定檔的能力走）
- matches       比賽（影片分析寫入）
- match_stats   每位球員每場比賽的數據（影片分析寫入）

資料表結構要改：在 MIGRATIONS 最後面「新增」一段 SQL，不要改舊的。
"""
import sqlite3
from pathlib import Path

from .config import ROOT

DEFAULT_DB = ROOT / "data" / "team.db"

# 第 i 段 = 升到版本 i+1。只能往後加！
MIGRATIONS = [
    """
    CREATE TABLE IF NOT EXISTS matches (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        played_on     TEXT NOT NULL,
        opponent      TEXT NOT NULL,
        goals_for     INTEGER,
        goals_against INTEGER,
        video_path    TEXT,
        notes         TEXT
    );
    CREATE TABLE IF NOT EXISTS match_stats (
        match_id    INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        player_name TEXT NOT NULL,
        stat        TEXT NOT NULL,
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
