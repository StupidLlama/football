"""教練專區：要輸入教練密碼（secrets 的 coach_password）。

目前：排裁判。之後的教練功能（筆記、戰術、上傳影片…）也加在這一頁。
"""
import streamlit as st

from infra import config
from infra.coach import coach_gate
from infra.schedule import get_duty_store
from infra.ui.common import (day_label, explain_error, get_fixtures, get_players, load_duty_assignments, now_taipei,
                             records)
from infra.ui.theme import kicker
from stats.referee import FairRandomPicker
from stats.schedule import duties_for, relation

UNSET = "（未排）"

kicker("教練專區")
st.title("教練")

gate = coach_gate(st.secrets, st.session_state)
if not gate.enabled:
    st.info("還沒開放：在 secrets 設定 `coach_password` 之後，這一頁才能使用。")
    st.stop()

if not gate.is_coach():
    with st.form("coach_login"):
        pw = st.text_input("教練密碼", type="password")
        if st.form_submit_button("登入"):
            if gate.login(pw):
                st.rerun()
            st.error("密碼錯誤")
    st.stop()

with st.sidebar:
    if st.button("登出教練", icon=":material/logout:"):
        gate.logout()
        st.rerun()

S = config.schedule_settings()
TEAM = S.team
today = now_taipei().date()
fixtures, schedule_error = get_fixtures()
if schedule_error:
    st.error(schedule_error)
names = [p["name"] for p in records(get_players())]
duties = [d for d in duties_for(fixtures, TEAM) if d.fixture.day >= today]
store = get_duty_store(st.secrets, S.duty_worksheet)
picker = FairRandomPicker()
saved = load_duty_assignments(store)
if "duty_draft" not in st.session_state:
    st.session_state["duty_draft"] = dict(saved)
draft: dict = st.session_state["duty_draft"]


def widget_key(i: int) -> str:
    return f"duty_pick_{i}"


def sync_widgets() -> None:
    for i, d in enumerate(duties):
        st.session_state[widget_key(i)] = draft.get(d.key) or UNSET


def on_select(i: int) -> None:
    who = st.session_state[widget_key(i)]
    if who == UNSET:
        draft.pop(duties[i].key, None)
    else:
        draft[duties[i].key] = who


def pick_one(i: int) -> None:
    who = picker.pick_one(duties[i], names, draft)
    if who:
        draft[duties[i].key] = who
    sync_widgets()


def pick_all(only_empty: bool) -> None:
    draft.update(picker.pick_all(duties, names, draft, only_empty=only_empty))
    sync_widgets()


def clear_all() -> None:
    for d in duties:
        draft.pop(d.key, None)
    sync_widgets()


# ---------- 排裁判 ----------
st.subheader("排裁判")
if not duties:
    st.info("接下來沒有裁判任務。")
    st.stop()

st.caption(f"規則：當過最少次的人優先，次數一樣才隨機；同一天避免重複。存檔位置：{store.label}")
b1, b2, b3, b4 = st.columns(4)
b1.button("全部隨機抽", icon=":material/casino:", on_click=pick_all, args=(False,), type="primary",
          use_container_width=True)
b2.button("只補空的", on_click=pick_all, args=(True,), use_container_width=True)
b3.button("清除", on_click=clear_all, use_container_width=True)
if b4.button("儲存", icon=":material/save:", use_container_width=True):
    try:
        store.save(draft, duties_for(fixtures, TEAM))
        st.session_state["duty_saved"] = dict(draft)
        st.toast("已儲存裁判名單，首頁會顯示負責人")
        st.rerun()
    except Exception as e:
        st.error(f"儲存失敗（{store.label}）：{explain_error(e)}")

options = [UNSET, *names]
for i, d in enumerate(duties):
    if widget_key(i) not in st.session_state:
        st.session_state[widget_key(i)] = draft.get(d.key) or UNSET
    c1, c2, c3 = st.columns([3, 3, 1], vertical_alignment="bottom")
    f = d.fixture
    c1.markdown(f"**{day_label(f)} {f.start}–{f.end}**  \n{f.home} vs {f.away} · {d.role} · {relation(d, TEAM)}")
    c2.selectbox("負責人", options, key=widget_key(i), on_change=on_select, args=(i,), label_visibility="collapsed")
    c3.button("重抽", key=f"duty_re_{i}", icon=":material/casino:", on_click=pick_one, args=(i,),
              use_container_width=True)

if draft != st.session_state.get("duty_saved", {}):
    st.warning("有變更還沒儲存")
