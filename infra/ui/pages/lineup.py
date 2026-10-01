"""組隊：選賽制和陣型，系統先自動排好；每個位置都能用下拉選單換人，其他人全部列為替補。"""
from datetime import datetime, timedelta, timezone

import pandas as pd
import streamlit as st

from infra import config
from infra.charts import pitch as pitch_chart
from infra.charts.lineup import lineup_pitch, lineup_png
from infra.ui.common import get_players, grey_column, jersey_numbers, nicknames, records, rules
from infra.ui.theme import kicker, kpi, steps
from stats.lineup import (BAD_PENALTY, GOOD_BONUS, assign, auto_lineup, candidates, manual_lineup, option,
                          picks_of)

R = rules()
recs = records(get_players())
nicks = nicknames(recs)
numbers = jersey_numbers()
EMPTY = "（空）"
TAIPEI = timezone(timedelta(hours=8))
fit_col = st.column_config.ProgressColumn("適合度", min_value=0, max_value=100, format="%.0f",
                                          help="這個位置需要的能力，用自評分數算出來的適合程度（滿分 100）")

kicker("組隊")
st.title("自動排陣容")
steps("怎麼用", [
    "選<b>賽制</b>（11 人制或 8 人制）和<b>陣型</b>。",
    "在<b>出賽球員</b>把這次沒來的人刪掉（按名字旁邊的 ×）。",
    "系統會自動排好陣容。想換人，就在球場下面<b>那個位置的選單</b>選別人；"
    "選到已經在場上的人，兩個人會自動交換位置。",
    "按<b>下載陣容圖</b>，就可以傳到群組。",
])

# ---------- ① 賽制、陣型 ----------
SIZES = {"11 人制": 11, "8 人制": 8}
c1, c2 = st.columns([1, 1], vertical_alignment="bottom")
with c1:
    size_label = st.segmented_control("① 賽制", list(SIZES), default="11 人制", key="lineup_size") or "11 人制"
forms = [f for f in config.formations() if f.size == SIZES[size_label]]
with c2:
    fkey = f"lineup_formation_{SIZES[size_label]}"
    if st.session_state.get(fkey) not in [f.name for f in forms]:
        st.session_state[fkey] = forms[0].name
    fname = st.selectbox("陣型", [f.name for f in forms], key=fkey)
formation = next(f for f in forms if f.name == fname)

# ---------- ② 出賽球員 ----------
all_names = [p["name"] for p in recs]
present = st.multiselect("② 出賽球員（預設全隊，把沒來的人刪掉）", all_names, default=all_names, key="lineup_present")
players = [p for p in recs if p["name"] in present]
if not players:
    st.info("先在「出賽球員」選人。")
    st.stop()


# ---------- 陣容狀態：換陣型、改出賽名單、按「回到自動排」時重新自動排 ----------
def pick_key(code: str) -> str:
    return f"lineup_pick_{code}"


def load_picks(picks: dict) -> None:
    st.session_state["lineup_picks"] = picks
    for code, name in picks.items():
        st.session_state[pick_key(code)] = name or EMPTY


def on_pick(code: str) -> None:
    """選單改了：把選到的人放到這個位置；他原本在別的位置就互換。"""
    value = st.session_state[pick_key(code)]
    picks, swapped = assign(st.session_state["lineup_picks"], code, None if value == EMPTY else value)
    load_picks(picks)
    if swapped:
        st.session_state["lineup_notice"] = f"{value} 原本在 {swapped}，已經和 {code} 交換位置"


def reset() -> None:
    st.session_state["lineup_signature"] = None


signature = (formation.label, tuple(sorted(present)))
if st.session_state.get("lineup_signature") != signature:
    load_picks(picks_of(auto_lineup(players, formation, R)))
    st.session_state["lineup_signature"] = signature
lineup = manual_lineup(players, formation, R, st.session_state["lineup_picks"])

notice = st.session_state.pop("lineup_notice", None)
if notice:
    st.toast(notice, icon=":material/swap_horiz:")
if lineup.empty:
    missing = "、".join(s.code for s in lineup.empty)
    st.warning(f"還有位置沒人：{missing}" + (f"（出賽 {len(players)} 人，{formation.label} 需要 {formation.size} 人）"
                                         if len(players) < formation.size else ""))

# ---------- 球場（整頁寬） ----------
st.subheader("陣容")
k1, k2, k3 = st.columns(3)
with k1:
    kpi("陣型", formation.name, formation.label)
with k2:
    kpi("先發平均適合度", f"{sum(o.fit for o in lineup.starters) / max(len(lineup.starters), 1):.0f}", "滿分 100")
with k3:
    good = sum(o.good for o in lineup.starters)
    kpi("排在自評擅長的位置", f"{good} / {len(lineup.starters)}", f"替補 {len(lineup.bench)} 人")

fig = lineup_pitch(lineup, nicks, numbers)
st.pyplot(fig)
pitch_chart.close(fig)
today = datetime.now(TAIPEI).strftime("%Y-%m-%d")
d1, d2 = st.columns([1, 1])
with d1:
    st.download_button("下載陣容圖", lineup_png(lineup, nicks, numbers, f"{formation.label} · {today}"),
                       file_name=f"lineup_{formation.name}_{today}.png", mime="image/png",
                       icon=":material/download:")
with d2:
    st.button("回到自動排的陣容", on_click=reset, icon=":material/restart_alt:")

# ---------- ③ 換人：每個位置一個選單 ----------
st.subheader("③ 換人")
st.markdown(f'<span class="potato-note">選單裡的人照「適合這個位置的程度」排，數字是適合度（滿分 100）；'
            f'自評擅長的人排序時加 {GOOD_BONUS}、自評不擅長的扣 {BAD_PENALTY}</span>', unsafe_allow_html=True)
cols = st.columns(4)
for i, slot in enumerate(formation.slots):
    ranked = [o.name for o in candidates(players, slot, R)]
    fits = {n: option(next(p for p in players if p["name"] == n), slot, R).fit for n in ranked}
    with cols[i % 4]:
        st.selectbox(slot.code, [EMPTY] + ranked, key=pick_key(slot.code), on_change=on_pick, args=(slot.code,),
                     format_func=lambda n, f=fits: n if n == EMPTY else f"{n} · {f[n]:.0f}")

# ---------- 表格 ----------
st.subheader("先發")
st.dataframe(grey_column(pd.DataFrame([{"位置": o.slot, "球員": o.name, "暱稱": nicks[o.name], "適合度": o.fit,
                                        "說明": o.reason} for o in lineup.starters])),
             hide_index=True, column_config={"適合度": fit_col})

st.subheader(f"替補（{len(lineup.bench)} 人）")
st.markdown('<span class="potato-note">沒在場上的人全部列在這裡，「最適合替補」是他最適合換上去的位置</span>',
            unsafe_allow_html=True)
if lineup.bench:
    st.dataframe(grey_column(pd.DataFrame([{"球員": o.name, "暱稱": nicks[o.name], "最適合替補": o.slot,
                                            "適合度": o.fit, "說明": o.reason} for o in lineup.bench])),
                 hide_index=True, column_config={"適合度": fit_col})
else:
    st.markdown('<span class="potato-note">所有出賽球員都在場上。</span>', unsafe_allow_html=True)
