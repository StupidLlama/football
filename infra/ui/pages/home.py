"""首頁：下一場比賽、近期戰績、賽程、比賽結果、裁判任務、球員名單。"""
import html
from datetime import datetime, timedelta

import streamlit as st

from domain.fixture import RESULT_LABEL, Fixture
from domain.positions import split_positions
from infra import config
from infra.coach import coach_gate
from infra.schedule import get_duty_store
from infra.ui.common import (PLAYER_PAGE, explain_error, get_fixtures, get_players, jersey_numbers, nickname,
                             now_taipei, records, roles)
from infra.ui.theme import RESULT_COLORS, html_block, inject_home_css, kicker
from stats.referee import FairRandomPicker
from stats.schedule import awaiting_score, duties_for, finished, form, record, relation, upcoming

WEEK = "一二三四五六日"
UNSET = "（未排）"

inject_home_css()
S = config.schedule_settings()
TEAM = S.team
now = now_taipei()
today = now.date()
fixtures, schedule_error = get_fixtures()
players = records(get_players())
names = [p["name"] for p in players]
esc = html.escape


def day_label(f: Fixture) -> str:
    return f"{f.day:%m/%d}（{WEEK[f.day.weekday()]}）"


def round_label(f: Fixture) -> str:
    bits = [f"第 {f.round} 輪" if f.round else "", "延賽" if "延" in f.note else ""]
    return " · ".join(b for b in bits if b)


def days_until(day) -> int:
    return (day - today).days


kicker("球隊首頁")
st.title("🥔 Football Analysis Potato")
if schedule_error:
    st.info(schedule_error)

# ---------- 下一場比賽 ----------
nxt = upcoming(fixtures, TEAM, today)
if nxt:
    f = nxt[0]
    hh, mm = (int(x) for x in f.start.split(":")) if ":" in f.start else (0, 0)
    kickoff = datetime(f.day.year, f.day.month, f.day.day, hh, mm, tzinfo=now.tzinfo)
    left = max(kickoff - now, timedelta(0))
    d, h = left.days, left.seconds // 3600
    count = (f'<div><b>{d}</b><span>天</span></div><div><b>{h:02d}</b><span>小時</span></div>'
             if left.total_seconds() > 0 else '<div><b>今天</b><span>比賽日</span></div>')
    meta = [f"{day_label(f)} {f.start}–{f.end}", "主場" if f.is_home(TEAM) else "客場", round_label(f)]
    html_block(f'''<div class="ph-card ph-hero" role="region" aria-label="下一場比賽">
      <div><div class="ph-eyebrow">NEXT MATCH · 下一場</div>
        <div class="ph-opp">vs {esc(f.opponent(TEAM))}</div>
        <div class="ph-meta">{"".join(f"<span>{esc(m)}</span>" for m in meta if m)}</div></div>
      <div class="ph-count">{count}</div></div>''')

# ---------- 近期戰績 ----------
recent = form(fixtures, TEAM)
rec = record(fixtures, TEAM)
dots = "".join(f'<span class="ph-dot" style="background:{RESULT_COLORS[r]}" title="{RESULT_LABEL[r]}">{r}</span>'
               for r in recent)
dots += '<span class="ph-dot empty"></span>' * (5 - len(recent))
summary = (f"{rec.wins} 勝 {rec.draws} 和 {rec.losses} 負 · 進 {rec.goals_for} 失 {rec.goals_against} · 積分 {rec.points}"
           if rec.played else "還沒有比賽結果")
html_block(f'''<div class="ph-card ph-form" role="region" aria-label="近期戰績">
  <div class="ph-dots"><b style="margin-right:8px">近 5 場</b>{dots}</div>
  <div style="color:#B6C2D6">{summary}</div></div>''')

# ---------- 即將比賽 / 比賽結果 ----------
left_col, right_col = st.columns(2, gap="medium")
with left_col:
    rows = "".join(f'''<div class="ph-row"><div class="ph-date">{f.day:%m/%d} {f.start}</div>
        <div class="ph-main"><b>vs {esc(f.opponent(TEAM))}</b><span>週{WEEK[f.day.weekday()]}
        {(" · " + esc(round_label(f))) if round_label(f) else ""}</span></div>
        <span class="ph-pill">{"主場" if f.is_home(TEAM) else "客場"}</span></div>''' for f in nxt)
    html_block(f'''<div class="ph-card"><div class="ph-h2">即將比賽<small>{len(nxt)} 場</small></div>
        {rows or '<div class="ph-empty">目前沒有排定的比賽</div>'}</div>''')

with right_col:
    rows = ""
    for f in finished(fixtures, TEAM):
        r = f.result(TEAM)
        mine, theirs = f.goals(TEAM)
        rows += f'''<div class="ph-row"><span class="ph-chip" style="background:{RESULT_COLORS[r]}"
            title="{RESULT_LABEL[r]}">{r}</span><div class="ph-main"><b>vs {esc(f.opponent(TEAM))}</b>
            <span>{day_label(f)}</span></div><div class="ph-score">{mine} – {theirs}</div></div>'''
    for f in awaiting_score(fixtures, TEAM, today):
        rows += f'''<div class="ph-row"><span class="ph-chip" style="background:#26324A">?</span>
            <div class="ph-main"><b>vs {esc(f.opponent(TEAM))}</b><span>{day_label(f)} · 比分待更新</span></div></div>'''
    html_block(f'''<div class="ph-card"><div class="ph-h2">比賽結果<small>在賽程表填比分就會更新</small></div>
        {rows or '<div class="ph-empty">還沒有比賽結果</div>'}</div>''')

