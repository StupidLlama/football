"""組隊結果的球場圖：每個位置一個圓點，上面是位置、下面是球員名字。"""
import matplotlib

matplotlib.use("Agg")
import matplotlib.patheffects as pe
import matplotlib.pyplot as plt
from matplotlib.patches import Circle

from stats.lineup import Lineup

from .pitch import PITCH, _draw_pitch
from .style import ACCENT, BLUE, MUTED, RED, TEXT


def lineup_pitch(lineup: Lineup, names: dict[str, str] | None = None, size=(10, 7.2)):
    """names = {名字: 要顯示的字}（例如暱稱）；沒給就顯示名字。"""
    names = names or {}
    fig, ax = plt.subplots(figsize=size)
    fig.patch.set_alpha(0)
    _draw_pitch(ax)
    stroke = [pe.withStroke(linewidth=3, foreground=PITCH)]
    by_slot = {o.slot: o for o in lineup.starters}
    for s in lineup.formation.slots:
        o = by_slot.get(s.code)
        if o is None:
            ax.add_patch(Circle((s.x, s.y), 3.2, fill=False, ec=MUTED, lw=2, ls="--", zorder=3))
            label, color = "缺人", MUTED
        else:
            edge = BLUE if o.good else RED if o.bad else ACCENT
            ax.add_patch(Circle((s.x, s.y), 3.2, fc=edge, ec=TEXT, lw=1.2, alpha=0.9, zorder=3))
            label, color = names.get(o.name, o.name), TEXT
        ax.text(s.x, s.y, s.code, ha="center", va="center", color=PITCH if o else MUTED, fontsize=8.5,
                weight="bold", zorder=4)
        ax.text(s.x, s.y - 5.2, label, ha="center", va="top", color=color, fontsize=11.5, weight="bold",
                zorder=4, path_effects=stroke)
    handles = [Circle((0, 0), 1, fc=c, ec=TEXT) for c in (BLUE, ACCENT, RED)]
    leg = ax.legend(handles, ["自評擅長", "數據推算", "自評不擅長"], loc="upper center",
                    bbox_to_anchor=(0.5, 1.07), ncol=3, frameon=False, fontsize=11)
    for t in leg.get_texts():
        t.set_color(TEXT)
    fig.tight_layout()
    return fig
