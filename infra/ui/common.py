"""各頁共用：載入資料、顯示圖表、選球員。"""
import pandas as pd
import streamlit as st

from domain.models import RatingRules
from infra import config
from infra.charts import pitch as pitch_chart
from infra.charts.radar import Series, legend_items, radar
from infra.pipeline import sync_players
from infra.sources import XlsxSource, get_source

REFRESH_SECONDS = 300  # 試算表資料最多快取 5 分鐘
PLAYER_PAGE = "infra/ui/pages/player.py"


@st.cache_data(ttl=REFRESH_SECONDS, show_spinner="載入球員資料中…")
def _load(_source, cache_key: str, overrides: tuple) -> pd.DataFrame:
    return sync_players(_source, message_overrides=dict(overrides))


def secret_table(key: str) -> dict:
    """讀 secrets 裡的一個表格；本機沒有 secrets.toml 或沒設定時回傳空的。"""
    try:
        return dict(st.secrets.get(key, {}))
    except Exception:
        return {}


def get_players() -> pd.DataFrame:
    source = get_source(st.secrets)
    mtime = source.path.stat().st_mtime if isinstance(source, XlsxSource) and source.path.exists() else 0
    overrides = tuple(sorted((str(k), str(v)) for k, v in secret_table("message_overrides").items()))
    try:
        return _load(source, f"{source.label}:{mtime}", overrides)
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


def show_radar(series: list[Series], rules: RatingRules, **kwargs) -> None:
    """雷達圖＋上方的圖例列。"""
    from infra.ui.theme import legend
    legend(legend_items(series, rules))
    show_plotly(radar(series, rules, **kwargs))


def name_to_display(players: list[dict]) -> dict[str, str]:
    """名字 → 顯示名稱（名字＋暱稱）。"""
    return {p["name"]: display_name(p) for p in players}
