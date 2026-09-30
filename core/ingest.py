"""把表單原始資料整理成乾淨的球員資料（不管資料來自 xlsx 還是試算表）。"""
import pandas as pd

from .config import Settings, settings as default_settings

INFO_FIELDS = ["name", "nickname", "good_positions", "bad_positions"]


def parse_timestamps(series: pd.Series) -> pd.Series:
    """支援 Excel 的日期，以及 Google 試算表的「2026/9/29 下午 2:33:09」格式。"""
    parsed = pd.to_datetime(series, errors="coerce")
    text = series.astype(str).str.replace("上午", "AM").str.replace("下午", "PM")
    zh = pd.to_datetime(text, format="%Y/%m/%d %p %I:%M:%S", errors="coerce")
    return parsed.fillna(zh)


def _clean_text(series: pd.Series) -> pd.Series:
    return series.fillna("").astype(str).str.strip().replace({"nan": ""})


def normalize(raw: pd.DataFrame, cfg: Settings | None = None) -> pd.DataFrame:
    """表單欄位 → 內部欄位；同一人填多次只留最新一筆；套用手動覆寫。"""
    cfg = cfg or default_settings()
    form = cfg.form
    raw = raw.copy()
    raw.columns = [str(c).strip() for c in raw.columns]

    missing = [form[f] for f in INFO_FIELDS if form[f] not in raw.columns]
    missing += [a.column for a in cfg.abilities if a.column not in raw.columns]
    if missing:
        raise KeyError(f"表單缺少這些欄位（題目名稱是不是改了？請更新 config/settings.toml）：{missing}")

    df = pd.DataFrame(index=raw.index)
    ts = form.get("timestamp")
    df["submitted_at"] = parse_timestamps(raw[ts]) if ts in raw.columns else pd.NaT
    for f in INFO_FIELDS:
        df[f] = _clean_text(raw[form[f]])
    msg_col = next((c for c in raw.columns if c.startswith(form["message_prefix"])), None)
    df["message"] = _clean_text(raw[msg_col]) if msg_col else ""
    for a in cfg.abilities:
        df[a.key] = pd.to_numeric(raw[a.column], errors="coerce").fillna(1).clip(1, 5).astype(int)

    df = df[df["name"] != ""]
    df.loc[df["nickname"] == "", "nickname"] = df["name"]
    # 同一個人重複填表 → 保留最後一次
    df = df.sort_values("submitted_at", kind="stable").drop_duplicates("name", keep="last")
    df = df.sort_index()
    for who, text in cfg.message_overrides.items():
        df.loc[df["name"] == who, "message"] = text
    df["submitted_at"] = df["submitted_at"].astype(str)
    return df.reset_index(drop=True)


def split_positions(text: str) -> list[str]:
    return [x.strip() for x in str(text).replace("，", ",").split(",") if x.strip()]
