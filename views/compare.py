import streamlit as st

from core import charts
from views.common import get_players, player_options, show_fig

players = get_players()
options = player_options(players)
keys = list(options)

st.title("球員比較")
c1, c2 = st.columns(2)
a = c1.selectbox("球員 A", keys, index=0)
b = c2.selectbox("球員 B", keys, index=1 if len(keys) > 1 else 0)
pa, pb = players.loc[options[a]], players.loc[options[b]]

_, mid, _ = st.columns([1, 2, 1])
with mid:
    show_fig(charts.radar([pa, pb], labels=[pa["name"], pb["name"]]))
