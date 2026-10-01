"""v1.4：聯賽賽程解析、戰績、裁判任務、隨機抽人、教練密碼。

測試資料仿照真的系際聯賽賽程表格式，但人名都是假的（repo 是公開的）。
"""
import fnmatch
import random
from datetime import date, datetime
from pathlib import Path

import pytest

from adapters.schedule import fix_year, parse_day, parse_fixtures, parse_score, parse_time, weekday_of
from infra import config
from infra.coach import PasswordCoachGate, coach_gate
from infra.schedule import (GoogleDutyStore, GoogleScheduleSource, JsonDutyStore, XlsxScheduleSource, _from_rows,
                            duty_rows, get_duty_store, get_schedule_source)
from stats.referee import FairRandomPicker, counts
from stats.schedule import (awaiting_score, duties_for, finished, form, record, relation, team_fixtures, upcoming)

ROOT = Path(__file__).resolve().parent.parent
TEAM = "資訊"
HEADER = ["場次", "輪次", "日期", "星期", "時間", "主場", "比分", "客場", "主審", "邊審", "邊審", "進球名單", "紅黃牌", "備註"]


def sheet():
    """年份故意打錯（2025 → 實際是 2026）、同一天第二場日期空白、隊名有空白、注音「ㄧ」。"""
    return [
        ["", "", "上學期小組賽統計"],
        HEADER,
        [None, None, datetime(2025, 10, 2), "五", "19~20", None, None, None, None, None, None],
        [2, 1, None, "五", "20~21", "化學-材料", None, " 工科", "王裁判", "政治-物理", TEAM],
        [7, 2, datetime(2025, 10, 16), "五", "19~20", TEAM, "3:1", "能源", None, "電機", "醫學"],
        [8, 2, None, "五", "20~21", "醫學", None, "電機", None, "能源", TEAM],
        [1, 1, "2025/10/23", "五", "19~20", "政治-物理", None, TEAM, "李裁判", "化學-材料", "工科", None, None, "資訊延賽"],
        [14, 3, datetime(2025, 11, 9), "ㄧ ", "20~21", TEAM, "1 - 1", "醫學", None, "法律", "工科"],
        [13, 3, None, "ㄧ", "19~20", "法律", None, "工科", TEAM, "醫學", None],
        [17, 4, datetime(2026, 11, 16), "一", "19~20", TEAM, None, "航太", None, "法律", "政治-物理"],
        [None, None, datetime(2026, 12, 31), "一", "19~20", None, None, None],   # 空白時段
    ]


FX = parse_fixtures(sheet())


# ---------- 解析 ----------
def test_parse_basic_and_skips_empty_slots():
    assert len(FX) == 7
    f = FX[0]
    assert (f.day, f.start, f.end, f.home, f.away, f.no, f.round) == (date(2026, 10, 2), "20:00", "21:00",
                                                                      "化學-材料", "工科", 2, 1)
    assert f.referee == "王裁判" and f.linesmen == ("政治-物理", TEAM)


def test_year_is_fixed_by_weekday():
    assert all(f.day.year == 2026 for f in FX)
    assert all(f.day.weekday() in (0, 4) for f in FX)      # 一 / 五


@pytest.mark.parametrize("case", [
    ("3:1", (3, 1)), ("3：1", (3, 1)), ("1 - 1", (1, 1)), ("2比0", (2, 0)), ("0–2", (0, 2)),
    ("1:1 (PK 4:3)", (1, 1)), ("", None), (None, None), ("延賽", None),
])
def test_parse_score(case):
    text, expected = case
    assert parse_score(text) == expected


@pytest.mark.parametrize("case", [("19~20", ("19:00", "20:00")), ("19:30~20:30", ("19:30", "20:30")),
                                  ("9-10", ("09:00", "10:00"))])
def test_parse_time(case):
    text, expected = case
    assert parse_time(text) == expected


