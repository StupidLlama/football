# CLAUDE.md

給在這個 repo 工作的 Claude（例如 VS Code 裡的 Claude Code）看的專案說明。

## 溝通

- 用**繁體中文**回覆。擁有者是資工系大一學生 Evan（林宥成），有 Python 基礎、還在學 CS；說明時用白話，能用足球比喻更好。
- 比較大的改動：先列待辦清單（大分類＋細項），**等確認再動手**。小事直接做。

## 這個專案是什麼

1. **球員卡網站**（已完成、已部署）：從 Google 表單讀球隊球員的自評能力，顯示雷達圖、適合位置球場圖、球員比較。
   - 正式網站：https://football-analysis-potato.streamlit.app（有隊伍密碼）
   - GitHub：StupidLlama/football（push 到 main 會自動重新部署）
2. **足球比賽影片分析**（軟工課專題，規劃中）：影片 → 辨識 → 數據 → 圖表。
   **完整規劃在 `docs/PROJECT_PLAN.md`，做影片分析相關的工作前先讀它。**
3. **產品規格與版本規劃在 `docs/SPEC.md`**（v1.x → v4.x）。新功能先對照規格裡的版本表。

## 架構原則（課程要求：Clean Architecture）

- 四層：Core（規則）→ Inner shell（統計）→ Translate shell（轉換）→ Tools shell（OpenCV、YOLO、SQLite、Streamlit）。
- **依賴只能往內**。核心與統計層只用純 Python，不能 import `cv2`、`streamlit`、`sqlite3`、`gspread`、`matplotlib`。
- 資料夾就是四層：`domain/`（Core）、`stats/`（Inner shell）、`adapters/`（Translate shell）、`infra/`（Tools shell）。`tests/test_architecture.py` 會擋下違規的 import。
- 新功能先想清楚屬於哪一層；規則、公式放 domain / stats，畫面和工具放 infra。

## 資料夾

```
app.py                     入口：頁面導覽、隊伍密碼（網站名稱 Football Analysis Potato 🥔）
domain/                    Core：models.py、rating.py、positions.py、foot.py（慣用腳）、formations.py（陣型）、performance.py（表現評分權重）、fixture.py（聯賽比賽、裁判任務）
stats/                     Inner shell：player.py、team.py、match.py、ranking.py（排行榜）、lineup.py + assignment.py（自動排人）、schedule.py（戰績、裁判任務）、referee.py（抽裁判，Picker 可替換）
adapters/                  Translate shell：form.py（表單翻譯）、repository.py（資料庫讀寫）、schedule.py（系際聯賽賽程表 → Fixture，修年份、合併儲存格）
infra/config.py            讀 config/*.toml → RatingRules、FormSpec、陣型、表現評分規則
infra/db.py                SQLite 連線；MIGRATIONS 只能往後加
infra/sources.py           Google 試算表（有 secrets 時）/ data/team.xlsx
infra/pipeline.py          組裝：來源 → 翻譯 → 資料庫
infra/schedule.py          賽程來源（Google 試算表 / data/schedule.xlsx）、裁判名單存檔（DutyStore 可替換）
infra/coach.py             教練檢查（v1 密碼，v2 換帳號）
infra/charts/              style.py 深色配色、radar.py（Plotly 雷達圖，圖例由網頁畫）、bars.py、pitch.py、lineup.py（陣容球場圖＋下載 PNG）、feet.py（雙腳 SVG）
infra/ui/                  theme.py（CSS、圖例）、common.py（共用）、pages/（home 首頁、overview 能力總覽、player、compare、leaderboard、lineup、matches）
config/settings.toml       能力分類、表單欄位、位置適合度權重、回饋網址
config/formations.toml     11 人制、8 人制陣型（位置、座標）
config/performance.toml    比賽表現評分的維度與各位置權重（v4 才用）
analysis/                  影片分析腳本（之後）＋ import_match_csv.py
tests/                     test_architecture.py（分層規則）、test_layers.py、test_lineup_ranking.py、test_v13.py、test_v14.py
docs/PROJECT_PLAN.md       軟工專題規劃
docs/SPEC.md               產品規格與版本規劃
```

## UI 風格

專業分析軟體風（深色、數據優先）：背景 #0B1220、卡片 #131C2E、強調色青綠 #2DD4BF、比較用橘 #F59E0B。
配色集中在 `infra/charts/style.py` 和 `.streamlit/config.toml`，改顏色兩邊要一致。

## 常用指令（Windows，用 `py`，不是 `python`）

```
py -m pip install -r requirements.txt      # 安裝
py -m streamlit run app.py                 # 本機執行（或雙擊 run.bat）
py -m pip install -r requirements-dev.txt  # 測試用套件
py -m pytest                               # 跑測試，改完程式一定要跑
```

## 絕對不要

- 不要 commit `.streamlit/secrets.toml`、`data/` 裡的資料、任何 `*service_account*.json`：裡面有 Google 服務帳號金鑰和隊員個資（`.gitignore` 已排除，改 `.gitignore` 時要小心）。
- repo 是**公開**的（AGPL-3.0）：程式碼、設定檔、測試裡不要出現隊員的真實姓名或任何個資；有名字的設定放 secrets。
- 不要改舊的資料庫 migration，只能在 `MIGRATIONS` 最後面新增。
- 表單欄位名稱、能力、權重寫在 `config/settings.toml`，不要寫死在程式裡。

## 已知的資料細節

- Google 試算表「資訊系足 (回覆)」，工作表「表單回覆 1」；有兩個欄位都叫 `Weak Foot`（左右腳、弱腳分數），讀取時第二個會自動改名 `Weak Foot 2`。
- 時間格式是「2026/9/29 下午 2:33:09」，`adapters/form.py` 的 `parse_timestamps` 會處理。
- 同一人重複填表只保留最新一筆。
- 第一個 `Weak Foot` 欄位是「哪一腳是弱腳」，自由填寫（左 / Left / 左腳 / Lesft…），`adapters/form.py` 的 `parse_side` 整理成 left / right；看不出來就是空字串。
- 畫面上暱稱一律另外用灰色小字或獨立的「暱稱」欄顯示，不要寫成「名字（暱稱）」。

## 賽程表的資料細節

- 系際聯賽賽程表：分頁「上學期賽程表」，標題列有 場次 / 輪次 / 日期 / 星期 / 時間 / 主場 / 比分 / 客場 / 主審 / 邊審 / 邊審 / 備註。
- 同一天第二場的日期是空白（合併儲存格）；年份常打錯，用「星期」欄修正；星期有時寫成注音「ㄧ」。
- 我們隊名是「資訊」（`[team] name`）；主審 / 邊審欄寫「資訊」= 我們要派人。

## 下一步（2026-10-01）

- 使用者之後會裝插畫風格的外掛，再加入手繪 / 人性化的視覺元素。
- 之後：依 `docs/PROJECT_PLAN.md` 的開發順序做影片分析（Video translate 放 `adapters/video.py`，OpenCV/YOLO 放 `infra/video/`）。
