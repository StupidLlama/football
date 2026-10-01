"""橫條圖（Plotly figure dict）：位置適合度、各位置人數。"""
from .style import ACCENT, GRID, MUTED, NEUTRAL_BAR, TEXT, base_layout


def hbar(values: dict[str, float], highlight: set[str] = frozenset(), x_max: float | None = None,
         value_format: str = "{:.0f}", height_per_bar: int = 30) -> dict:
    """由高到低排好的橫條圖；highlight 裡的項目用強調色。"""
    items = sorted(values.items(), key=lambda kv: kv[1])  # Plotly 由下往上畫，所以小的先
    names = [k for k, _ in items]
    vals = [v for _, v in items]
    layout = base_layout(max(160, height_per_bar * len(items) + 40))
    layout.update({
        "showlegend": False,
        "bargap": 0.35,
        "margin": {"l": 70, "r": 40, "t": 10, "b": 10},
        "xaxis": {"range": [0, x_max or (max(vals) * 1.15 if vals else 1)], "showgrid": True,
                  "gridcolor": GRID, "zeroline": False, "tickfont": {"color": MUTED}},
        "yaxis": {"tickfont": {"color": TEXT, "size": 13}},
    })
    return {
        "data": [{
            "type": "bar", "orientation": "h", "x": vals, "y": names,
            "marker": {"color": [ACCENT if n in highlight else NEUTRAL_BAR for n in names]},
            "text": [value_format.format(v) for v in vals], "textposition": "outside",
            "textfont": {"color": TEXT}, "cliponaxis": False,
            "hovertemplate": "%{y}：%{x}<extra></extra>",
        }],
        "layout": layout,
    }
