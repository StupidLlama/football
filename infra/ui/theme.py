"""額外的樣式（Streamlit 主題以外的細節）：字型、數字對齊、卡片外框。"""
import html

import streamlit as st

from infra.charts.style import GRID, MUTED, PANEL

UP, DOWN = "#34D399", "#F87171"

_CSS = f"""
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=JetBrains+Mono:wght@500;700&display=swap');
/* 只換文字的字型；不要動到 Streamlit 的圖示字型（Material Symbols），不然圖示會變成英文字 */
html, body, p, li, label, h1, h2, h3, h4, input, textarea, [data-testid="stMarkdownContainer"] {{
  font-family: 'Noto Sans TC', 'Microsoft JhengHei', sans-serif;
}}
.block-container {{ padding-top: 3.6rem; padding-bottom: 3rem; max-width: 1400px; }}
h1, h2, h3 {{ letter-spacing: 0.01em; }}
/* 數字用等寬字型，上下對齊比較 */
[data-testid="stMetricValue"] {{ font-family: 'JetBrains Mono', monospace; font-weight: 700; }}
[data-testid="stMetricLabel"] p {{ color: {MUTED}; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; }}
[data-testid="stMetric"] {{ background: {PANEL}; border: 1px solid {GRID}; border-radius: 10px; padding: 14px 16px; }}
[data-testid="stSidebar"] {{ border-right: 1px solid {GRID}; }}
.potato-kicker {{ color: {MUTED}; font-size: 0.8rem; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: -0.6rem; }}
.potato-note {{ color: {MUTED}; font-size: 0.9rem; }}
.potato-kpi {{ background: {PANEL}; border: 1px solid {GRID}; border-radius: 10px; padding: 14px 16px;
               height: 100%; margin-bottom: 0.5rem; }}
.potato-kpi .label {{ color: {MUTED}; font-size: 0.78rem; letter-spacing: 0.06em; }}
.potato-kpi .value {{ font-family: 'JetBrains Mono', 'Noto Sans TC', monospace; font-size: 1.9rem; font-weight: 700;
                      line-height: 1.25; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
.potato-kpi .sub {{ color: {MUTED}; font-size: 0.85rem; margin-top: 2px; }}
.potato-kpi .up {{ color: {UP}; }}
.potato-kpi .down {{ color: {DOWN}; }}
.potato-legend {{ display:flex; flex-wrap:wrap; gap: 6px 16px; align-items:center; justify-content:center;
                  color: {MUTED}; font-size: 0.85rem; margin: -0.6rem 0 0.8rem; }}
.potato-legend span {{ display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }}
.potato-legend i {{ display:inline-block; }}
.potato-head {{ display:flex; flex-wrap: wrap; align-items:flex-start; gap: 6px 18px; margin: 1.1rem 0 0.6rem; }}
.potato-head h1 {{ margin: 0; padding: 0; font-size: 2.75rem; line-height: 1.15; font-weight: 700; white-space: nowrap; }}
.potato-head .info {{ margin-top: 0.35rem; line-height: 1.5; }}
.potato-number {{ color: {MUTED}; font-weight: 700; margin-right: 0.15em; }}
.potato-head img {{ flex: none; margin-top: 4px; }}
.potato-nick {{ color: {MUTED}; font-size: 0.95rem; font-weight: 400; }}
.potato-steps {{ background: {PANEL}; border: 1px solid {GRID}; border-radius: 10px; padding: 12px 16px;
                 margin: 0.4rem 0 1rem; }}
.potato-steps ol {{ margin: 0.2rem 0 0 1.2rem; padding: 0; }}
.potato-steps li {{ margin: 0.15rem 0; }}
.potato-chip {{ display:inline-block; padding: 2px 10px; margin: 2px 4px 2px 0; border-radius: 999px;
               border: 1px solid {GRID}; background: {PANEL}; font-size: 0.85rem; }}
</style>
"""


def inject_css() -> None:
    st.markdown(_CSS, unsafe_allow_html=True)


def kpi(label: str, value, sub: str = "", delta: float | None = None, delta_suffix: str = "") -> None:
    """數據卡。sub = 灰色補充說明（不帶箭頭，可以含簡單 HTML）；delta = 有正負意義的差值（綠 / 紅）。"""
    extra = ""
    if delta is not None:
        cls = "up" if delta > 0 else "down" if delta < 0 else ""
        extra = f'<span class="{cls}">{delta:+.2f}</span>{" " + delta_suffix if delta_suffix else ""}'
    if sub:
        extra = f"{extra} · {sub}" if extra else sub
    st.markdown(f'<div class="potato-kpi"><div class="label">{html.escape(label)}</div>'
                f'<div class="value">{html.escape(str(value))}</div><div class="sub">{extra or "&nbsp;"}</div></div>',
                unsafe_allow_html=True)


