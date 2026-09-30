import pandas as pd
import streamlit as st

from core import charts
from core.analysis import fitness
from views.common import get_players, player_options, show_fig

players = get_players()
options = player_options(players)

choice = st.sidebar.selectbox("選擇球員", list(options), key="player_choice")
p = players.loc[options[choice]]

st.title(p["name"])
st.markdown(f"**暱稱：** {p['nickname']}")
if p["message"]:
    st.info(f"💬 給球隊的話：{p['message']}")

left, right = st.columns([1, 1.25])
with left:
    st.subheader("能力雷達圖")
    show_fig(charts.radar(p))
with right:
    st.subheader("適合位置")
    show_fig(charts.pitch(p))
    with st.expander("各位置適合度（數據推算，滿分 100）"):
        fit = fitness(p)
        st.dataframe(pd.DataFrame({"位置": list(fit), "適合度": list(fit.values())})
                     .sort_values("適合度", ascending=False), hide_index=True)
