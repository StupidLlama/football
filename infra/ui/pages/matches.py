"""比賽數據（影片分析的結果）。"""
import streamlit as st

from adapters.repository import load_match_stats, load_matches
from infra.db import connect
from infra.ui.theme import kicker

kicker("比賽")
st.title("比賽數據")

con = connect()
try:
    matches = load_matches(con)
    if matches.empty:
        st.info("🚧 還沒有比賽資料。影片分析（analysis/）跑完後會寫進資料庫，"
                "這裡就會顯示每場比賽和每位球員的數據。")
    else:
        labels = {f"{r.played_on} vs {r.opponent}": r.id for r in matches.itertuples()}
        pick = st.selectbox("選擇比賽", list(labels))
        stats = load_match_stats(con, labels[pick])
        if stats.empty:
            st.warning("這場比賽還沒有球員數據。")
        else:
            st.dataframe(stats.pivot(index="player_name", columns="stat", values="value"))
finally:
    con.close()