def test_parse_day_and_weekday():
    assert parse_day("2026-10-02") == date(2026, 10, 2)
    assert parse_day("10/2", default_year=2026) == date(2026, 10, 2)
    assert parse_day(46297) == date(2026, 10, 2)            # Excel 序號
    assert parse_day("") is None
    assert weekday_of("ㄧ ") == 0 and weekday_of("週五") == 4 and weekday_of("") is None
    assert fix_year(date(2025, 10, 2), 4) == date(2026, 10, 2)
    assert fix_year(date(2026, 10, 2), None) == date(2026, 10, 2)


def test_no_header_gives_empty():
    assert parse_fixtures([["a", "b"], [1, 2]]) == []


def test_google_sheet_strings_parse_the_same():
    rows = [[("" if c is None else c.strftime("%Y/%m/%d") if isinstance(c, datetime) else str(c)) for c in r]
            for r in sheet()]
    assert [(f.day, f.home, f.away, f.score) for f in parse_fixtures(rows)] == \
           [(f.day, f.home, f.away, f.score) for f in FX]


# ---------- 戰績 ----------
def test_upcoming_finished_form_record():
    today = date(2026, 10, 20)
    assert [f.opponent(TEAM) for f in upcoming(FX, TEAM, today)] == ["政治-物理", "航太"]
    assert [f.opponent(TEAM) for f in finished(FX, TEAM)] == ["醫學", "能源"]     # 新 → 舊
    assert form(FX, TEAM) == ["W", "D"]                                          # 舊 → 新
    r = record(FX, TEAM)
    assert (r.wins, r.draws, r.losses, r.goals_for, r.goals_against, r.points) == (1, 1, 0, 4, 2, 4)
    assert [f.opponent(TEAM) for f in awaiting_score(FX, TEAM, date(2026, 11, 20))] == ["航太", "政治-物理"]


def test_away_result_is_from_our_side():
    f = parse_fixtures([HEADER, [1, 1, "2026/10/23", "五", "19~20", "法律", "2:0", TEAM]])[0]
    assert f.goals(TEAM) == (0, 2) and f.result(TEAM) == "L" and not f.is_home(TEAM)


# ---------- 裁判任務 ----------
def test_duties_for_team():
    duties = duties_for(FX, TEAM)
    assert [(d.fixture.day.isoformat(), d.fixture.start, d.role) for d in duties] == [
        ("2026-10-02", "20:00", "邊審"), ("2026-10-16", "20:00", "邊審"), ("2026-11-09", "19:00", "主審")]
    assert relation(duties[0], TEAM) == "當天沒有我們的比賽"
    assert relation(duties[1], TEAM) == "接在我們對能源之後"
    assert relation(duties[2], TEAM) == "在我們對醫學之前"
    assert len({d.key for d in duties}) == 3


def make_duties(n):
    rows = [HEADER] + [[i, 1, date(2026, 10, 1 + i), "", "19~20", "A", None, "B", None, TEAM, None] for i in range(n)]
    return duties_for(parse_fixtures(rows), TEAM)


def test_picker_is_fair():
    pool = [f"P{i}" for i in range(8)]
    duties = make_duties(8)
    for seed in range(20):
        out = FairRandomPicker(random.Random(seed)).pick_all(duties, pool, {})
        assert len(out) == 8 and len(set(out.values())) == 8      # 8 場分給 8 個不同的人
    out = FairRandomPicker(random.Random(1)).pick_all(make_duties(10), pool[:3], {})
    assert sorted(counts(out, pool[:3]).values()) == [3, 3, 4]    # 次數最多差 1


def test_picker_only_empty_and_repick():
    pool = ["A", "B", "C"]
    duties = make_duties(3)
    picker = FairRandomPicker(random.Random(0))
    current = {duties[0].key: "A"}
    out = picker.pick_all(duties, pool, current, only_empty=True)
    assert out[duties[0].key] == "A" and len(out) == 3
    again = picker.pick_one(duties[0], pool, out)                  # 重抽：不算自己那一場
    assert again in pool


