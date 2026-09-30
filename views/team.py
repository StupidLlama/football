import pandas as pd
import streamlit as st

from core.analysis import bad_positions, good_positions, recommended
from core.config import settings
from views.common import get_players

players = get_players()

st.title("全隊球員")
pos_filter = st.multiselect("篩選擅長位置", settings().positions, placeholder="選擇位置（不選 = 全部）")

rows = []
for _, p in players.iterrows():
    good = good_positions(p)
    if pos_filter and not set(pos_filter) & set(good):
        continue
    rows.append({"姓名": p["name"], "暱稱": p["nickname"], "擅長": ", ".join(good),
                 "不擅長": ", ".join(bad_positions(p)), "數據推薦": ", ".join(recommended(p))})

st.dataframe(pd.DataFrame(rows), hide_index=True)
st.caption(f"數據推薦：依能力評分計算各位置適合度，取前 {settings().top_n} 名。")
