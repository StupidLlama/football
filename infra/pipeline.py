"""把各層接起來：資料來源（Tools）→ 表單翻譯（Translate）→ 資料庫（Tools）。

這是整個程式唯一同時知道「所有層」的地方（組裝點），UI 和腳本都從這裡拿資料。
"""
from dataclasses import replace
from pathlib import Path

import pandas as pd

from adapters import repository
from adapters.form import normalize

from . import config
from .db import DEFAULT_DB, connect


def sync_players(source, db_path: Path = DEFAULT_DB, message_overrides: dict | None = None) -> pd.DataFrame:
    """message_overrides：額外的「給球隊的話」覆寫（從 secrets 來，裡面有隊員名字，不放進 Git）。"""
    spec = config.form_spec()
    if message_overrides:
        spec = replace(spec, message_overrides={**spec.message_overrides, **message_overrides})
    players = normalize(source.load(), spec, config.rules())
    con = connect(db_path)
    try:
        repository.save_players(con, players)
        return repository.load_players(con)
    finally:
        con.close()


def load_match_rows(db_path: Path = DEFAULT_DB) -> list[dict]:
    con = connect(db_path)
    try:
        return repository.load_match_stats(con).to_dict("records")
    finally:
        con.close()
