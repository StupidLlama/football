"""Database reader：球員、比賽資料的讀寫。

只用標準的資料庫連線介面（con.execute），不管資料庫是哪一種；
連線怎麼建立、資料表怎麼升級，是 infra/db.py 的事。
"""
import pandas as pd


# ---------- 球員 ----------
def save_players(con, players: pd.DataFrame) -> None:
    """整批取代 players 資料表（欄位依設定檔的能力自動調整）。"""
    df = players.copy()
    df.insert(0, "id", range(1, len(df) + 1))
    df.to_sql("players", con, if_exists="replace", index=False)
    con.commit()


def load_players(con) -> pd.DataFrame:
    return pd.read_sql("SELECT * FROM players ORDER BY id", con)


# ---------- 比賽（影片分析寫入） ----------
def add_match(con, played_on: str, opponent: str, goals_for=None, goals_against=None,
              video_path=None, notes=None) -> int:
    cur = con.execute(
        "INSERT INTO matches (played_on, opponent, goals_for, goals_against, video_path, notes) "
        "VALUES (?, ?, ?, ?, ?, ?)", (played_on, opponent, goals_for, goals_against, video_path, notes))
    con.commit()
    return cur.lastrowid


def save_match_stats(con, match_id: int, stats: dict[str, dict[str, float]]) -> None:
    """stats = {"王小明": {"distance_m": 8200, "passes": 31}, ...}"""
    con.executemany(
        "INSERT OR REPLACE INTO match_stats (match_id, player_name, stat, value) VALUES (?, ?, ?, ?)",
        [(match_id, p, k, float(v)) for p, d in stats.items() for k, v in d.items()])
    con.commit()


def load_matches(con) -> pd.DataFrame:
    return pd.read_sql("SELECT * FROM matches ORDER BY played_on DESC", con)


def load_match_stats(con, match_id: int | None = None) -> pd.DataFrame:
    q = "SELECT * FROM match_stats" + (" WHERE match_id = ?" if match_id else "")
    return pd.read_sql(q, con, params=(match_id,) if match_id else None)
