"""翻譯層：系際聯賽賽程表（Excel / Google 試算表的一個分頁）→ domain 的 Fixture。

賽程表是人工填的，所以這裡負責把各種寫法整理乾淨：
- 合併儲存格：同一天第二場的日期是空的 → 沿用上一列的日期
- 年份打錯（例如 26-27 學年寫成 2025）→ 用「星期」欄找出正確的年份
- 時間「19~20」→ 19:00–20:00
- 比分「3:1」「3-1」「3：1」「3比1」都可以；還沒踢 = 空白
- 隊名前後的空白、注音「ㄧ」當成「一」
"""
import re
from datetime import date, datetime, timedelta

from domain.fixture import Fixture

WEEKDAYS = {"一": 0, "ㄧ": 0, "二": 1, "三": 2, "四": 3, "五": 4, "六": 5, "日": 6, "天": 6}
_SCORE = re.compile(r"^\s*(\d+)\s*[:：\-–—比]\s*(\d+)")
_TIME = re.compile(r"(\d{1,2})(?::(\d{2}))?\s*[~～\-–]\s*(\d{1,2})(?::(\d{2}))?")
_EXCEL_EPOCH = date(1899, 12, 30)


def _text(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def _int(v) -> int | None:
    t = _text(v)
    return int(t) if t.isdigit() else None


def weekday_of(text) -> int | None:
    t = _text(text).replace(" ", "").replace("星期", "").replace("週", "").replace("(", "").replace(")", "")
    return WEEKDAYS.get(t[:1]) if t else None


def parse_day(value, default_year: int | None = None) -> date | None:
    """Excel 日期、'2026/10/2'、'2026-10-02'、'10/2'（沒寫年 → default_year）。"""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, (int, float)) and 20000 < value < 80000:   # Excel 序號
        return _EXCEL_EPOCH + timedelta(days=int(value))
    nums = [int(x) for x in re.findall(r"\d+", str(value))]
    try:
        if len(nums) >= 3 and nums[0] > 31:
            return date(nums[0], nums[1], nums[2])
        if len(nums) >= 2 and default_year:
            return date(default_year, nums[0], nums[1])
    except ValueError:
        return None
    return None


def fix_year(day: date, weekday: int | None) -> date:
    """日期跟星期對不上時，試試前後一年（賽程表常把年份打錯）。"""
    if weekday is None or day.weekday() == weekday:
        return day
    for dy in (1, -1):
        try:
            cand = day.replace(year=day.year + dy)
        except ValueError:      # 2/29
            continue
        if cand.weekday() == weekday:
            return cand
    return day


def parse_score(text) -> tuple[int, int] | None:
    m = _SCORE.match(_text(text))
    return (int(m.group(1)), int(m.group(2))) if m else None


def parse_time(text) -> tuple[str, str]:
    m = _TIME.search(_text(text))
    if not m:
        return _text(text), ""
    h1, m1, h2, m2 = m.groups()
    return f"{int(h1):02d}:{m1 or '00'}", f"{int(h2):02d}:{m2 or '00'}"


def _header_row(rows: list[list]) -> int | None:
    for i, row in enumerate(rows[:30]):
        cells = [_text(c) for c in row]
        if "日期" in cells and "主場" in cells and "客場" in cells:
            return i
    return None


def _columns(header: list) -> dict[str, list[int]]:
    cols: dict[str, list[int]] = {}
    for i, c in enumerate(header):
        name = _text(c)
        if name:
            cols.setdefault(name, []).append(i)
    return cols


def parse_fixtures(rows: list[list], season_year: int | None = None) -> list[Fixture]:
    """rows = 整個分頁的儲存格（第一列不一定是標題）。找不到標題列就回傳空的。"""
    h = _header_row(rows)
    if h is None:
        return []
    cols = _columns(rows[h])

    def cell(row, name, n=0):
        idx = cols.get(name, [])
        return row[idx[n]] if len(idx) > n and idx[n] < len(row) else None

    out, last_day = [], None
    for row in rows[h + 1:]:
        wd = weekday_of(cell(row, "星期"))
        raw_day = parse_day(cell(row, "日期"), season_year or (last_day.year if last_day else None))
        if raw_day:
            last_day = fix_year(raw_day, wd)
        home, away = _text(cell(row, "主場")), _text(cell(row, "客場"))
        if not (last_day and home and away):
            continue
        start, end = parse_time(cell(row, "時間"))
        out.append(Fixture(
            day=last_day, start=start, end=end, home=home, away=away,
            no=_int(cell(row, "場次")), round=_int(cell(row, "輪次")),
            score=parse_score(cell(row, "比分")),
            referee=_text(cell(row, "主審")),
            linesmen=tuple(t for t in (_text(cell(row, "邊審", 0)), _text(cell(row, "邊審", 1))) if t),
            note=_text(cell(row, "備註")),
        ))
    return out
