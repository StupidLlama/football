"""執行：py -m pytest"""
import pandas as pd
import pytest

from adapters.form import dedupe_headers, normalize, parse_timestamps
from adapters.repository import add_match, load_match_stats, load_matches, save_match_stats
from domain.positions import split_positions
from domain.rating import average, category_scores, fitness, recommended
from infra import config
from infra.charts.bars import hbar
from infra.charts.radar import Series, radar
from infra.db import MIGRATIONS, connect, schema_version
from infra.pipeline import sync_players
from infra.sources import GoogleSheetSource, XlsxSource, get_source
from stats.match import matches_played, player_totals
from stats.player import ability_ranks, biggest_differences, overall_rank, rank, strengths, weaknesses
from stats.team import good_position_counts, team_average, team_overall

R = config.rules()
SPEC = config.form_spec()


def make_raw(**overrides):
    """假的表單資料（欄位跟真的表單一樣）。"""
    row = {SPEC.timestamp: "2026-09-29 14:00:00", SPEC.columns["name"]: "測試員",
           SPEC.columns["nickname"]: "阿測", SPEC.columns["good_positions"]: "CB, CDM",
           SPEC.columns["bad_positions"]: "ST", SPEC.message_prefix + "?\nex:球風": "加油"}
    row.update({SPEC.ability_columns[k]: 3 for k in R.ability_keys})
    row.update(overrides)
    return pd.DataFrame([row])


def player(**scores):
    p = {k: 3 for k in R.ability_keys}
    p.update(name="P", nickname="P", good_positions="CB", bad_positions="ST", message="")
    p.update(scores)
    return p


# ---------- Core ----------
def test_rules_are_valid():
    assert R.validate() == []


def test_rules_validate_catches_bad_weights():
    from dataclasses import replace
    bad = replace(R, position_weights={"CB": {"heading": 0.5, "nope": 0.2}})
    problems = bad.validate()
    assert any("加總" in x for x in problems) and any("nope" in x for x in problems)


def test_rating_basics():
    p = player()
    assert average(p, R) == 3
    assert all(v == 60 for v in fitness(p, R).values())
    assert set(category_scores(p, R).values()) == {3}
    assert len(recommended(p, R)) == R.top_n


def test_recommended_follows_weights():
    p = player(finishing=5, heading=5, explosive=5, ball_keeping=5, space=5, physical=5)
    assert recommended(p, R)[0] == "ST"


def test_split_positions():
    assert split_positions("CB，CDM, ST") == ["CB", "CDM", "ST"]
    assert split_positions("") == [] and split_positions(None) == []


# ---------- Inner shell ----------
def test_rank_ties():
    assert rank(5, [5, 5, 3]) == 1 and rank(3, [5, 5, 3]) == 3


def test_player_stats():
    a, b = player(name="A", speed=5), player(name="B", speed=1, passing=5)
    team = [a, b]
    assert ability_ranks(a, team, R)["speed"] == 1
    assert strengths(a, team, R, n=1)[0].key == "speed"
    assert weaknesses(b, team, R, n=1)[0].key == "speed"
    assert overall_rank(b, team, R) in (1, 2)
    d = biggest_differences(a, b, R, n=2)
    assert {x.key for x in d} == {"speed", "passing"} and d[0].diff in (4, -2)


def test_team_stats():
    team = [player(speed=5), player(speed=1)]
    assert team_average(team, R)["speed"] == 3
    assert team_overall(team, R) == 3
    counts = good_position_counts(team, R.positions)
    assert counts["CB"] == 2 and counts["ST"] == 0 and list(counts) == R.positions


def test_match_stats():
    rows = [{"match_id": 1, "player_name": "A", "stat": "passes", "value": 10},
            {"match_id": 2, "player_name": "A", "stat": "passes", "value": 5},
            {"match_id": 2, "player_name": "B", "stat": "passes", "value": 7}]
    assert player_totals(rows, "A") == {"passes": 15}
    assert matches_played(rows, "A") == 2 and matches_played(rows, "C") == 0


# ---------- Translate shell ----------
def test_normalize_basic():
    df = normalize(make_raw(), SPEC, R)
    assert df.loc[0, "name"] == "測試員" and df.loc[0, "message"] == "加油"
    assert all(df.loc[0, k] == 3 for k in R.ability_keys)


def test_normalize_clips_and_fills_scores():
    key = R.ability_keys[0]
    col = SPEC.ability_columns[key]
    assert normalize(make_raw(**{col: 9}), SPEC, R).iloc[0][key] == 5
    assert normalize(make_raw(**{col: None}), SPEC, R).iloc[0][key] == 1


def test_normalize_keeps_latest_duplicate():
    raw = pd.concat([make_raw(**{SPEC.timestamp: "2026/9/29 上午 10:00:00", SPEC.columns["nickname"]: "舊"}),
                     make_raw(**{SPEC.timestamp: "2026/9/29 下午 1:00:00", SPEC.columns["nickname"]: "新"})])
    df = normalize(raw, SPEC, R)
    assert len(df) == 1 and df.loc[0, "nickname"] == "新"


