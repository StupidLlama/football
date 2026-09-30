"""執行：py -m pytest"""
import pandas as pd
import pytest

from core import charts
from core.analysis import bad_positions, fitness, good_positions, recommended
from core.config import settings
from core.db import add_match, connect, load_match_stats, load_matches, save_match_stats, schema_version, sync_players, MIGRATIONS
from core.ingest import normalize, split_positions
from core.sources import XlsxSource, GoogleSheetSource, get_source


def make_raw(**overrides):
    """做一份假的表單資料（欄位跟真的表單一樣）。"""
    cfg = settings()
    f = cfg.form
    row = {f["timestamp"]: "2026-09-29 14:00:00", f["name"]: "測試員", f["nickname"]: "阿測",
           f["good_positions"]: "CB, CDM", f["bad_positions"]: "ST",
           f["message_prefix"] + "?\nex:球風": "加油"}
    row.update({a.column: 3 for a in cfg.abilities})
    row.update(overrides)
    return pd.DataFrame([row])


# ---------- 設定檔 ----------
def test_settings_weights_sum_to_one():
    for pos, ws in settings().position_weights.items():
        assert abs(sum(ws.values()) - 1) < 1e-9, pos


def test_settings_weights_use_known_abilities():
    keys = set(settings().ability_keys)
    for pos, ws in settings().position_weights.items():
        assert set(ws) <= keys, pos


# ---------- 資料整理 ----------
def test_normalize_basic():
    df = normalize(make_raw())
    assert df.loc[0, "name"] == "測試員" and df.loc[0, "message"] == "加油"
    assert all(df.loc[0, k] == 3 for k in settings().ability_keys)


def test_normalize_clips_and_fills_scores():
    col = settings().abilities[0].column
    assert normalize(make_raw(**{col: 9})).iloc[0][settings().abilities[0].key] == 5
    assert normalize(make_raw(**{col: None})).iloc[0][settings().abilities[0].key] == 1


def test_normalize_keeps_latest_duplicate():
    f = settings().form
    raw = pd.concat([make_raw(**{f["timestamp"]: "2026-09-29 10:00", f["nickname"]: "舊"}),
                     make_raw(**{f["timestamp"]: "2026-09-30 10:00", f["nickname"]: "新"})])
    df = normalize(raw)
    assert len(df) == 1 and df.loc[0, "nickname"] == "新"


def test_normalize_missing_column_gives_clear_error():
    with pytest.raises(KeyError, match="settings.toml"):
        normalize(make_raw().drop(columns=[settings().form["name"]]))


def test_message_override():
    who = next(iter(settings().message_overrides), None)
    if who:
        df = normalize(make_raw(**{settings().form["name"]: who}))
        assert df.loc[0, "message"] == settings().message_overrides[who]


def test_split_positions():
    assert split_positions("CB，CDM, ST") == ["CB", "CDM", "ST"]
    assert split_positions("") == []


# ---------- 分析 ----------
def test_fitness_range_and_recommend():
    p = normalize(make_raw()).iloc[0]
    fit = fitness(p)
    assert set(fit) == set(settings().positions)
    assert all(v == 60 for v in fit.values())  # 全部 3 分 → 60
    assert len(recommended(p)) == settings().top_n
    assert good_positions(p) == ["CB", "CDM"] and bad_positions(p) == ["ST"]


# ---------- 資料庫 ----------
def test_db_migrate_and_matches(tmp_path):
    con = connect(tmp_path / "t.db")
    assert schema_version(con) == len(MIGRATIONS)
    mid = add_match(con, "2026-10-05", "電機系", 2, 1)
    save_match_stats(con, mid, {"測試員": {"passes": 10, "distance_m": 8000}})
    assert len(load_matches(con)) == 1
    assert len(load_match_stats(con, mid)) == 2
    con.close()
    con = connect(tmp_path / "t.db")  # 再開一次不會重複升級
    assert schema_version(con) == len(MIGRATIONS)
    con.close()


def test_sync_players_from_xlsx(tmp_path):
    raw = make_raw()
    path = tmp_path / "team.xlsx"
    raw.to_excel(path, index=False)
    df = sync_players(XlsxSource(path), tmp_path / "t.db")
    assert list(df["name"]) == ["測試員"]


# ---------- 資料來源 ----------
def test_get_source_defaults_to_xlsx():
    assert isinstance(get_source(None), XlsxSource)
    assert isinstance(get_source({}), XlsxSource)


def test_get_source_google_sheet():
    secrets = {"google_sheet": {"url": "https://x", "worksheet": "表單回覆 1"},
               "gcp_service_account": {"type": "service_account"}}
    src = get_source(secrets)
    assert isinstance(src, GoogleSheetSource) and src.worksheet == "表單回覆 1"


# ---------- 圖表 ----------
def test_charts_render():
    p = normalize(make_raw()).iloc[0]
    for fig in (charts.radar(p), charts.radar([p, p], labels=["A", "B"]), charts.pitch(p)):
        assert fig.axes
        charts.plt.close(fig)
