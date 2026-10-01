"""各頁共用：載入資料、顯示圖表、選球員。"""
import pandas as pd
import streamlit as st

from domain.models import RatingRules
from infra import config
from infra.charts import pitch as pitch_chart
from infra.pipeline import sync_players
from infra.sources import XlsxSource, get_source

REFRESH_SECONDS = 300  # 試算表資料最多快取 5 分鐘
PLAYER_PAGE = "infra/ui/pages/player.py"


@st.cache_data(ttl=REFRESH_SECONDS, show_spinner="載入球員資料中…")
def _load(_source, cache_key: str) -> pd.DataFrame:
    return sync_players(_source)


def get_players() -> pd.DataFrame:
    source = get_source(st.secrets)
    mtime = source.path.stat().st_mtime if isinstance(source, XlsxSource) and source.path.exists() else 0
    try:
        return _load(source, f"{source.label}:{mtime}")
    except Exception as e:  # 讀不到資料時給清楚的訊息，而不是整頁當掉
        st.error(f"讀取球員資料失敗（來源：{source.label}）：{e}")
        st.stop()


def records(players: pd.DataFrame) -> list[dict]:
    """DataFrame → 一般 dict 的 list（統計層只吃一般資料）。"""
    return players.to_dict("records")


def rules() -> RatingRules:
    return config.rules()


def data_source_label() -> str:
    return get_source(st.secrets).label


def display_name(player) -> str:
    nick = player["nickname"]
    return f"{player['name']}（{nick}）" if nick and nick != player["name"] else player["name"]


def player_options(players: pd.DataFrame) -> dict[str, int]:
    return {display_name(p): i for i, p in players.iterrows()}


def show_plotly(fig: dict) -> None:
    st.plotly_chart(fig, config={"displayModeBar": False})


def show_pitch(player, rules: RatingRules) -> None:
    fig = pitch_chart.pitch(player, rules)
    st.pyplot(fig)
    pitch_chart.close(fig)