# ---------- 裁判任務 ----------
duties = [d for d in duties_for(fixtures, TEAM) if d.fixture.day >= today]
gate = coach_gate(st.secrets, st.session_state)
store = get_duty_store(st.secrets, S.duty_worksheet)
picker = FairRandomPicker()

if "duty_draft" not in st.session_state:
    try:
        st.session_state["duty_draft"] = store.load()
        st.session_state["duty_saved"] = dict(st.session_state["duty_draft"])
    except Exception as e:
        st.session_state["duty_draft"], st.session_state["duty_saved"] = {}, {}
        st.warning(f"讀取裁判負責人失敗（{store.label}）：{explain_error(e)}")
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


def tag(d) -> str:
    n = days_until(d.fixture.day)
    text = "今天" if n == 0 else "明天" if n == 1 else f"{n} 天後" if n <= 7 else ""
    return f'<span class="ph-tag">{text}</span>' if text else ""


saved = st.session_state.get("duty_saved", {})
rows = ""
for d in duties:
    f, who = d.fixture, saved.get(d.key, "")
    soon = " soon" if days_until(f.day) <= 1 else ""
    rows += f'''<div class="ph-row{soon}"><div class="ph-date">{day_label(f)}<br>{f.start}–{f.end}</div>
        <div class="ph-main"><b>{esc(f.home)} vs {esc(f.away)}</b><span>{d.role} · {esc(relation(d, TEAM))}</span></div>
        {tag(d)}<span class="ph-who{" set" if who else ""}">負責人：{esc(who) if who else "待定"}</span></div>'''
flag = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" ' \
       'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>'
html_block(f'''<div class="ph-card"><div class="ph-h2"><span style="display:flex;gap:8px;align-items:center">{flag}裁判任務</span>
    <small>我們隊要派人的場次 · 共 {len(duties)} 場</small></div>
    {rows or '<div class="ph-empty">接下來沒有裁判任務</div>'}</div>''')

if gate.enabled and duties:
    with st.expander("教練：排裁判", icon=":material/sports:", expanded=gate.is_coach()):
        if not gate.is_coach():
            with st.form("coach_login", border=False):
                pw = st.text_input("教練密碼", type="password")
                if st.form_submit_button("登入"):
                    if gate.login(pw):
                        sync_widgets()
                        st.rerun()
                    st.error("密碼錯誤")
        else:
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
                    st.toast("已儲存裁判名單")
                    st.rerun()
                except Exception as e:
                    st.error(f"儲存失敗（{store.label}）：{explain_error(e)}")
            options = [UNSET, *names]
            for i, d in enumerate(duties):
                if widget_key(i) not in st.session_state:
                    st.session_state[widget_key(i)] = draft.get(d.key) or UNSET
                c1, c2, c3 = st.columns([3, 3, 1], vertical_alignment="bottom")
                c1.markdown(f"**{day_label(d.fixture)} {d.fixture.start}**  \n{d.fixture.home} vs {d.fixture.away} · {d.role}")
                c2.selectbox("負責人", options, key=widget_key(i), on_change=on_select, args=(i,),
                             label_visibility="collapsed")
                c3.button("重抽", key=f"duty_re_{i}", icon=":material/casino:", on_click=pick_one, args=(i,),
                          use_container_width=True)
            if draft != saved:
                st.warning("有變更還沒儲存")
            if st.button("登出教練", icon=":material/logout:"):
                gate.logout()
                st.rerun()

# ---------- 球員名單 ----------
role_of = roles()
numbers = jersey_numbers()
order = {"C": 0, "VC": 1}
roster = sorted(players, key=lambda p: (order.get(role_of.get(p["name"], ""), 2),
                                        int(numbers[p["name"]]) if numbers.get(p["name"], "").isdigit() else 999))
st.markdown('<div class="ph-h2" style="margin-top:0.6rem">球員名單<small>點卡片看球員報告</small></div>',
            unsafe_allow_html=True)
PER_ROW = 4
for start in range(0, len(roster), PER_ROW):
    cols = st.columns(PER_ROW)
    for j, p in enumerate(roster[start:start + PER_ROW]):
        i = start + j
        role = role_of.get(p["name"], "")
        num = numbers.get(p["name"], "")
        pos = "".join(f"<span>{esc(x)}</span>" for x in split_positions(p.get("good_positions"))[:3])
        badge = f'<span class="badge">{esc(role)}</span>' if role else ""
        with cols[j]:
            with st.container(key=f"pcard_{i}"):
                html_block(f'''<div class="ph-pcard {role.lower()}"><span class="ghost">{esc(num) or "?"}</span>
                    <div class="top"><span class="num">#{esc(num) or "-"}</span>{badge}</div>
                    <div class="name">{esc(p["name"])}</div><div class="nick">{esc(nickname(p))}</div>
                    <div class="pos">{pos}</div></div>''')
                if st.button(f"打開 {p['name']} 的球員報告", key=f"pbtn_{i}"):
                    st.session_state["player_choice"] = p["name"]
                    st.switch_page(PLAYER_PAGE)
