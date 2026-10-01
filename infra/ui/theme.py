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
.potato-head {{ display:flex; align-items:flex-start; gap: 18px; margin: 0.1rem 0 0.6rem; }}
.potato-head h1 {{ margin: 0; padding: 0; font-size: 2.75rem; line-height: 1.15; font-weight: 700; }}
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
