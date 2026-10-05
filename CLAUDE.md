# CLAUDE.md

給在這個 repo 工作的 Claude（例如 VS Code 裡的 Claude Code）看的專案說明。

## 溝通

- 用**繁體中文**回覆。擁有者是資工系大一學生 Evan（林宥成），有 Python 基礎、還在學 CS；說明時用白話，能用足球比喻更好。
- 比較大的改動：先列待辦清單（大分類＋細項），**等確認再動手**。小事直接做。

## 這個專案是什麼

1. **球員卡網站**（已完成、已部署）：從 Google 表單讀球隊球員的自評能力，顯示雷達圖、適合位置球場圖、球員比較。
   - v2 新網站（Next.js，在 `web/`）：https://football-analysis-potato.vercel.app（Vercel，Root Directory = `web`，push 到 main 自動重新部署）；正在取代舊網站，兩個並存到 v2.8。
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
infra/ui/                  theme.py（CSS、圖例）、common.py（共用）、pages/（home 首頁、overview 能力總覽、player、compare、leaderboard、lineup、matches、coach 教練專區）
web/                       v2.2 Next.js 網站（Tools shell，TypeScript）：瀏覽器直接連 Supabase（supabase-js），動作呼叫資料庫函式
  app/                     頁面：首頁、login、join、teams（選球隊）、settings、t/[teamId]/（我的、home、players、players/[playerId]、form 能力表、claim、coach、lineup/matches/practice 即將推出）
  components/              共用元件：ui.tsx（雷達圖、標籤、KPI、提示訊息）、shell.tsx（側邊欄）、position-picker.tsx…
  lib/                     rating.ts（= domain/rating.py 的 TS 版，純計算）、teamview.ts、todos.ts、positions.ts（純計算）；api.ts（所有 Supabase 查詢與 rpc）、status.ts（狀態訊息，跟 backend/accounts.py 一樣）、auth.tsx、team.tsx
  lib/config.json          由 config/settings.toml 產生：py web/scripts/sync_config.py（不要手改）
  tests/                   node --test 的計算測試（npm test）
backend/                   v2 後端（Tools shell）：main.py（FastAPI）、accounts.py（v2.1 帳號 API：加入、教練碼、認領、教練管理）、db.py（as_user = 用使用者身分查詢，RLS 生效）、auth.py（驗證 Supabase JWT）、importer.py（v1 資料匯入）、scripts/（migrate、rls_check）；v2.2 起網站不經過這個 API
supabase/migrations/       v2 資料表與 RLS 的 SQL，編號只能往後加（0004_web.sql：網站用的資料表權限、submit_self_rating）；supabase/tests/ 是權限測試
config/settings.toml       能力分類、表單欄位、位置適合度權重、回饋網址
config/formations.toml     11 人制、8 人制陣型（位置、座標）
config/performance.toml    比賽表現評分的維度與各位置權重（v4 才用）
analysis/                  影片分析腳本（之後）＋ import_match_csv.py
tests/                     test_architecture.py（分層規則）、test_layers.py、test_lineup_ranking.py、test_v13.py、test_v14.py、test_v20.py、test_v21.py、test_v22.py（網站和資料庫對得起來）
docs/PROJECT_PLAN.md       軟工專題規劃
docs/SPEC.md               產品規格與版本規劃
docs/V2_SETUP.md           v2 上線步驟（建表、權限測試、匯入、啟動後端）
docs/V2_1_SETUP.md         v2.1 上線步驟（帳號系統、Google 登入設定、設定系統管理者、試用流程）
docs/V2_2_SETUP.md         v2.2 上線步驟（0004 migration、web/.env.local、npm、Vercel 部署、手機驗收）
```

## UI 風格

專業分析軟體風（深色、數據優先）：背景 #0B1220、卡片 #131C2E、強調色青綠 #2DD4BF、比較用橘 #F59E0B。
配色集中在 `infra/charts/style.py` 和 `.streamlit/config.toml`，改顏色兩邊要一致。
v2 新網站照 v2.1.1 設計稿：字體霞鶩文楷 TC、圓角 10 / 16、強調藍 #60A5FA / #3B82F6、提醒橘 #F5A524；位置三線顏色進攻紅 #F87171、中場綠 #4ADE80、防守黃 #FACC15；擅長綠、不擅長紅虛線、數據推薦藍 ★。樣式在 `web/app/globals.css`。

## 常用指令（Windows，用 `py`，不是 `python`）

```
py -m pip install -r requirements.txt      # 安裝
py -m streamlit run app.py                 # 本機執行（或雙擊 run.bat）
py -m pip install -r requirements-dev.txt  # 測試用套件
py -m pytest                               # 跑測試，改完程式一定要跑

