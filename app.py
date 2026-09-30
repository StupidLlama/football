"""球隊球員網站 — 入口

本機執行：  py -m streamlit run app.py
新增頁面：  在 views/ 新增一個 .py 檔，再加進下面的 PAGES。
"""
import streamlit as st

from views.common import data_source_label

st.set_page_config(page_title="球隊球員卡", page_icon="⚽", layout="wide")

PAGES = [
    st.Page("views/team.py", title="全隊", icon="👥", default=True),
    st.Page("views/player.py", title="球員", icon="🧍"),
    st.Page("views/compare.py", title="比較", icon="⚖️"),
    st.Page("views/matches.py", title="比賽數據", icon="📹"),
]


def check_password() -> bool:
    """secrets.toml 有設定 team_password 才會要求密碼；本機沒設定就直接進入。"""
    try:
        pw = st.secrets["team_password"]
    except Exception:
        return True
    if st.session_state.get("authed"):
        return True
    st.title("⚽ 球隊球員卡")
    entered = st.text_input("請輸入隊伍密碼", type="password")
    if entered:
        if entered == pw:
            st.session_state["authed"] = True
            st.rerun()
        st.error("密碼錯誤")
    return False


if not check_password():
    st.stop()

nav = st.navigation(PAGES)
with st.sidebar:
    st.caption(f"資料來源：{data_source_label()}")
    if st.button("🔄 重新載入資料"):
        st.cache_data.clear()
        st.rerun()
nav.run()
