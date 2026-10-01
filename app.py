"""🥔 Football Analysis Potato — 入口

本機執行：  py -m streamlit run app.py
新增頁面：  在 infra/ui/pages/ 新增 .py 檔，再加進下面的 PAGES。

程式分成四層（見 docs/PROJECT_PLAN.md）：
  domain/    Core           比賽規則、評分規則（純 Python）
  stats/     Inner shell    比賽 / 球隊 / 球員統計（純 Python）
  adapters/  Translate      表單翻譯、資料庫讀寫、（之後）影片翻譯
  infra/     Tools shell    Streamlit、Plotly、SQLite、Google 試算表、（之後）OpenCV/YOLO
"""
import streamlit as st

from infra import config
from infra.ui.common import data_source_label
from infra.ui.theme import inject_css

APP_NAME = "Football Analysis Potato"

st.set_page_config(page_title=APP_NAME, page_icon="🥔", layout="wide")
inject_css()

PAGES = [
    st.Page("infra/ui/pages/home.py", title="首頁", icon=":material/home:", default=True),
    st.Page("infra/ui/pages/player.py", title="球員報告", icon=":material/person:"),
    st.Page("infra/ui/pages/compare.py", title="球員比較", icon=":material/compare_arrows:"),
    st.Page("infra/ui/pages/overview.py", title="能力總覽", icon=":material/table_chart:"),
    st.Page("infra/ui/pages/leaderboard.py", title="排行榜", icon=":material/leaderboard:"),
    st.Page("infra/ui/pages/lineup.py", title="組隊", icon=":material/groups:"),
    st.Page("infra/ui/pages/matches.py", title="比賽數據", icon=":material/sports_soccer:"),
    st.Page("infra/ui/pages/coach.py", title="教練", icon=":material/sports:"),
]


def team_password() -> str | None:
    """secrets 有設定 team_password 才要求密碼；本機沒設定就直接進入。"""
    try:
        return st.secrets["team_password"]
    except Exception:
        return None


def check_password(pw: str | None) -> bool:
    if pw is None or st.session_state.get("authed"):
        return True
    st.title(f"🥔 {APP_NAME}")
    entered = st.text_input("請輸入隊伍密碼", type="password")
    if entered:
        if entered == pw:
            st.session_state["authed"] = True
            st.rerun()
        st.error("密碼錯誤")
    return False


# 先註冊頁面（還沒登入時把導覽藏起來），這樣登入後會留在原本打開的頁面，不會跳回首頁
pw = team_password()
logged_in = pw is None or bool(st.session_state.get("authed"))
nav = st.navigation(PAGES, position="sidebar" if logged_in else "hidden")
if not check_password(pw):
    st.stop()

with st.sidebar:
    st.caption(f"資料來源：{data_source_label()}")
    if st.button("重新載入資料", icon=":material/refresh:"):
        st.cache_data.clear()
        for key in ("duty_draft", "duty_saved"):   # 裁判名單也重新讀
            st.session_state.pop(key, None)
        st.rerun()
    if config.feedback_url():
        st.link_button("意見回饋", config.feedback_url(), icon=":material/feedback:")
nav.run()
