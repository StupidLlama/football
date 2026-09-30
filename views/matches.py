import streamlit as st

from core.db import connect, load_match_stats, load_matches

st.title("比賽數據")

con = connect()
try:
    matches = load_matches(con)
    if matches.empty:
        st.info("🚧 還沒有比賽資料。之後影片分析（analysis/）跑完會把結果寫進資料庫，"
                "這裡就會顯示每場比賽和每位球員的數據，並和自評能力對照。")
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
