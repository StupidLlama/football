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
| 設定球員背號 | `.streamlit/secrets.toml` 的 `[jersey_numbers]`（`"名字" = 7`）；網站上貼到 Streamlit Cloud 的 Secrets |
| 慣用腳的題目改名 | `config/settings.toml` 的 `[form] weak_side` |
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
| 我們隊在賽程表上的名字 | `config/settings.toml` 的 `[team] name` |
| 讀賽程表的哪個分頁、裁判名單存哪個分頁 | `config/settings.toml` 的 `[schedule]` |
| 隊長 / 副隊長 | `.streamlit/secrets.toml` 的 `[roles]`（`"名字" = "C"` / `"VC"`） |
| 抽裁判的規則 | `stats/referee.py`（寫一個新的 Picker 或傳 `eligible`） |

## 測試

改完程式跑一次，確認沒改壞：
```
py -m pip install -r requirements-dev.txt
py -m pytest
```

## 賽程與裁判任務（v1.4）

- 賽程：secrets 有 `[schedule] url`（系際聯賽賽程表的 Google 試算表網址）就讀它，否則讀本機 `data/schedule.xlsx`。
  服務帳號要有這份試算表的**編輯**權限（抽完的裁判名單會寫進「裁判」分頁）。
- 首頁的比賽結果直接看賽程表的「比分」欄，填 `3:1` 這種格式就好。
- 教練功能：secrets 設定 `coach_password`，首頁「教練：排裁判」輸入密碼後可以隨機抽、手動改、儲存。沒設定就不顯示。

## 隊伍密碼

在 `.streamlit/secrets.toml` 設定 `team_password`，網站就會要求密碼；沒設定就不需要（方便本機測試）。

⚠️ `.gitignore` 已排除 `data/` 裡的資料檔、`secrets.toml` 和金鑰檔，隊員個資不會被上傳到 GitHub。

## 授權

本專案採用 GNU AGPL-3.0（見 `LICENSE`）。之後影片分析會用到 Ultralytics YOLO，它是 AGPL-3.0，所以專案也用同一個授權並公開原始碼。
