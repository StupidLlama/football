"""表單翻譯：Google 表單（xlsx 或試算表）的原始資料 → 乾淨的球員資料表。"""
import warnings
from dataclasses import dataclass, field

import pandas as pd

from domain.models import RatingRules

INFO_FIELDS = ["name", "nickname", "good_positions", "bad_positions"]


@dataclass(frozen=True)
class FormSpec:
    """表單欄位對應（config/settings.toml 的 [form] 和各能力的 column）。"""
    columns: dict                 # {"name": "姓名", "nickname": "...", ...}
    ability_columns: dict         # {"passing": "Passing", ...}
    message_prefix: str
    timestamp: str | None = None
    message_overrides: dict = field(default_factory=dict)


def dedupe_headers(headers: list) -> list[str]:
    """重複的欄位標題加編號（跟 Excel 匯出一樣）：Weak Foot, Weak Foot → Weak Foot, Weak Foot 2"""
    seen: dict[str, int] = {}
    out = []
    for h in (str(x).strip() for x in headers):
        seen[h] = seen.get(h, 0) + 1
        out.append(h if seen[h] == 1 else f"{h} {seen[h]}")
    return out


def parse_timestamps(series: pd.Series) -> pd.Series:
    """支援 Excel 日期，以及 Google 試算表的「2026/9/29 下午 2:33:09」。"""
    with warnings.catch_warnings():  # 混合格式時 pandas 會警告，這裡本來就是逐筆嘗試
        warnings.simplefilter("ignore", UserWarning)
        parsed = pd.to_datetime(series, errors="coerce")
    text = series.astype(str).str.replace("上午", "AM").str.replace("下午", "PM")
    zh = pd.to_datetime(text, format="%Y/%m/%d %p %I:%M:%S", errors="coerce")
    return parsed.fillna(zh)


def _clean_text(series: pd.Series) -> pd.Series:
    return series.fillna("").astype(str).str.strip().replace({"nan": ""})


def normalize(raw: pd.DataFrame, spec: FormSpec, rules: RatingRules) -> pd.DataFrame:
    """表單欄位 → 內部欄位；分數限制在規則範圍；同一人填多次只留最新；套用手動覆寫。"""
    raw = raw.copy()
    raw.columns = [str(c).strip() for c in raw.columns]

    missing = [spec.columns[f] for f in INFO_FIELDS if spec.columns[f] not in raw.columns]
    missing += [spec.ability_columns[k] for k in rules.ability_keys if spec.ability_columns[k] not in raw.columns]
    if missing:
        raise KeyError(f"表單缺少這些欄位（題目名稱是不是改了？請更新 config/settings.toml）：{missing}")

    df = pd.DataFrame(index=raw.index)
    ts = spec.timestamp
    df["submitted_at"] = parse_timestamps(raw[ts]) if ts in raw.columns else pd.NaT
    for f in INFO_FIELDS:
        df[f] = _clean_text(raw[spec.columns[f]])
    msg_col = next((c for c in raw.columns if c.startswith(spec.message_prefix)), None)
    df["message"] = _clean_text(raw[msg_col]) if msg_col else ""
    for k in rules.ability_keys:
        df[k] = (pd.to_numeric(raw[spec.ability_columns[k]], errors="coerce")
                 .fillna(rules.min_score).clip(rules.min_score, rules.max_score).astype(int))

    df = df[df["name"] != ""]
    df.loc[df["nickname"] == "", "nickname"] = df["name"]
    df = df.sort_values("submitted_at", kind="stable").drop_duplicates("name", keep="last").sort_index()
    for who, text in spec.message_overrides.items():
        df.loc[df["name"] == who, "message"] = text
    df["submitted_at"] = df["submitted_at"].astype(str)
    return df.reset_index(drop=True)