def test_normalize_missing_column_gives_clear_error():
    with pytest.raises(KeyError, match="settings.toml"):
        normalize(make_raw().drop(columns=[SPEC.columns["name"]]), SPEC, R)


def test_message_override():
    who = next(iter(SPEC.message_overrides), None)
    if who:
        df = normalize(make_raw(**{SPEC.columns["name"]: who}), SPEC, R)
        assert df.loc[0, "message"] == SPEC.message_overrides[who]


def test_dedupe_headers():
    assert dedupe_headers(["A", "Weak Foot", "Weak Foot", " B "]) == ["A", "Weak Foot", "Weak Foot 2", "B"]


def test_parse_timestamps():
    s = parse_timestamps(pd.Series(["2026/9/29 下午 2:33:09", "2026/9/29 上午 9:05:00", "2026-09-30 10:00:00"]))
    assert list(s.dt.hour) == [14, 9, 10]


def test_repository_matches(tmp_path):
    con = connect(tmp_path / "t.db")
    mid = add_match(con, "2026-10-05", "電機系", 2, 1)
    save_match_stats(con, mid, {"測試員": {"passes": 10, "distance_m": 8000}})
    assert len(load_matches(con)) == 1 and len(load_match_stats(con, mid)) == 2
    con.close()


# ---------- Tools shell ----------
def test_db_migrations_run_once(tmp_path):
    con = connect(tmp_path / "t.db")
    assert schema_version(con) == len(MIGRATIONS)
    con.close()
    con = connect(tmp_path / "t.db")
    assert schema_version(con) == len(MIGRATIONS)
    con.close()


def test_sync_players_from_xlsx(tmp_path):
    path = tmp_path / "team.xlsx"
    make_raw().to_excel(path, index=False)
    df = sync_players(XlsxSource(path), tmp_path / "t.db")
    assert list(df["name"]) == ["測試員"]


def test_get_source():
    assert isinstance(get_source(None), XlsxSource) and isinstance(get_source({}), XlsxSource)
    src = get_source({"google_sheet": {"url": "https://x", "worksheet": "表單回覆 1"},
                      "gcp_service_account": {"type": "service_account"}})
    assert isinstance(src, GoogleSheetSource) and src.worksheet == "表單回覆 1"


def test_google_sheet_source_with_duplicate_headers(monkeypatch):
    import sys
    import types
    raw = make_raw()
    raw.insert(0, "Weak Foot", "Left")  # 真實表單：第一個 Weak Foot 是左右腳
    headers = [("Weak Foot" if c == "Weak Foot 2" else c) for c in raw.columns]
    values = [headers, [str(v) for v in raw.iloc[0]]]

    class Sheet:
        def get_all_values(self):
            return values

    class Book:
        sheet1 = Sheet()

        def worksheet(self, name):
            return Sheet()

    fake = types.SimpleNamespace(service_account_from_dict=lambda d: types.SimpleNamespace(open_by_url=lambda u: Book()))
    monkeypatch.setitem(sys.modules, "gspread", fake)
    df = normalize(GoogleSheetSource("u", {}, "表單回覆 1").load(), SPEC, R)
    assert df.loc[0, "name"] == "測試員" and df.loc[0, "weak_foot"] == 3


def test_radar_figure_structure():
    p = player(speed=5)
    fig = radar([Series("隊平均", team_average([p], R), "#888888", dashed=True), Series("P", p, "#2DD4BF")],
                R, color_points_by_category=True)
    kinds = [t["type"] for t in fig["data"]]
    assert kinds.count("barpolar") == len(R.categories) and kinds.count("scatterpolar") == 2
    player_trace = fig["data"][-1]
    n = len(R.abilities)
    assert len(player_trace["r"]) == len(player_trace["theta"]) == n + 1       # 首尾相接
    assert player_trace["r"][0] == player_trace["r"][-1]
    assert len(player_trace["marker"]["color"]) == n + 1
    assert fig["layout"]["polar"]["radialaxis"]["range"] == [0, R.max_score]
    # 扇形：每項能力剛好一格，角度不重複，而且和刻度對齊
    wedges = [t for t in fig["data"] if t["type"] == "barpolar"]
    thetas = [x for t in wedges for x in t["theta"]]
    assert len(thetas) == n and len(set(thetas)) == n
    assert sorted(thetas) == fig["layout"]["polar"]["angularaxis"]["tickvals"]
    assert fig["layout"]["polar"]["angularaxis"]["ticktext"] == [a.label for a in R.abilities]


def test_hbar_structure():
    fig = hbar({"CB": 75, "ST": 71, "GK": 60}, highlight={"CB"}, x_max=100)
    bar = fig["data"][0]
    assert bar["y"] == ["GK", "ST", "CB"] and bar["marker"]["color"][-1] != bar["marker"]["color"][0]


def test_pitch_renders():
    from infra.charts import pitch
    fig = pitch.pitch(player(), R)
    assert fig.axes
    pitch.close(fig)
