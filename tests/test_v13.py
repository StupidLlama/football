"""v1.3：慣用腳、雙腳圖、陣容圖下載。"""
import pytest

from adapters.form import normalize, parse_side
from domain.foot import MIN_BRIGHTNESS, feet
from infra import config
from infra.charts.feet import feet_img_html, feet_svg
from infra.charts.lineup import lineup_png
from stats.lineup import auto_lineup
from test_layers import SPEC, make_raw

R = config.rules()


@pytest.mark.parametrize("case", [
    ("Left", "left"), ("left", "left"), ("Left foot", "left"), ("左", "left"), ("左腳", "left"), ("Lesft", "left"),
    ("Left ", "left"), ("Right foot ", "right"), ("右腳", "right"), ("so bad 🤣", ""), ("", ""), (None, ""),
    ("左右都可以", ""),
])
def test_parse_side(case):
    text, side = case
    assert parse_side(text) == side


def test_normalize_reads_weak_side():
    df = normalize(make_raw(**{SPEC.weak_side: "左腳"}), SPEC, R)
    assert df.loc[0, "weak_side"] == "left"
    df = normalize(make_raw(), SPEC, R)          # 沒有這一題也不會壞
    assert df.loc[0, "weak_side"] == ""


def player(weak_side, weak_score):
    p = {k: 3 for k in R.ability_keys}
    p.update(name="A", weak_side=weak_side, weak_foot=weak_score)
    return p


def test_feet_strong_and_brightness():
    f = feet(player("left", 1), R)
    assert (f.strong, f.weak, f.weak_brightness) == ("right", "left", MIN_BRIGHTNESS)
    assert "慣用右腳" in f.label
    assert feet(player("right", 5), R).weak_brightness == 1          # 弱腳 5 分 = 兩腳一樣亮
    assert feet(player("left", 2), R).weak_brightness < feet(player("left", 4), R).weak_brightness
    unknown = feet(player("", 3), R)
    assert not unknown.known and "未填" in unknown.label


def test_feet_svg():
    svg = feet_svg(feet(player("left", 2), R))
    assert svg.startswith("<svg") and svg.count("<path") == 2 and "強" in svg and "弱" in svg
    assert svg.count('stroke-width="2.5"') == 1                       # 只有強腳有外框
    assert 'stroke-width="2.5"' not in feet_svg(feet(player("", 3), R))
    assert feet_img_html(feet(player("", 3), R)).startswith('<img src="data:image/svg+xml;base64,')


def test_lineup_png():
    team = []
    for i in range(9):
        p = {k: 1 + (i + j) % 5 for j, k in enumerate(R.ability_keys)}
        p.update(name=f"P{i}", nickname=f"N{i}", good_positions="", bad_positions="")
        team.append(p)
    f = next(x for x in config.formations() if x.size == 8)
    png = lineup_png(auto_lineup(team, f, R), {"P1": "很長很長很長很長的暱稱"}, {"P2": "7"}, "8 人制 測試")
    assert png[:8] == b"\x89PNG\r\n\x1a\n" and len(png) > 10_000


def test_feet_labels_split():
    f = feet(player("left", 2), R)
    assert (f.strong_label, f.weak_label) == ("慣用右腳", "弱腳 2 分")
    assert feet(player("", 3), R).strong_label == "慣用腳未填"
