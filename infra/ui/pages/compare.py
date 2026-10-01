"""球員比較：兩位球員，或一位球員 vs 全隊平均。"""
import pandas as pd
import streamlit as st

from domain.rating import average, category_scores
from infra.charts.radar import Series
from infra.charts.style import ACCENT, MUTED, SECOND
from infra.ui.common import get_players, player_options, records, rules, show_radar
from infra.ui.theme import kicker, kpi
from stats.player import biggest_differences
from stats.team import team_average

R = rules()
players = get_players()
recs = records(players)
options = player_options(players)
keys = list(options)

kicker("比較")
st.title("球員比較")

c1, c2, c3 = st.columns([2, 2, 1], vertical_alignment="bottom")
a_key = c1.selectbox("球員 A", keys, index=0, key="compare_a")
vs_team = c3.toggle("和全隊平均比", key="compare_vs_team")
b_key = c2.selectbox("球員 B", keys, index=1 if len(keys) > 1 else 0, key="compare_b", disabled=vs_team)

a = recs[options[a_key]]
if vs_team:
    b, b_label = team_average(recs, R), "全隊平均"
else:
    b = recs[options[b_key]]
    b_label = b["name"]

left, right = st.columns([3, 2], gap="large")
with left:
    series = [Series(a["name"], a, ACCENT)]
    series.append(Series(b_label, b, MUTED, dashed=True) if vs_team else Series(b_label, b, SECOND))
    show_radar(series, R)
with right:
    m1, m2 = st.columns(2)
    with m1:
        kpi(a["name"], f"{average(a, R):.2f}", "平均能力", delta=average(a, R) - average(b, R))
    with m2:
        kpi(b_label, f"{average(b, R):.2f}", "平均能力")
    st.markdown("**差距最大的 5 項能力**")
    st.dataframe(pd.DataFrame([{"能力": d.label, "類別": d.category, a["name"]: int(d.a),
                                b_label: round(d.b, 1), "差距": d.diff}
                               for d in biggest_differences(a, b, R)]),
                 hide_index=True, column_config={"差距": st.column_config.NumberColumn(format="%+.1f")})
    st.markdown("**類別分數**")
    ca, cb = category_scores(a, R), category_scores(b, R)
    st.dataframe(pd.DataFrame([{"類別": c, a["name"]: ca[c], b_label: cb[c], "差距": round(ca[c] - cb[c], 2)}
                               for c in ca]), hide_index=True,
                 column_config={"差距": st.column_config.NumberColumn(format="%+.2f")})