def kicker(text: str) -> None:
    """標題上方的小字分類標籤。"""
    st.markdown(f'<div class="potato-kicker">{text}</div>', unsafe_allow_html=True)


def chips(items: list[str]) -> str:
    return "".join(f'<span class="potato-chip">{i}</span>' for i in items) or '<span class="potato-note">—</span>'


def legend(items) -> None:
    """圖表上方的圖例列（items = infra.charts.radar.legend_items 的結果）。畫面窄時會自動換行，不會蓋到圖。"""
    from infra.charts.style import rgba
    parts = []
    for it in items:
        if it.kind == "area":
            mark = f'<i style="width:12px;height:12px;border-radius:3px;background:{rgba(it.color, 0.35)};' \
                   f'border:1px solid {rgba(it.color, 0.8)}"></i>'
        else:
            style = "dashed" if it.kind == "dashed" else "solid"
            mark = f'<i style="width:18px;height:0;border-top:3px {style} {it.color}"></i>'
        parts.append(f"<span>{mark}{html.escape(it.label)}</span>")
    st.markdown(f'<div class="potato-legend">{"".join(parts)}</div>', unsafe_allow_html=True)


def nick_html(nick: str) -> str:
    """暱稱的灰色小字（HTML）。"""
    return f'<span class="potato-nick">{html.escape(nick)}</span>' if nick else ""


def steps(title: str, items: list[str]) -> None:
    """操作步驟說明框。"""
    lis = "".join(f"<li>{i}</li>" for i in items)
    st.markdown(f'<div class="potato-steps"><b>{html.escape(title)}</b><ol>{lis}</ol></div>', unsafe_allow_html=True)


# ---------- 首頁（v1.4）----------
WIN_C, DRAW_C, LOSS_C = "#16A34A", "#64748B", "#DC2626"   # 綠 / 灰 / 紅（圓點裡也寫字，色弱也看得懂）
RESULT_COLORS = {"W": WIN_C, "D": DRAW_C, "L": LOSS_C}

