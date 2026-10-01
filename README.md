# 🥔 Football Analysis Potato

專業分析風的球隊網站：球隊總覽、球員報告（互動雷達圖、隊內排名、位置適合度）、球員比較，
並預留「比賽數據」頁給之後的影片分析（軟工專題，規劃見 `docs/PROJECT_PLAN.md`）。

## 本機執行（Windows）

第一次先安裝套件：
```
py -m pip install -r requirements.txt
```
之後每次執行（或直接雙擊 `run.bat`）：
```
py -m streamlit run app.py
```

## 資料夾結構：照 Clean Architecture 分四層

```
domain/     Core           比賽規則、評分規則（純 Python）
stats/      Inner shell    球員 / 球隊 / 比賽統計（純 Python）
adapters/   Translate      表單翻譯、資料庫讀寫、（之後）影片翻譯
infra/      Tools shell    Streamlit 畫面、Plotly 圖表、SQLite、Google 試算表、（之後）OpenCV/YOLO
config/settings.toml       ★ 能力、表單欄位、位置權重等設定
config/formations.toml     陣型（組隊頁用）
app.py                     入口
tests/                     自動測試（含分層規則檢查）
```

依賴只能往內：`domain/`、`stats/` 不能 import pandas、streamlit、sqlite3 這些工具，
`tests/test_architecture.py` 會自動檢查。

## 資料怎麼來

程式會自動選資料來源：
- 有設定 Google 試算表（`.streamlit/secrets.toml`）→ **直接讀表單的回覆試算表**，隊員填完表單，網站最多 5 分鐘內更新（側邊欄按「重新載入資料」可立即更新）
- 沒設定 → 讀本機的 `data/team.xlsx`

設定方式請看 `.streamlit/secrets.toml.example`。

## 常見修改

| 想做的事 | 改哪裡 |
|---|---|
| 調整位置適合度的權重 | `config/settings.toml` 的 `[positions.XX]` |
| 推薦位置取前幾名 | `config/settings.toml` 的 `[recommend] top_n` |
| 新增或調整陣型 | `config/formations.toml`（加一段 `[[formations]]`） |
| 組隊時自評擅長加幾分、不擅長扣幾分 | `stats/lineup.py` 的 `GOOD_BONUS`、`BAD_PENALTY` |
| 表單新增一題能力 | `config/settings.toml` 對應類別加一行 |
| 表單題目改名 | `config/settings.toml` 的 `[form]` 或能力的 `column` |
| 手動改某人「給球隊的話」 | `.streamlit/secrets.toml` 的 `[message_overrides]`（有名字，不放進 GitHub）；網站上則貼到 Streamlit Cloud 的 Secrets |
| 側邊欄的意見回饋按鈕 | `config/settings.toml` 的 `[feedback] url`（空白就不顯示） |
| 新增一個頁面 | 在 `infra/ui/pages/` 新增 `.py` 檔，再加進 `app.py` 的 `PAGES` |
| 資料庫加欄位 / 資料表 | `infra/db.py` 的 `MIGRATIONS` 最後面**新增**一段 SQL |
| 改配色 | `infra/charts/style.py` 和 `.streamlit/config.toml` |
| 匯入比賽數據 | 見 `analysis/README.md` |

## 測試

改完程式跑一次，確認沒改壞：
```
py -m pip install -r requirements-dev.txt
py -m pytest
```

## 隊伍密碼

在 `.streamlit/secrets.toml` 設定 `team_password`，網站就會要求密碼；沒設定就不需要（方便本機測試）。

⚠️ `.gitignore` 已排除 `data/` 裡的資料檔、`secrets.toml` 和金鑰檔，隊員個資不會被上傳到 GitHub。

## 授權

本專案採用 GNU AGPL-3.0（見 `LICENSE`）。之後影片分析會用到 Ultralytics YOLO，它是 AGPL-3.0，所以專案也用同一個授權並公開原始碼。
