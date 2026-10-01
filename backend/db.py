"""資料庫連線（PostgreSQL / Supabase）。

兩種連線方式：
- admin()：用 DATABASE_URL 的管理者身分，不受 RLS 限制 → 只給匯入工具、建資料表用
- as_user(user_id)：同一條連線，但在交易裡切成 authenticated 身分 → RLS 會生效
  API 一律用 as_user，就算後端程式寫錯，也讀不到別隊的資料（雙重保險）。
"""
import json
from collections.abc import Iterator
from contextlib import contextmanager

from .settings import load_settings


def connect(database_url: str | None = None):
    import psycopg
    from psycopg.rows import dict_row
    url = database_url or load_settings().database_url
    if not url:
        raise RuntimeError("沒有設定 DATABASE_URL（見 .env.example）")
    return psycopg.connect(url, row_factory=dict_row, connect_timeout=10)


@contextmanager
def admin(database_url: str | None = None) -> Iterator:
    with connect(database_url) as conn:
        yield conn


def claims_json(user_id: str) -> str:
    return json.dumps({"sub": str(user_id), "role": "authenticated"})


@contextmanager
def as_user(conn, user_id: str) -> Iterator:
    """在一個交易裡用某個使用者的身分查詢（交易結束自動恢復）。"""
    with conn.transaction():
        conn.execute("select set_config('request.jwt.claims', %s, true)", (claims_json(user_id),))
        conn.execute("set local role authenticated")
        yield conn
