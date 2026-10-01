"""球員報告：能力分析、位置、比賽數據。"""
import html

import pandas as pd
import streamlit as st

from domain.positions import split_positions
from domain.rating import average, category_scores, fitness, recommended
from infra.charts.bars import hbar
from domain.foot import feet
from infra.charts.feet import feet_img_html
from infra.charts.radar import Series
from infra.charts.style import ACCENT, MUTED
from infra.pipeline import load_match_rows
from infra.ui.common import (get_players, jersey, nickname, player_options, records, rules, show_pitch, show_plotly,
                             show_radar)
from infra.ui.theme import chips, kicker, kpi, nick_html
from stats.match import matches_played, player_totals
from stats.player import overall_rank, strengths, weaknesses
from stats.ranking import category_ranks
from stats.team import team_average, team_overall

R = rules()
players = get_players()
recs = records(players)
options = player_options(players)
keys = list(options)

if st.session_state.get("player_choice") not in options:
    st.session_state["player_choice"] = keys[0]

kicker("球員報告")
top_l, top_r = st.columns([3, 2], vertical_alignment="bottom")
with top_r:
    choice = st.selectbox("選擇球員", keys, key="player_choice")
p = recs[options[choice]]
team_avg = team_average(recs, R)
foot = feet(p, R)
with top_l:
    number = jersey(p["name"])
    lines = [nick_html(nickname(p)), f'<span class="potato-note">{foot.strong_label}</span>',
             f'<span class="potato-note">{foot.weak_label}</span>']
    info = "".join(f"<div>{x}</div>" for x in lines if x)
    title = f'<span class="potato-number">{"#" + html.escape(number) if number else "-"}</span> {html.escape(p["name"])}'
    st.markdown(f'<div class="potato-head"><div><h1>{title}</h1><div class="info">{info}</div></div>'
                f'{feet_img_html(foot, height=118)}</div>', unsafe_allow_html=True)

# ---------- KPI ----------
avg = average(p, R)
rec = recommended(p, R)
best = strengths(p, recs, R, n=1)[0]
k1, k2, k3, k4 = st.columns(4)
with k1:
    kpi("平均能力", f"{avg:.2f}", delta=avg - team_overall(recs, R), delta_suffix="vs 隊平均")
with k2:
    kpi("隊內排名", f"#{overall_rank(p, recs, R)}", f"共 {len(recs)} 人（依平均能力）")
with k3:
    kpi("數據推薦位置", rec[0], "其次 " + " · ".join(rec[1:]))
with k4:
    kpi("最強能力", best.label, f"{best.score:.0f} 分 · 隊內 #{best.rank}")

tab_ability, tab_position, tab_match = st.tabs(["能力分析", "位置", "比賽數據"])

# ---------- 能力分析 ----------
with tab_ability:
    left, right = st.columns([3, 2], gap="large")
    with left:
        show_radar([Series("全隊平均", team_avg, MUTED, dashed=True), Series(p["name"], p, ACCENT)],
                   R, color_points_by_category=True)
    with right:
        st.markdown("**強項**")
        st.dataframe(pd.DataFrame([{"能力": n.label, "分數": int(n.score), "隊內排名": f"#{n.rank}"}
                                   for n in strengths(p, recs, R)]), hide_index=True)
        st.markdown("**待加強**")
        st.dataframe(pd.DataFrame([{"能力": n.label, "分數": int(n.score), "隊內排名": f"#{n.rank}"}
                                   for n in weaknesses(p, recs, R)]), hide_index=True)
        st.markdown("**類別分數**")
        mine, team = category_scores(p, R), category_scores(team_avg, R)
        ranks = category_ranks(p, recs, R)
        st.dataframe(pd.DataFrame([{"類別": c, "球員": mine[c], "隊內排名": f"#{ranks[c]} / {len(recs)}",
                                    "隊平均": team[c], "差距": round(mine[c] - team[c], 2)}
                                   for c in mine]), hide_index=True,
                     column_config={"差距": st.column_config.NumberColumn(format="%+.2f")})

# ---------- 位置 ----------
with tab_position:
    left, right = st.columns([3, 2], gap="large")
    with left:
        show_pitch(p, R)
    with right:
        st.markdown("**自評擅長**", help="球員自己在表單填的")
        st.markdown(chips(split_positions(p["good_positions"])), unsafe_allow_html=True)
        st.markdown("**自評不擅長**")
        st.markdown(chips(split_positions(p["bad_positions"])), unsafe_allow_html=True)
        st.markdown("**各位置適合度**（數據推算，滿分 100）")
        show_plotly(hbar(fitness(p, R), highlight=set(rec), x_max=100))

# ---------- 比賽數據 ----------
with tab_match:
    rows = load_match_rows()
    n = matches_played(rows, p["name"])
    if n == 0:
        st.info("還沒有這位球員的比賽數據。影片分析上線後，跑動距離、傳球等數據會顯示在這裡。")
    else:
        kpi("出賽場次", n)
        totals = player_totals(rows, p["name"])
        st.dataframe(pd.DataFrame([{"數據": k, "總計": v, "場均": round(v / n, 1)} for k, v in totals.items()]),
                     hide_index=True)

if p["message"]:
    st.caption(f"💬 給球隊的話：{p['message']}")
