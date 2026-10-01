"""互動能力雷達圖（Plotly）。回傳 Plotly 的 figure dict，交給 st.plotly_chart 顯示。

角度用數字（0°、17°…）而不是文字標籤：Plotly 在文字角度軸上畫扇形（barpolar）會亂掉，
用數字角度再把刻度換成能力名稱，扇形才會剛好一格一項能力。
"""
from dataclasses import dataclass
from typing import Mapping

from domain.models import RatingRules

from .style import GRID, MUTED, TEXT, base_layout, rgba


@dataclass(frozen=True)
class Series:
    label: str
    scores: Mapping[str, float]   # 能力 key → 分數
    color: str
    dashed: bool = False          # 虛線、不填色（例如全隊平均）


@dataclass(frozen=True)
class LegendItem:
    label: str
    color: str
    kind: str     # "area" = 能力類別的底色、"line" = 球員、"dashed" = 平均之類的虛線


def legend_items(series: list[Series], rules: RatingRules) -> list[LegendItem]:
    """雷達圖的圖例內容（由網頁畫在圖的上方）。"""
    items = [LegendItem(c.name, c.color, "area") for c in rules.categories]
    return items + [LegendItem(s.label, s.color, "dashed" if s.dashed else "line") for s in series]


def radar(series: list[Series], rules: RatingRules, height: int = 540, color_points_by_category: bool = False) -> dict:
    abilities = rules.abilities
    n = len(abilities)
    step = 360 / n
    angles = [round(i * step, 4) for i in range(n)]
    labels = [a.label for a in abilities]
    index = {a.key: i for i, a in enumerate(abilities)}
    data = []

    # 背景：每項能力一格扇形，顏色依類別，一眼看出能力分組
    for cat in rules.categories:
        idx = [index[a.key] for a in cat.abilities]
        data.append({
            "type": "barpolar",
            "r": [rules.max_score] * len(idx),
            "theta": [angles[i] for i in idx],
            "width": [step] * len(idx),
            "marker": {"color": rgba(cat.color, 0.16), "line": {"color": rgba(cat.color, 0.0), "width": 0}},
            "name": cat.name,
                        "hoverinfo": "skip",
        })

    for s in series:
        r = [float(s.scores[a.key]) for a in abilities]
        trace = {
            "type": "scatterpolar",
            "r": r + r[:1],
            "theta": angles + angles[:1],
            "text": labels + labels[:1],
            "name": s.label,
                        "mode": "lines" if s.dashed else "lines+markers",
            "line": {"color": s.color, "width": 2 if s.dashed else 2.5, "dash": "dash" if s.dashed else "solid"},
            "marker": {"size": 7, "color": s.color},
            "hovertemplate": "%{text}：%{r}<extra>" + s.label + "</extra>",
        }
        if not s.dashed:
            trace["fill"] = "toself"
            trace["fillcolor"] = rgba(s.color, 0.22)
            if color_points_by_category:
                colors = [rules.category_color(a.category) for a in abilities]
                trace["marker"] = {"size": 8, "color": colors + colors[:1], "line": {"color": s.color, "width": 1}}
        data.append(trace)

    layout = base_layout(height)
    layout["margin"] = {"l": 80, "r": 80, "t": 40, "b": 30}   # 左右留白給能力名稱，長的（弱腳能力）才不會被切掉
    layout.update({
        # 不用 Plotly 的圖例：畫面窄時它會換成好幾排、蓋到圖上。圖例改由網頁畫在圖的上方（legend_items）
        "showlegend": False,
        "polar": {
            "bgcolor": "rgba(0,0,0,0)",
            "radialaxis": {"range": [0, rules.max_score], "tickvals": list(range(1, rules.max_score + 1)),
                           "gridcolor": GRID, "linecolor": GRID, "tickfont": {"color": MUTED, "size": 10},
                           "angle": 90, "showline": False},
            "angularaxis": {"tickmode": "array", "tickvals": angles, "ticktext": labels,
                            "gridcolor": GRID, "linecolor": GRID, "tickfont": {"color": TEXT, "size": 12},
                            "rotation": 90, "direction": "clockwise"},
        },
    })
    return {"data": data, "layout": layout}
