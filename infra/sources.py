"""資料來源（Tools shell）：負責「拿到表單原始資料」，回傳跟表單欄位一樣的 DataFrame。

目前有兩種：
- XlsxSource：讀本機 data/team.xlsx（本機測試用）
- GoogleSheetSource：直接讀 Google 表單連結的試算表（部署用，資料即時更新）

要新增其他來源（例如 CSV、API），寫一個有 load() 的類別，再加進 get_source() 就好。
"""
from pathlib import Path
from typing import Protocol

import pandas as pd

from adapters.form import dedupe_headers

from .config import ROOT

DEFAULT_XLSX = ROOT / "data" / "team.xlsx"


class Source(Protocol):
    label: str

    def load(self) -> pd.DataFrame: ...


class XlsxSource:
    def __init__(self, path: Path = DEFAULT_XLSX):
        self.path = Path(path)
        self.label = f"本機檔案 {self.path.name}"

    def load(self) -> pd.DataFrame:
        if not self.path.exists():
            raise FileNotFoundError(
                f"找不到 {self.path}。請把表單匯出的 xlsx 放到這裡，或設定 Google 試算表（見 README）。")
        return pd.read_excel(self.path)


class GoogleSheetSource:
    """用 Google 服務帳號讀試算表。

    secrets.toml 需要：
        [google_sheet]
        url = "https://docs.google.com/spreadsheets/d/..."
        worksheet = "表單回覆 1"      # 可省略，預設第一個工作表
        [gcp_service_account]
        ...服務帳號金鑰 JSON 的所有欄位...
    """

    def __init__(self, url: str, service_account: dict, worksheet: str | None = None):
        self.url, self.service_account, self.worksheet = url, dict(service_account), worksheet
        self.label = "Google 試算表"

    def load(self) -> pd.DataFrame:
        import gspread  # 只有用到試算表才需要安裝

        client = gspread.service_account_from_dict(self.service_account)
        book = client.open_by_url(self.url)
        sheet = book.worksheet(self.worksheet) if self.worksheet else book.sheet1
        rows = sheet.get_all_values()
        if not rows:
            return pd.DataFrame()
        return pd.DataFrame(rows[1:], columns=dedupe_headers(rows[0]))


def get_source(secrets=None) -> Source:
    """依設定選資料來源：有 Google 試算表設定就用它，否則用本機 xlsx。"""
    try:
        gs = secrets["google_sheet"] if secrets is not None else None
        sa = secrets["gcp_service_account"] if secrets is not None else None
    except Exception:  # 沒有 secrets 檔或缺欄位
        gs = sa = None
    if gs and sa:
        return GoogleSheetSource(gs["url"], sa, gs.get("worksheet"))
    return XlsxSource()