def test_picker_eligible_filter():
    duties = make_duties(4)
    picker = FairRandomPicker(random.Random(0), eligible=lambda d, name: name != "B")
    assert "B" not in picker.pick_all(duties, ["A", "B", "C"], {}).values()
    assert FairRandomPicker(eligible=lambda d, n: False).pick_one(duties[0], ["A"], {}) is None


def test_same_day_person_is_avoided():
    rows = [HEADER, [1, 1, date(2026, 10, 2), "", "19~20", "A", None, "B", None, TEAM, None],
            [2, 1, None, "", "20~21", "C", None, "D", None, TEAM, None]]
    d1, d2 = duties_for(parse_fixtures(rows), TEAM)
    for seed in range(10):
        assert FairRandomPicker(random.Random(seed)).pick_one(d2, ["X", "Y"], {d1.key: "X", "other": "Y"}) == "Y"


# ---------- 存檔 ----------
def test_json_store_roundtrip(tmp_path):
    duties = make_duties(2)
    store = JsonDutyStore(tmp_path / "referee.json")
    assert store.load() == {}
    store.save({duties[0].key: "A", duties[1].key: ""}, duties)
    assert store.load() == {duties[0].key: "A"}


def test_duty_rows_roundtrip():
    duties = make_duties(2)
    rows = duty_rows({duties[1].key: "B"}, duties)
    assert rows[0][0] == "key" and len(rows) == 3
    assert _from_rows(rows) == {duties[1].key: "B"}
    assert _from_rows([]) == {} and _from_rows([["x"]]) == {}


def test_sources_pick_google_only_with_settings():
    sa = {"type": "service_account"}
    assert isinstance(get_schedule_source(None), XlsxScheduleSource)
    assert isinstance(get_schedule_source({"gcp_service_account": sa}), XlsxScheduleSource)
    assert isinstance(get_schedule_source({"schedule": {"url": "u"}, "gcp_service_account": sa}), GoogleScheduleSource)
    assert isinstance(get_duty_store({}), JsonDutyStore)
    store = get_duty_store({"schedule": {"url": "u"}, "gcp_service_account": sa}, "裁判")
    assert isinstance(store, GoogleDutyStore) and store.worksheet == "裁判"


def test_xlsx_schedule_source_missing_file(tmp_path):
    with pytest.raises(FileNotFoundError):
        XlsxScheduleSource(tmp_path / "nope.xlsx").load_rows("上學期賽程表")


def test_xlsx_schedule_source_reads_sheet(tmp_path):
    import openpyxl
    book = openpyxl.Workbook()
    book.active.title = "其他"
    ws = book.create_sheet("上學期賽程表")
    for row in sheet():
        ws.append(row)
    book.save(tmp_path / "s.xlsx")
    fx = parse_fixtures(XlsxScheduleSource(tmp_path / "s.xlsx").load_rows("上學期賽程表"))
    assert len(fx) == len(FX)


# ---------- 教練密碼 ----------
def test_coach_gate():
    session = {}
    off = coach_gate({}, session)
    assert not off.enabled and not off.is_coach() and not off.login("")
    gate = coach_gate({"coach_password": "pw"}, session)
    assert gate.enabled and not gate.is_coach()
    assert not gate.login("wrong") and not gate.is_coach()
    assert gate.login(" pw ") and gate.is_coach()
    gate.logout()
    assert not gate.is_coach()
    assert not PasswordCoachGate("", {}).login("")


# ---------- 設定與安全 ----------
def test_schedule_settings():
    s = config.schedule_settings()
    assert s.team and s.worksheet and s.duty_worksheet


def ignored(path: str) -> bool:
    patterns = [l.strip() for l in (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
                if l.strip() and not l.startswith("#")]
    return any(fnmatch.fnmatch(path, p) for p in patterns)


@pytest.mark.parametrize("path", ["data/schedule.xlsx", "data/team.xlsx", "data/referee.json", "data/potato.db",
                                  ".streamlit/secrets.toml"])
def test_private_files_are_gitignored(path):
    assert ignored(path)
