"""圖表：能力雷達圖、球場位置圖。回傳 matplotlib Figure，網站、報告、影片分析都能共用。"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.patheffects as pe
import matplotlib.pyplot as plt
import numpy as np
from matplotlib import font_manager
from matplotlib.colors import to_rgba
from matplotlib.patches import Arc, Circle, Rectangle

from .analysis import bad_positions, good_positions, recommended
from .config import settings


# ---------- 中文字型：Windows / Mac / Linux 都找得到 ----------
def _setup_font():
    for path in ["/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"]:
        try:
            font_manager.fontManager.addfont(path)
        except Exception:
            pass
    installed = {f.name for f in font_manager.fontManager.ttflist}
    for name in ["Microsoft JhengHei", "PingFang TC", "Heiti TC", "Noto Sans CJK TC",
                 "Noto Sans CJK JP", "Microsoft YaHei", "SimHei"]:
        if name in installed:
            plt.rcParams["font.family"] = name
            break
    plt.rcParams["axes.unicode_minus"] = False


_setup_font()

INK, MUTED = "#1E293B", "#64748B"
BLUE, RED, YEL = "#2563EB", "#DC2626", "#FACC15"
COMPARE_COLORS = ["#3B7DDD", "#E4572E"]


# ---------- 雷達圖 ----------
def radar(players, labels=None, size=7.5):
    """players：一位或多位球員（pd.Series）。多位時疊在一起比較。"""
    if not isinstance(players, (list, tuple)):
        players = [players]
    abilities = settings().abilities
    n = len(abilities)
    ang = np.pi / 2 - np.arange(n) * 2 * np.pi / n  # 從正上方順時針
    ux, uy = np.cos(ang), np.sin(ang)

    fig, ax = plt.subplots(figsize=(size, size))
    ax.set_aspect("equal"); ax.axis("off")
    for r in range(1, 6):  # 虛線多邊形格線
        ax.plot(np.append(ux, ux[0]) * r, np.append(uy, uy[0]) * r, ls=":", color="navy", lw=1)
        ax.text(0.12, r + 0.05, str(r), fontsize=8, color="#94A3B8", va="bottom")
    for i in range(n):
        ax.plot([0, 5 * ux[i]], [0, 5 * uy[i]], ls=":", color="navy", lw=1)

    single = len(players) == 1
    for k, p in enumerate(players):
        v = np.array([p[a.key] for a in abilities], dtype=float)
        px, py = ux * v, uy * v
        c = COMPARE_COLORS[k % len(COMPARE_COLORS)]
        lab = labels[k] if labels else None
        ax.fill(np.append(px, px[0]), np.append(py, py[0]), color=c, alpha=0.33 if single else 0.2, zorder=3)
        ax.plot(np.append(px, px[0]), np.append(py, py[0]), color=c, lw=2.3, zorder=4, label=lab)
        for i, a in enumerate(abilities):
            ax.scatter(px[i], py[i], s=55, color=a.color if single else c, edgecolor="white", linewidth=1, zorder=5)

    for i, a in enumerate(abilities):
        ha = "center" if abs(ux[i]) < 0.2 else ("left" if ux[i] > 0 else "right")
        txt = f"{a.label} {int(players[0][a.key])}" if single else a.label
        ax.text(5.55 * ux[i], 5.55 * uy[i], txt, ha=ha, va="center", fontsize=11.5, color=a.color, weight="bold")
    for cat, color, items in settings().categories:  # 外圈類別弧線
        idx = [i for i, a in enumerate(abilities) if a.category == cat]
        t = np.linspace(ang[idx[0]] + np.pi / n * 0.8, ang[idx[-1]] - np.pi / n * 0.8, 40)
        ax.plot(5.2 * np.cos(t), 5.2 * np.sin(t), color=color, lw=5, solid_capstyle="round", alpha=0.85)
    ax.set_xlim(-7.8, 7.8); ax.set_ylim(-6.6, 6.6)
    if not single:
        ax.legend(loc="lower center", bbox_to_anchor=(0.5, -0.06), ncol=len(players), frameon=False, fontsize=13)
    fig.tight_layout()
    return fig


# ---------- 球場位置圖 ----------
# 球場 105 x 68，進攻方向朝右
COORDS = {
    "GK": [(6, 34)], "CB": [(25, 25), (25, 43)], "LB/RB": [(27, 59), (27, 9)],
    "LWB/RWB": [(40, 61), (40, 7)], "CDM": [(38, 34)], "CM": [(52, 34)], "CAM": [(68, 34)],
    "LM/RM": [(58, 58), (58, 10)], "LW/RW": [(82, 57), (82, 11)], "ST": [(93, 34)],
}


def _draw_pitch(ax):
    L, W = 105, 68
    ax.add_patch(Rectangle((0, 0), L, W, color="#2E7D32", zorder=0))
    for i in range(0, L, 15):
        ax.add_patch(Rectangle((i, 0), 7.5, W, color="#388E3C", zorder=0))
    lc = dict(color="white", lw=2, fill=False, zorder=1)
    ax.add_patch(Rectangle((0, 0), L, W, **lc)); ax.plot([L / 2, L / 2], [0, W], color="white", lw=2, zorder=1)
    ax.add_patch(Circle((L / 2, W / 2), 9.15, **lc))
    for x0, d in [(0, 1), (L, -1)]:
        ax.add_patch(Rectangle((x0 if d == 1 else x0 - 16.5, W / 2 - 20.16), 16.5, 40.32, **lc))
        ax.add_patch(Rectangle((x0 if d == 1 else x0 - 5.5, W / 2 - 9.16), 5.5, 18.32, **lc))
        ax.add_patch(Arc((x0 + d * 11, W / 2), 18.3, 18.3, theta1=-53 if d == 1 else 127,
                         theta2=53 if d == 1 else 233, color="white", lw=2, zorder=1))
    ax.annotate("", xy=(L - 2, -3.5), xytext=(L - 20, -3.5),
                arrowprops=dict(arrowstyle="->", color=MUTED, lw=1.5), annotation_clip=False)
    ax.text(L - 22, -3.5, "進攻方向", color=MUTED, fontsize=11, ha="right", va="center")
    ax.set_xlim(-1, L + 1); ax.set_ylim(-6, W + 1); ax.set_aspect("equal"); ax.axis("off")


def pitch(player, size=(10, 7.2)):
    good, bad, rec = set(good_positions(player)), set(bad_positions(player)), set(recommended(player))
    fig, ax = plt.subplots(figsize=size)
    _draw_pitch(ax)
    BW, BH = 7.5, 12  # 直的方框
    for pos in COORDS:
        base = BLUE if pos in good else RED if pos in bad else YEL if pos in rec else None
        fc = to_rgba(base, 0.28) if base else (1, 1, 1, 0)
        ring = pos in rec and base not in (None, YEL)
        for (x, y) in COORDS[pos]:
            name = pos if "/" not in pos else pos.split("/")[0 if y > 34 else 1]
            ax.add_patch(Rectangle((x - BW / 2, y - BH / 2), BW, BH, fc=fc, ec=base or "white", lw=3,
                                   ls="-" if base else "--", zorder=3))
            if ring:  # 外圈黃框：自評位置同時也被數據推薦
                g = 1.1
                ax.add_patch(Rectangle((x - BW / 2 - g, y - BH / 2 - g), BW + 2 * g, BH + 2 * g,
                                       fill=False, ec=YEL, lw=3, zorder=3))
            ax.text(x, y, name, ha="center", va="center", color="white", fontsize=12, weight="bold", zorder=4,
                    path_effects=[pe.withStroke(linewidth=3, foreground="#14532D")])
    # 圖例
    items = [(to_rgba(BLUE, .28), BLUE, "擅長"), (to_rgba(RED, .28), RED, "不擅長"),
             (to_rgba(YEL, .28), YEL, "數據推薦"), ((1, 1, 1, 0), YEL, "外圈黃框 = 也被數據推薦")]
    handles = [Rectangle((0, 0), 1, 1, fc=fc, ec=ec, lw=2.5) for fc, ec, _ in items]
    ax.legend(handles, [t for *_, t in items], loc="upper center", bbox_to_anchor=(0.5, 1.09),
              ncol=4, frameon=False, fontsize=11, handlelength=1.2, handleheight=1.6)
    fig.tight_layout()
    return fig
