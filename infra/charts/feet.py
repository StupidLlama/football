"""雙腳鞋底圖（SVG）：強腳亮＋白框、弱腳暗，弱腳越好越亮。"""
import base64

from domain.foot import Feet

from .style import ACCENT, MUTED, TEXT


# 足球鞋大底（從下面看）的輪廓，右腳；左腳左右鏡像。鞋頭偏大拇趾那側、前掌寬、腰窄、腳跟收圓
SOLE = ("M-4,2 C8,2 20,14 21,32 C22,48 18,60 14,72 C11,82 13,98 13,108 C13,120 6,126 -1,126 "
        "C-9,126 -14,120 -14,108 C-14,98 -10,86 -10,76 C-10,64 -19,54 -19,36 C-19,18 -14,2 -4,2 Z")


def _boot(cx: float, mirror: bool, color: str, opacity: float, outline: bool) -> str:
    """一隻鞋底。outline=True（強腳）加白色外框。"""
    s = -1 if mirror else 1
    stroke = f'stroke="{TEXT}" stroke-width="2.5"' if outline else 'stroke="none"'
    return (f'<g transform="translate({cx},3) scale({s},1)">'
            f'<path d="{SOLE}" fill="{color}" fill-opacity="{opacity}" {stroke} stroke-linejoin="round"/></g>')


def feet_svg(f: Feet) -> str:
    """兩隻鞋底：強腳全亮＋白框，弱腳依弱腳分數變暗（5 分 = 一樣亮）；看不出慣用腳就兩隻都灰色。"""
    width, height = 210, 162
    if f.known:
        lo = 1 if f.strong == "left" else f.weak_brightness
        ro = 1 if f.strong == "right" else f.weak_brightness
        color = ACCENT
    else:
        lo = ro = 0.45
        color = MUTED

    def tag(x, side):
        word = ("強" if f.strong == side else "弱") if f.known else ""
        return (f'<text x="{x}" y="156" text-anchor="middle" font-size="18" fill="{TEXT}">'
                f'{"左" if side == "left" else "右"}{(" · " + word) if word else ""}</text>')

    body = (_boot(50, True, color, lo, f.strong == "left") + _boot(160, False, color, ro, f.strong == "right")
            + tag(50, "left") + tag(160, "right"))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
            f'viewBox="0 0 {width} {height}" font-family="sans-serif">{body}</svg>')


def feet_img_html(f: Feet, height: int = 96) -> str:
    """可以放進 st.markdown 的 <img>（SVG 用 base64 內嵌，不需要外部檔案）。"""
    data = base64.b64encode(feet_svg(f).encode("utf-8")).decode("ascii")
    return f'<img src="data:image/svg+xml;base64,{data}" height="{height}" alt="{f.label}" title="{f.label}">'
