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
.block-container {{ padding-top: 2.2rem; padding-bottom: 3rem; max-width: 1400px; }}
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
.potato-chip {{ display:inline-block; padding: 2px 10px; margin: 2px 4px 2px 0; border-radius: 999px;
               border: 1px solid {GRID}; background: {PANEL}; font-size: 0.85rem; }}
</style>
"""


def inject_css() -> None:
    st.markdown(_CSS, unsafe_allow_html=True)


def kpi(label: str, value, sub: str = "", delta: float | None = None, delta_suffix: str = "") -> None:
    """數據卡。sub = 灰色補充說明（不帶箭頭）；delta = 有正負意義的差值（綠 / 紅）。"""
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