cd web                                     # 新網站（第一次先 npm install，並建立 .env.local）
npm run dev                                # 本機打開 http://localhost:3000
npm test                                   # 計算測試
npm run typecheck                          # 型別檢查，改完網站一定要跑
py web/scripts/sync_config.py              # 改了 config/settings.toml 的能力或權重後執行
```

## 絕對不要

- 不要 commit `.env`（Supabase 金鑰）、`.streamlit/secrets.toml`、`data/` 裡的資料、任何 `*service_account*.json`：裡面有 Google 服務帳號金鑰和隊員個資（`.gitignore` 已排除，改 `.gitignore` 時要小心）。
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

## v2 的規則

- 每張資料表都要開 RLS（`tests/test_v20.py` 會檢查）；權限規則改了要跑 `py -m backend.scripts.rls_check`。
- API 一律用 `db.as_user(conn, user_id)` 查詢，讓資料庫的 RLS 把關；`db.admin()` 只給匯入和建表用。
- 已執行過的 migration 不要改，新增下一號檔案（`0004_xxx.sql`）。
- 加入、兌換教練碼、認領這類「動作」寫成資料庫函式（`security definer` + `set search_path = public`），回傳 `{"status": ...}`，不要 `raise`（輸錯的紀錄才不會被 ROLLBACK）；後端在 `backend/accounts.py` 的 `STATUS` 把 status 翻成 HTTP 狀態碼。
- 新函式要從 `public, anon` 收回執行權限、只給 `authenticated`（`tests/test_v21.py` 會檢查）。
- 只給資料庫函式讀寫、沒有任何 RLS 規則的表（例如 `join_attempts`）要加進 `tests/test_v20.py` 的 `SECRET_TABLES`。
- Team ID 和教練碼的字母表去掉 0 / O、1 / I / L；Team ID 8 碼、教練碼 10 碼。

## v2.2 網站的規則

- 網站只能用 publishable key（`NEXT_PUBLIC_SUPABASE_*`），`web/` 裡不能出現 secret / service_role 金鑰（`tests/test_v22.py` 會檢查）。
- 所有 Supabase 查詢寫在 `web/lib/api.ts`；不用 embed（`teams(*)`），每張表分開查。查的欄位、rpc 名稱和參數名稱 `test_v22.py` 會對照 migration 檢查。
- 新資料表要在新的 migration 裡明確 grant 給 authenticated（0004 先全部收回再給），不要給 TRUNCATE。
- 計算（評分、排序、待辦）寫在 `web/lib/` 的純 TS 檔（不 import React / Supabase），import 時加 `.ts` 副檔名，才能用 `node --test` 測。
- `app/**/page.tsx`、`layout.tsx` 只能 export 預設元件（和 metadata），其他東西放 `lib/` 或 `components/`，不然 build 會失敗。
- 狀態訊息改了要同時改 `web/lib/status.ts` 和 `backend/accounts.py` 的 `STATUS`。

## 下一步（2026-10-05）

- v2.1.1 = 介面設計稿（已完成，在 Design 畫布上），v2.2 網站照它做。
- v2.2（2026-10-05 已部署）：0004 已在 Supabase 執行；本機和 Vercel 都測過；Supabase Site URL 已改成 Vercel 網址。v2.2 標籤已打（GitHub Release）；舊測試頁 `/dev` 已刪。剩：手機 3 分鐘填完驗收。
- v2.2.1：隱私權政策（個資法告知事項）、服務條款、刪除帳號；第一次登入要按同意並記錄版本；管理者建立隊伍前先確認。Google OAuth 同意畫面改成正式版需要隱私權政策網址。
- v2.3 之後：表現評分疊圖、跨賽季比較；v2.4 組隊（拖曳）；v2.5 比賽與出賽登記。

- 使用者之後會裝插畫風格的外掛，再加入手繪 / 人性化的視覺元素。
- 之後：依 `docs/PROJECT_PLAN.md` 的開發順序做影片分析（Video translate 放 `adapters/video.py`，OpenCV/YOLO 放 `infra/video/`）。
