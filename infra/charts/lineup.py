"""組隊結果的球場圖：跟球員報告的「位置」圖同一套樣式（方框、藍 = 自評擅長、紅 = 自評不擅長、黃 = 數據推算）。"""
import io

import matplotlib

matplotlib.use("Agg")
import matplotlib.patheffects as pe
import matplotlib.pyplot as plt
from matplotlib.colors import to_rgba
from matplotlib.patches import Rectangle

from stats.lineup import Lineup

from .pitch import PITCH, _draw_pitch
from .style import BG, BLUE, MUTED, RED, TEXT, YELLOW

BOX_W, BOX_H = 8, 8.5
NICK_MAX = 8   # 暱稱太長會蓋到隔壁，超過就截斷


def _short(text: str) -> str:
    return text if len(text) <= NICK_MAX else text[:NICK_MAX - 1] + "…"


def _color(option) -> str:
    return BLUE if option.good else RED if option.bad else YELLOW


def lineup_pitch(lineup: Lineup, nicknames: dict[str, str] | None = None, numbers: dict[str, str] | None = None,
                 title: str | None = None, size=(13, 9)):
    """nicknames / numbers = {名字: 暱稱 / 背號}；title = 下載圖片時放在最上面的標題。"""
    nicknames, numbers = nicknames or {}, numbers or {}
    fig, ax = plt.subplots(figsize=size)
    fig.patch.set_alpha(0)
    _draw_pitch(ax)
    stroke = [pe.withStroke(linewidth=3, foreground=PITCH)]
    by_slot = {o.slot: o for o in lineup.starters}
    for s in lineup.formation.slots:
        o = by_slot.get(s.code)
        x0, y0 = s.x - BOX_W / 2, s.y - BOX_H / 2
        if o is None:
            ax.add_patch(Rectangle((x0, y0), BOX_W, BOX_H, fill=False, ec=MUTED, lw=2, ls="--", zorder=3))
            ax.text(s.x, s.y, s.code, ha="center", va="center", color=MUTED, fontsize=12, weight="bold", zorder=4)
            ax.text(s.x, y0 - 1.2, "缺人", ha="center", va="top", color=MUTED, fontsize=13, zorder=4,
                    path_effects=stroke)
            continue
        c = _color(o)
        ax.add_patch(Rectangle((x0, y0), BOX_W, BOX_H, fc=to_rgba(c, 0.25), ec=c, lw=2.5, zorder=3))
        ax.text(s.x, s.y, s.code, ha="center", va="center", color=TEXT, fontsize=12, weight="bold", zorder=4,
                path_effects=stroke)
        num = numbers.get(o.name, "")
        ax.text(s.x, y0 - 1.0, f"{num} {o.name}" if num else o.name, ha="center", va="top", color=TEXT,
                fontsize=14.5, weight="bold", zorder=4, path_effects=stroke)
        nick = nicknames.get(o.name, "")
        if nick:
            ax.text(s.x, y0 - 4.8, _short(nick), ha="center", va="top", color=MUTED, fontsize=12, zorder=4,
                    path_effects=stroke)
    items = [(BLUE, "自評擅長"), (YELLOW, "數據推算"), (RED, "自評不擅長")]
    handles = [Rectangle((0, 0), 1, 1, fc=to_rgba(c, .25), ec=c, lw=2) for c, _ in items]
    leg = ax.legend(handles, [t for _, t in items], loc="upper center", bbox_to_anchor=(0.5, 1.09),
                    ncol=3, frameon=False, fontsize=13, handlelength=1.2, handleheight=1.6)
    for t in leg.get_texts():
        t.set_color(TEXT)
    if title:
        fig.suptitle(title, color=TEXT, fontsize=18, weight="bold", y=0.995)
    fig.tight_layout()
    return fig


def lineup_png(lineup: Lineup, nicknames=None, numbers=None, title: str | None = None) -> bytes:
    """下載用的 PNG（深色背景，可以直接傳到 LINE）。"""
    fig = lineup_pitch(lineup, nicknames, numbers, title)
    fig.patch.set_facecolor(BG)
    fig.patch.set_alpha(1)
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=160, facecolor=BG, bbox_inches="tight", pad_inches=0.3)
    plt.close(fig)
    return buf.getvalue()
