"""首頁：Football Analysis Potato 🥔 — 球隊總覽。"""
import pandas as pd
import streamlit as st
from matplotlib.colors import LinearSegmentedColormap

from domain.positions import split_positions
from domain.rating import average, category_scores, recommended
from infra.charts.bars import hbar
from infra.charts.style import ACCENT, PANEL
from infra.ui.common import (PLAYER_PAGE, data_source_label, get_players, grey_column, jersey_numbers, nickname,
                             records, rules, show_plotly)
from infra.ui.theme import kicker, kpi
from stats.team import category_averages, good_position_counts, team_overall

R = rules()
players = get_players()
recs = records(players)

kicker("球隊總覽")
st.title("🥔 Football Analysis Potato")
st.markdown(f'<span class="potato-note">資料來源：{data_source_label()} · 自評能力 1–5 分 · '
            f'點表格任一列可以打開球員報告</span>', unsafe_allow_html=True)

# ---------- KPI ----------
cat_avg = category_averages(recs, R)
best_cat = max(cat_avg, key=cat_avg.get)
counts = good_position_counts(recs, R.positions)
top_pos = max(counts, key=counts.get)
k1, k2, k3, k4 = st.columns(4)
with k1:
    kpi("球員數", len(recs), "已填表單")
with k2:
    kpi("隊伍平均能力", f"{team_overall(recs, R):.2f}", "滿分 5")
with k3:
    kpi("最強類別", best_cat, f"平均 {cat_avg[best_cat]:.2f} 分")
with k4:
    kpi("最多人擅長", top_pos, f"{counts[top_pos]} 人自評擅長")

st.write("")

# ---------- 篩選 ----------
pos_filter = st.pills("篩選擅長位置", R.positions, selection_mode="multi", key="home_pos_filter")
detailed = st.toggle("顯示全部 21 項能力", key="home_detailed")

numbers = jersey_numbers()
rows = []
for p in recs:
    good = split_positions(p["good_positions"])
    if pos_filter and not set(pos_filter) & set(good):
        continue
    row = {"背號": numbers.get(p["name"], "—"), "球員": p["name"], "暱稱": nickname(p), "平均": average(p, R)}
    if detailed:
        row.update({a.label: int(p[a.key]) for a in R.abilities})
    else:
        row.update(category_scores(p, R))
        row["數據推薦"] = " · ".join(recommended(p, R))
        row["自評擅長"] = " · ".join(good)
    rows.append(row)
table = pd.DataFrame(rows)
if not numbers and not table.empty:   # 背號還沒決定前不顯示這一欄
    table = table.drop(columns=["背號"])

if table.empty:
    st.info("沒有符合篩選條件的球員。")
    st.stop()

score_col = lambda label: st.column_config.ProgressColumn(label, min_value=1, max_value=5, format="%.1f")  # noqa: E731
if detailed:
    cmap = LinearSegmentedColormap.from_list("potato", [PANEL, ACCENT])
    ability_cols = [a.label for a in R.abilities]
    shown = grey_column(table.style.background_gradient(cmap=cmap, subset=ability_cols, vmin=1, vmax=5).format(
        "{:.2f}", subset=["平均"]))
    column_config = {"平均": score_col("平均")}
else:
    shown = grey_column(table)
    column_config = {"平均": score_col("平均"), **{c.name: score_col(c.name) for c in R.categories}}

event = st.dataframe(shown, hide_index=True, column_config=column_config,
                     on_select="rerun", selection_mode="single-row", key="roster")
if event.selection.rows:
    st.session_state["player_choice"] = table.iloc[event.selection.rows[0]]["球員"]
    st.switch_page(PLAYER_PAGE)

# ---------- 位置分布 ----------
st.subheader("各位置自評擅長人數")
show_plotly(hbar(counts, highlight={top_pos}, height_per_bar=26))