_HOME_CSS = f"""
<style>
.ph-card {{ background:{PANEL}; border:1px solid {GRID}; border-radius:16px; padding:22px 24px; margin-bottom:1rem; }}
.ph-hero {{ display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:18px; }}
.ph-eyebrow {{ font-size:0.78rem; letter-spacing:0.14em; color:#2DD4BF; font-weight:700; }}
.ph-opp {{ font-size:1.9rem; font-weight:800; margin:4px 0 6px; line-height:1.2; }}
.ph-meta {{ display:flex; flex-wrap:wrap; gap:4px 18px; color:#B6C2D6; font-size:0.95rem; }}
.ph-count {{ display:flex; gap:10px; }}
.ph-count div {{ background:#0B1220; border-radius:12px; padding:10px 16px; text-align:center; min-width:64px; }}
.ph-count b {{ display:block; font-family:'JetBrains Mono',monospace; font-size:1.9rem; color:#2DD4BF; line-height:1.2; }}
.ph-count span {{ font-size:0.75rem; color:{MUTED}; }}
.ph-form {{ display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px 20px; }}
.ph-dots {{ display:flex; gap:8px; align-items:center; }}
.ph-dot {{ display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:50%;
           font-weight:800; font-size:0.85rem; color:#fff; }}
.ph-dot.empty {{ background:transparent; border:2px dashed {GRID}; }}
.ph-h2 {{ font-size:1.15rem; font-weight:700; margin:0 0 8px; display:flex; align-items:center; gap:8px;
          justify-content:space-between; flex-wrap:wrap; }}
.ph-h2 small {{ font-size:0.8rem; color:{MUTED}; font-weight:400; }}
.ph-row {{ display:flex; align-items:center; gap:14px; padding:11px 0; border-top:1px solid #1E2A40; flex-wrap:wrap; }}
.ph-row.soon {{ background:rgba(245,158,11,.08); margin:0 -12px; padding:11px 12px; border-radius:8px; }}
.ph-date {{ font-family:'JetBrains Mono',monospace; font-size:0.9rem; color:#B6C2D6; width:118px; flex:none; }}
.ph-main {{ flex:1; min-width:150px; }}
.ph-main b {{ display:block; }}
.ph-main span {{ font-size:0.82rem; color:{MUTED}; }}
.ph-pill {{ font-size:0.75rem; padding:3px 10px; border-radius:999px; background:#16213A; color:#B6C2D6; white-space:nowrap; }}
.ph-tag {{ font-size:0.75rem; font-weight:800; padding:3px 9px; border-radius:999px; background:#F59E0B; color:#1A1206; }}
.ph-chip {{ display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:8px;
            font-weight:800; font-size:0.8rem; color:#fff; flex:none; }}
.ph-score {{ font-family:'JetBrains Mono',monospace; font-size:1.2rem; font-weight:700; }}
.ph-who {{ font-size:0.82rem; padding:5px 11px; border-radius:8px; border:1px dashed #3A4A66; color:{MUTED}; }}
.ph-who.set {{ border:1px solid #F59E0B; color:#FCD34D; font-weight:700; background:#1F2A1A; }}
.ph-empty {{ color:{MUTED}; font-size:0.9rem; padding:10px 0; }}
/* 球員卡：整張卡都可以點（上面蓋一顆透明按鈕）*/
.ph-pcard {{ position:relative; overflow:hidden; min-height:150px; padding:14px 16px; border-radius:14px; background:#0E1626;
             border:1px solid #1E2A40; border-top-width:4px; transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease; }}
.ph-pcard.c {{ border-color:#F59E0B; }}
.ph-pcard.vc {{ border-color:#2DD4BF; }}
.ph-pcard .ghost {{ position:absolute; right:-4px; bottom:-20px; font-family:'JetBrains Mono',monospace; font-size:104px;
                    font-weight:700; line-height:1; color:transparent; -webkit-text-stroke:1.5px rgba(139,154,180,.16); }}
.ph-pcard.c .ghost {{ -webkit-text-stroke-color:rgba(245,158,11,.3); }}
.ph-pcard.vc .ghost {{ -webkit-text-stroke-color:rgba(45,212,191,.25); }}
.ph-pcard .top {{ display:flex; justify-content:space-between; align-items:center; position:relative; }}
.ph-pcard .num {{ font-family:'JetBrains Mono',monospace; font-size:0.8rem; font-weight:700; color:{MUTED}; }}
.ph-pcard .badge {{ font-size:0.72rem; font-weight:800; padding:2px 9px; border-radius:999px; background:#2DD4BF; color:#062420; }}
.ph-pcard.c .badge {{ background:#F59E0B; color:#1A1206; }}
.ph-pcard .name {{ position:relative; margin-top:22px; font-size:1.3rem; font-weight:800; letter-spacing:0.02em;
                   white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }}
.ph-pcard .nick {{ position:relative; font-size:0.8rem; color:{MUTED}; min-height:1.2em; }}
.ph-pcard .pos {{ position:relative; display:flex; flex-wrap:wrap; gap:5px; margin-top:10px; }}
.ph-pcard .pos span {{ font-size:0.7rem; font-weight:700; letter-spacing:0.05em; padding:2px 7px; border-radius:6px;
                        background:#0B1220; color:#2DD4BF; border:1px solid {GRID}; }}
[class*="st-key-pcard_"] {{ position:relative; }}
[class*="st-key-pcard_"] [data-testid="stMarkdownContainer"] {{ margin-bottom:0 !important; }}
@media (max-width: 640px) {{ .ph-date {{ width:auto; }} .ph-opp {{ font-size:1.5rem; }} }}
[class*="st-key-pcard_"]:hover .ph-pcard {{ transform:translateY(-4px); border-color:#2DD4BF; box-shadow:0 10px 24px rgba(0,0,0,.35); }}
[class*="st-key-pbtn_"] {{ position:absolute !important; inset:0; z-index:2; margin:0 !important; }}
/* 按鈕外面還包了好幾層 div，每一層都要撐滿，整張卡才點得到 */
[class*="st-key-pbtn_"] *:has(button), [class*="st-key-pbtn_"] button {{ width:100% !important; height:100% !important; }}
[class*="st-key-pbtn_"] button {{ opacity:0; cursor:pointer; }}
</style>
"""


def inject_home_css() -> None:
    st.markdown(_HOME_CSS, unsafe_allow_html=True)


def html_block(content: str) -> None:
    st.markdown(content, unsafe_allow_html=True)
