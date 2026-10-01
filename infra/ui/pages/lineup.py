"""組隊：選賽制和陣型，自動把出賽的人排到最適合的位置，其他人全部列為替補。"""
import pandas as pd
import streamlit as st

from infra import config
from infra.charts import pitch as pitch_chart
from infra.charts.lineup import lineup_pitch
from infra.ui.common import get_players, name_to_display, records, rules
from infra.ui.theme import kicker, kpi
from stats.lineup import BAD_PENALTY, GOOD_BONUS, auto_lineup, candidates

R = rules()
recs = records(get_players())
shown = name_to_display(recs)
AUTO = "自動"

kicker("組隊")
st.title("自動排陣容")
st.markdown(f'<span class="potato-note">分數 = 位置適合度（0–100）＋ 自評擅長 {GOOD_BONUS} − 自評不擅長 {BAD_PENALTY}；'
            f'排出「全隊總分最高」的陣容，不是每個位置各挑最強的人</span>', unsafe_allow_html=True)

# ---------- 設定 ----------
SIZES = {"11 人制": 11, "8 人制": 8}
c1, c2 = st.columns([1, 1], vertical_alignment="bottom")
with c1:
    size_label = st.segmented_control("賽制", list(SIZES), default="11 人制", key="lineup_size") or "11 人制"
forms = [f for f in config.formations() if f.size == SIZES[size_label]]
with c2:
    fkey = f"lineup_formation_{SIZES[size_label]}"
    if st.session_state.get(fkey) not in [f.name for f in forms]:
        st.session_state[fkey] = forms[0].name
    fname = st.selectbox("陣型", [f.name for f in forms], key=fkey)
formation = next(f for f in forms if f.name == fname)

all_names = [p["name"] for p in recs]
present = st.multiselect("出賽球員（預設全隊，把請假的人刪掉）", all_names, default=all_names,
                         format_func=lambda n: shown[n], key="lineup_present")
players = [p for p in recs if p["name"] in present]

locked = {}
with st.expander("鎖定位置（選填）：先固定某些人，再排其他人"):
    cols = st.columns(4)
    for i, s in enumerate(formation.slots):
        key = f"lock_{formation.name}_{s.code}"
        options = [AUTO] + present
        if st.session_state.get(key) not in options:
            st.session_state[key] = AUTO
        pick = cols[i % 4].selectbox(s.code, options, key=key,
                                     format_func=lambda n: n if n == AUTO else shown[n])
        if pick != AUTO:
            locked[s.code] = pick

dupes = sorted({n for n in locked.values() if list(locked.values()).count(n) > 1})
if dupes:
    st.error(f"同一個人不能鎖在兩個位置：{'、'.join(shown[n] for n in dupes)}")
    st.stop()
if not players:
    st.info("先選出賽球員。")
    st.stop()

lineup = auto_lineup(players, formation, R, locked)
if lineup.empty:
    st.warning(f"出賽 {len(players)} 人，{formation.label} 需要 {formation.size} 人；"
               f"還缺：{'、'.join(s.code for s in lineup.empty)}")

# ---------- 結果 ----------
k1, k2, k3 = st.columns(3)
with k1:
    kpi("陣型", formation.name, formation.label)
with k2:
    kpi("先發平均分數", f"{lineup.total / max(len(lineup.starters), 1):.1f}", f"總分 {lineup.total:.0f}")
with k3:
    good = sum(o.good for o in lineup.starters)
    kpi("排在自評擅長位置", f"{good} / {len(lineup.starters)}", f"替補 {len(lineup.bench)} 人")

left, right = st.columns([3, 2], gap="large")
with left:
    fig = lineup_pitch(lineup)
    st.pyplot(fig)
    pitch_chart.close(fig)
with right:
    st.markdown("**先發**")
    st.dataframe(pd.DataFrame([{"位置": o.slot, "球員": shown[o.name], "適合度": o.fit,
                                "說明": ("🔒 " if o.slot in locked else "") + o.reason}
                               for o in lineup.starters]), hide_index=True,
                 column_config={"適合度": st.column_config.ProgressColumn("適合度", min_value=0, max_value=100,
                                                                         format="%.0f")})

st.subheader(f"替補（{len(lineup.bench)} 人）")
if lineup.bench:
    st.dataframe(pd.DataFrame([{"球員": shown[o.name], "最適合替補": o.slot, "適合度": o.fit, "說明": o.reason}
                               for o in lineup.bench]), hide_index=True,
                 column_config={"適合度": st.column_config.ProgressColumn("適合度", min_value=0, max_value=100,
                                                                         format="%.0f")})
else:
    st.markdown('<span class="potato-note">所有出賽球員都在先發裡。</span>', unsafe_allow_html=True)

st.subheader("每個位置的所有人選")
slot_code = st.selectbox("位置", [s.code for s in formation.slots], key=f"lineup_detail_{formation.name}")
starting = {o.name: o.slot for o in lineup.starters}
st.dataframe(pd.DataFrame([{"球員": shown[o.name], "分數": o.score, "適合度": o.fit, "說明": o.reason,
                            "目前": f"先發 {starting[o.name]}" if o.name in starting else "替補"}
                           for o in candidates(players, formation.slot(slot_code), R)]), hide_index=True,
             column_config={"適合度": st.column_config.ProgressColumn("適合度", min_value=0, max_value=100,
                                                                     format="%.0f")})
