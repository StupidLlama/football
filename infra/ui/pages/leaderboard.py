"""排行榜：依平均能力、各類別或任何一項能力排名。"""
import pandas as pd
import streamlit as st

from infra.ui.common import PLAYER_PAGE, get_players, name_to_display, records, rules
from infra.ui.theme import kicker, kpi
from stats.ranking import AVERAGE, category_ranks, leaderboard, metric_label

R = rules()
recs = records(get_players())
shown = name_to_display(recs)

kicker("排行榜")
st.title("排行榜")
st.markdown('<span class="potato-note">自評能力 1–5 分 · 同分同名次 · 點表格任一列可以打開球員報告</span>',
            unsafe_allow_html=True)

KINDS = ["類別", "個別能力"]
kind = st.segmented_control("排名項目", KINDS, default=KINDS[0], key="board_kind") or KINDS[0]
options = [AVERAGE] + [c.name for c in R.categories] if kind == KINDS[0] else R.ability_keys
key = f"board_metric_{kind}"
if st.session_state.get(key) not in options:
    st.session_state[key] = options[0]
metric = st.selectbox("依什麼排名", options, format_func=lambda m: metric_label(m, R), key=key)

board = leaderboard(recs, metric, R)
cols = st.columns(3)
for col, e in zip(cols, board[:3]):
    with col:
        kpi(f"第 {e.rank} 名", shown[e.name], f"{e.score:.2f} 分")

table = pd.DataFrame([{"名次": e.rank, "球員": shown[e.name], "分數": e.score} for e in board])
event = st.dataframe(table, hide_index=True, on_select="rerun", selection_mode="single-row", key="board_table",
                     column_config={"分數": st.column_config.ProgressColumn("分數", min_value=R.min_score,
                                                                          max_value=R.max_score, format="%.2f")})
if event.selection.rows:
    st.session_state["player_choice"] = table.iloc[event.selection.rows[0]]["球員"]
    st.switch_page(PLAYER_PAGE)

st.subheader("各類別名次一覽")
st.markdown('<span class="potato-note">每個人在每個類別的隊內名次（1 = 最強），一眼看出誰哪方面突出</span>',
            unsafe_allow_html=True)
rows = []
for p in recs:
    ranks = category_ranks(p, recs, R)
    rows.append({"球員": shown[p["name"]], **{c: ranks[c] for c in ranks}})
overview = pd.DataFrame(rows).sort_values(by=[c.name for c in R.categories]).reset_index(drop=True)
st.dataframe(overview, hide_index=True,
             column_config={c.name: st.column_config.NumberColumn(c.name, format="#%d") for c in R.categories})
