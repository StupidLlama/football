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


def nickname(player) -> str:
    """暱稱；沒填或跟名字一樣就回傳空字串（畫面上用灰色小字另外顯示，不跟名字擠在一起）。"""
    nick = str(player.get("nickname", "") or "")
    return "" if nick == player["name"] else nick


def player_options(players: pd.DataFrame) -> dict[str, int]:
    """選單用：名字 → 列號（選單裡只放名字）。"""
    return {p["name"]: i for i, p in players.iterrows()}


def jersey_numbers() -> dict[str, str]:
    """背號：寫在 secrets 的 [jersey_numbers]（"名字" = 7），還沒決定就不寫。"""
    return {str(k): str(v) for k, v in secret_table("jersey_numbers").items()}


def jersey(name: str) -> str:
    return jersey_numbers().get(name, "")


def grey_column(df: pd.DataFrame, column: str = "暱稱"):
    """表格裡的暱稱欄用灰色字（回傳 pandas Styler，st.dataframe 可以直接顯示）。"""
    from infra.charts.style import MUTED
    styler = df.style if isinstance(df, pd.DataFrame) else df
    return styler.set_properties(subset=[column], **{"color": MUTED})


def show_plotly(fig: dict) -> None:
    st.plotly_chart(fig, config={"displayModeBar": False})


def show_pitch(player, rules: RatingRules) -> None:
    fig = pitch_chart.pitch(player, rules)
    st.pyplot(fig)
    pitch_chart.close(fig)


def show_radar(series: list[Series], rules: RatingRules, **kwargs) -> None:
    """雷達圖＋圖下方的圖例列。"""
    from infra.ui.theme import legend
    show_plotly(radar(series, rules, **kwargs))
    legend(legend_items(series, rules))


def nicknames(players: list[dict]) -> dict[str, str]:
    """名字 → 暱稱（沒有就空字串）。"""
    return {p["name"]: nickname(p) for p in players}


# ---------- 賽程（v1.4）----------
TAIPEI = "Asia/Taipei"


def now_taipei():
    """伺服器在國外（UTC），比賽時間以台灣時間為準。"""
    from datetime import datetime
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo(TAIPEI))


@st.cache_data(ttl=REFRESH_SECONDS, show_spinner="載入賽程中…")
def _load_fixtures(_source, cache_key: str, worksheet: str):
    from infra.schedule import load_fixtures
    return load_fixtures(_source, worksheet)


def get_fixtures():
    """回傳 (fixtures, 錯誤訊息)。讀不到賽程不會讓整頁當掉。"""
    from infra.schedule import XlsxScheduleSource, get_schedule_source
    source = get_schedule_source(st.secrets)
    ws = config.schedule_settings().worksheet
    mtime = source.path.stat().st_mtime if isinstance(source, XlsxScheduleSource) and source.path.exists() else 0
    try:
        return _load_fixtures(source, f"{source.label}:{mtime}", ws), ""
    except Exception as e:
        return [], f"讀取賽程失敗（來源：{source.label}）：{e}"


def roles() -> dict[str, str]:
    """隊長 / 副隊長：寫在 secrets 的 [roles]（"名字" = "C" / "VC"）。"""
    return {str(k): str(v) for k, v in secret_table("roles").items()}
