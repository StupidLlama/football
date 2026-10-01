"""圖表共用的深色配色（跟 .streamlit/config.toml 的主題一致）。"""

BG = "#0B1220"        # 頁面背景
PANEL = "#131C2E"     # 卡片、側邊欄
GRID = "#26324A"      # 格線
TEXT = "#E2E8F0"
MUTED = "#8B9AB4"
ACCENT = "#2DD4BF"    # 強調色（青綠）
SECOND = "#F59E0B"    # 比較時的第二位球員（橘，和青綠用亮度也分得開）
NEUTRAL_BAR = "#33415C"

# 球場位置方框
BLUE, RED, YELLOW = "#60A5FA", "#F87171", "#FACC15"

FONT = "Noto Sans TC, Microsoft JhengHei, PingFang TC, sans-serif"


def rgba(hex_color: str, alpha: float) -> str:
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return f"rgba({r},{g},{b},{alpha})"


def base_layout(height: int) -> dict:
    return {
        "height": height,
        "paper_bgcolor": "rgba(0,0,0,0)",
        "plot_bgcolor": "rgba(0,0,0,0)",
        "font": {"family": FONT, "color": TEXT, "size": 13},
        "margin": {"l": 40, "r": 40, "t": 30, "b": 30},
    }
