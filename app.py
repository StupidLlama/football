"""球隊球員網站（Streamlit）

本機執行：
    pip install -r requirements.txt
    streamlit run app.py
"""
from pathlib import Path

import pandas as pd
import streamlit as st

from core import charts
from core.data import (POSITIONS, bad_positions, display_name, ensure_db, fitness, good_positions,
                       load_players, recommended)

ROOT = Path(__file__).parent
XLSX = ROOT / "data" / "team.xlsx"
DB = ROOT / "data" / "team.db"

st.set_page_config(page_title="球隊球員卡", page_icon="⚽", layout="wide")


# ---------- 隊伍密碼（有設定 secrets 才會啟用） ----------
def check_password() -> bool:
    try:
        pw = st.secrets["team_password"]
    except Exception:
        return True  # 本機沒設定密碼 → 直接進入
    if st.session_state.get("authed"):
        return True
    st.title("⚽ 球隊球員卡")
    entered = st.text_input("請輸入隊伍密碼", type="password")
    if entered:
        if entered == pw:
            st.session_state["authed"] = True
            st.rerun()
        else:
            st.error("密碼錯誤")
    return False


if not check_password():
    st.stop()


@st.cache_data
def get_players(_mtime: float) -> pd.DataFrame:
    ensure_db(XLSX, DB)
    return load_players(DB)


players = get_players(XLSX.stat().st_mtime)
names = {display_name(p): i for i, p in players.iterrows()}

# ---------- 側邊欄導覽 ----------
st.sidebar.title("⚽ 球隊球員卡")
page = st.sidebar.radio("頁面", ["全隊", "球員", "比較", "比賽數據"], label_visibility="collapsed")
st.sidebar.caption(f"共 {len(players)} 位球員")


def fig_show(fig):
    st.pyplot(fig)
    charts.plt.close(fig)


# ---------- 全隊 ----------
if page == "全隊":
    st.title("全隊球員")
    pos_filter = st.multiselect("篩選擅長位置", POSITIONS, placeholder="選擇位置（不選 = 全部）")
    rows = []
    for _, p in players.iterrows():
        good = good_positions(p)
        if pos_filter and not set(pos_filter) & set(good):
            continue
        rows.append({"姓名": p["name"], "暱稱": p["nickname"], "擅長": ", ".join(good),
                     "不擅長": ", ".join(bad_positions(p)), "數據推薦": ", ".join(recommended(p))})
    st.dataframe(pd.DataFrame(rows), hide_index=True)
    st.caption("數據推薦：依能力評分計算各位置適合度，取前三名。")

# ---------- 球員 ----------
elif page == "球員":
    choice = st.sidebar.selectbox("選擇球員", list(names))
    p = players.loc[names[choice]]
    st.title(p["name"])
    st.markdown(f"**暱稱：** {p['nickname']}")
    if p["message"]:
        st.info(f"💬 給球隊的話：{p['message']}")
    c1, c2 = st.columns([1, 1.25])
    with c1:
        st.subheader("能力雷達圖")
        fig_show(charts.radar(p))
    with c2:
        st.subheader("適合位置")
        fig_show(charts.pitch(p))
        with st.expander("各位置適合度（數據推算，滿分 100）"):
            fit = fitness(p)
            fit_df = (pd.DataFrame({"位置": list(fit), "適合度": list(fit.values())})
                      .sort_values("適合度", ascending=False))
            st.dataframe(fit_df, hide_index=True)

# ---------- 比較 ----------
elif page == "比較":
    st.title("球員比較")
    keys = list(names)
    c1, c2 = st.columns(2)
    a = c1.selectbox("球員 A", keys, index=0)
    b = c2.selectbox("球員 B", keys, index=1 if len(keys) > 1 else 0)
    pa, pb = players.loc[names[a]], players.loc[names[b]]
    l, m, r = st.columns([1, 2, 1])
    with m:
        fig_show(charts.radar([pa, pb], labels=[pa["name"], pb["name"]]))

# ---------- 比賽數據（預留給影片分析） ----------
else:
    st.title("比賽數據")
    st.info("🚧 之後影片分析專案（OpenCV / YOLO / ByteTrack）的結果會放在這裡，"
            "例如每位球員的跑動距離、傳球次數、熱區圖，並與自評能力對照。")
