"""各頁面共用的工具：載入球員資料、顯示圖表、選球員。"""
import pandas as pd
import streamlit as st

from core import charts
from core.analysis import display_name
from core.db import sync_players
from core.sources import XlsxSource, get_source

REFRESH_SECONDS = 300  # 試算表資料最多快取 5 分鐘


@st.cache_data(ttl=REFRESH_SECONDS, show_spinner="載入球員資料中…")
def _load(_source, cache_key: str) -> pd.DataFrame:
    return sync_players(_source)


def get_players() -> pd.DataFrame:
    source = get_source(st.secrets)
    # 本機檔案被換掉時（修改時間變了）自動重新載入
    mtime = source.path.stat().st_mtime if isinstance(source, XlsxSource) and source.path.exists() else 0
    key = f"{source.label}:{mtime}"
    try:
        return _load(source, key)
    except Exception as e:  # 資料讀不到時給清楚的錯誤訊息，而不是整頁當掉
        st.error(f"讀取球員資料失敗（來源：{source.label}）：{e}")
        st.stop()


def data_source_label() -> str:
    return get_source(st.secrets).label


def player_options(players: pd.DataFrame) -> dict[str, int]:
    """{"林宥成（Evan）": 列索引, ...}"""
    return {display_name(p): i for i, p in players.iterrows()}


def show_fig(fig) -> None:
    st.pyplot(fig)
    charts.plt.close(fig)
