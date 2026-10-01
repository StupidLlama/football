"""球場位置圖（matplotlib，深色版）。藍 = 自評擅長、紅 = 自評不擅長、黃 = 數據推薦。"""
import matplotlib

matplotlib.use("Agg")
import matplotlib.patheffects as pe
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.colors import to_rgba
from matplotlib.patches import Arc, Circle, Rectangle

from domain.models import Player, RatingRules
from domain.positions import split_positions
from domain.rating import recommended

from .style import BLUE, MUTED, RED, TEXT, YELLOW


def _setup_font():
    for path in ["/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"]:
        try:
            font_manager.fontManager.addfont(path)
        except Exception:
            pass
    installed = {f.name for f in font_manager.fontManager.ttflist}
    for name in ["Microsoft JhengHei", "PingFang TC", "Heiti TC", "Noto Sans CJK TC", "Noto Sans CJK JP",
                 "Microsoft YaHei", "SimHei"]:
        if name in installed:
            plt.rcParams["font.family"] = name
            break
    plt.rcParams["axes.unicode_minus"] = False


_setup_font()

PITCH, STRIPE, LINE = "#10291D", "#133322", "#5E7F6C"
L, W = 105, 68
# 進攻方向朝右
COORDS = {
    "GK": [(6, 34)], "CB": [(25, 25), (25, 43)], "LB/RB": [(27, 59), (27, 9)],
    "LWB/RWB": [(40, 61), (40, 7)], "CDM": [(38, 34)], "CM": [(52, 34)], "CAM": [(68, 34)],
    "LM/RM": [(58, 58), (58, 10)], "LW/RW": [(82, 57), (82, 11)], "ST": [(93, 34)],
}


def _draw_pitch(ax):
    ax.add_patch(Rectangle((0, 0), L, W, color=PITCH, zorder=0))
    for i in range(0, L, 15):
        ax.add_patch(Rectangle((i, 0), 7.5, W, color=STRIPE, zorder=0))
    lc = dict(color=LINE, lw=1.6, fill=False, zorder=1)
    ax.add_patch(Rectangle((0, 0), L, W, **lc))
    ax.plot([L / 2, L / 2], [0, W], color=LINE, lw=1.6, zorder=1)
    ax.add_patch(Circle((L / 2, W / 2), 9.15, **lc))
    for x0, d in [(0, 1), (L, -1)]:
        ax.add_patch(Rectangle((x0 if d == 1 else x0 - 16.5, W / 2 - 20.16), 16.5, 40.32, **lc))
        ax.add_patch(Rectangle((x0 if d == 1 else x0 - 5.5, W / 2 - 9.16), 5.5, 18.32, **lc))
        ax.add_patch(Arc((x0 + d * 11, W / 2), 18.3, 18.3, theta1=-53 if d == 1 else 127,
                         theta2=53 if d == 1 else 233, color=LINE, lw=1.6, zorder=1))
    ax.annotate("", xy=(L - 2, -3.5), xytext=(L - 20, -3.5),
                arrowprops=dict(arrowstyle="->", color=MUTED, lw=1.3), annotation_clip=False)
    ax.text(L - 22, -3.5, "進攻方向", color=MUTED, fontsize=10, ha="right", va="center")
    ax.set_xlim(-1, L + 1)
    ax.set_ylim(-6, W + 1)
    ax.set_aspect("equal")
    ax.axis("off")


def pitch(player: Player, rules: RatingRules, size=(10, 7.2)):
    good = set(split_positions(player["good_positions"]))
    bad = set(split_positions(player["bad_positions"]))
    rec = set(recommended(player, rules))
    fig, ax = plt.subplots(figsize=size)
    fig.patch.set_alpha(0)
    _draw_pitch(ax)
    bw, bh = 7.5, 12
    for pos, pts in COORDS.items():
        base = BLUE if pos in good else RED if pos in bad else YELLOW if pos in rec else None
        ring = pos in rec and base not in (None, YELLOW)
        for (x, y) in pts:
            name = pos if "/" not in pos else pos.split("/")[0 if y > 34 else 1]
            ax.add_patch(Rectangle((x - bw / 2, y - bh / 2), bw, bh,
                                   fc=to_rgba(base, 0.25) if base else (1, 1, 1, 0),
                                   ec=base or MUTED, lw=2.5, ls="-" if base else "--", zorder=3))
            if ring:  # 外圈黃框：自評位置同時被數據推薦
                g = 1.1
                ax.add_patch(Rectangle((x - bw / 2 - g, y - bh / 2 - g), bw + 2 * g, bh + 2 * g,
                                       fill=False, ec=YELLOW, lw=2.5, zorder=3))
            ax.text(x, y, name, ha="center", va="center", color=TEXT, fontsize=12, weight="bold", zorder=4,
                    path_effects=[pe.withStroke(linewidth=3, foreground=PITCH)])
    items = [(to_rgba(BLUE, .25), BLUE, "擅長"), (to_rgba(RED, .25), RED, "不擅長"),
             (to_rgba(YELLOW, .25), YELLOW, "數據推薦"), ((1, 1, 1, 0), YELLOW, "外圈黃框 = 也被推薦")]
    handles = [Rectangle((0, 0), 1, 1, fc=fc, ec=ec, lw=2) for fc, ec, _ in items]
    leg = ax.legend(handles, [t for *_, t in items], loc="upper center", bbox_to_anchor=(0.5, 1.09),
                    ncol=4, frameon=False, fontsize=11, handlelength=1.2, handleheight=1.6)
    for t in leg.get_texts():
        t.set_color(TEXT)
    fig.tight_layout()
    return fig


def close(fig) -> None:
    plt.close(fig)
