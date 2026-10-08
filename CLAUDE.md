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
  app/                     頁面：首頁、login、join、teams（選球隊）、settings、t/[teamId]/（我的、home、players、players/[playerId]、form 能力表、claim、coach 管理專區、lineup/matches/practice 即將推出）；v2.2.1：consent（同意頁）、privacy、terms、contact、api/contact/route.ts（伺服器端，轉發到 Discord）
  components/              共用元件：ui.tsx（雷達圖＋滑鼠移上去顯示分數、標籤、KPI、提示訊息、頁尾）、anim.tsx（useTween、AnimatedNumber：圖表動畫，尊重「減少動態效果」）、line-chart.tsx（生涯趨勢折線圖）、career.tsx（球員報告的生涯分頁）、shell.tsx（側邊欄）、guard.tsx（RequireLogin：要登入＋同意最新政策）、doc.tsx（政策頁版面）、position-picker.tsx…
  lib/                     rating.ts（= domain/rating.py 的 TS 版，純計算）、teamview.ts、todos.ts、positions.ts、career.ts（生涯時間線）、compare.ts（同位置平均、進步退步）、anim.ts（緩動、插值）（純計算）；api.ts（所有 Supabase 查詢與 rpc）、policies.ts（POLICY_VERSION、網站管理員、資料存放地區）、status.ts（狀態訊息，跟 backend/accounts.py 一樣）、auth.tsx、team.tsx
  lib/config.json          由 config/settings.toml 產生：py web/scripts/sync_config.py（不要手改）
  tests/                   node --test 的計算測試（npm test）
backend/                   v2 後端（Tools shell）：main.py（FastAPI）、accounts.py（v2.1 帳號 API：加入、教練碼、認領、教練管理）、db.py（as_user = 用使用者身分查詢，RLS 生效）、auth.py（驗證 Supabase JWT）、importer.py（v1 資料匯入）、scripts/（migrate、rls_check）；v2.2 起網站不經過這個 API
supabase/migrations/       v2 資料表與 RLS 的 SQL，編號只能往後加（0004_web.sql：網站用的資料表權限、submit_self_rating；0005_privacy.sql：同意紀錄、刪除帳號、下載資料、聯絡訊息；0006_career.sql：生涯開關 career_shared、set_career_shared、get_career）；supabase/tests/ 是權限測試
config/settings.toml       能力分類、表單欄位、位置適合度權重、回饋網址
config/formations.toml     11 人制、8 人制陣型（位置、座標）
config/performance.toml    比賽表現評分的維度與各位置權重（v4 才用）
analysis/                  影片分析腳本（之後）＋ import_match_csv.py
tests/                     test_architecture.py（分層規則）、test_layers.py、test_lineup_ranking.py、test_v13.py、test_v14.py、test_v20.py、test_v21.py、test_v22.py（網站和資料庫對得起來）、test_v221.py（政策、同意、刪帳號、安全標頭）、test_v23.py（生涯、雷達切換、同位置比較、動畫）
docs/PROJECT_PLAN.md       軟工專題規劃
docs/SPEC.md               產品規格與版本規劃
docs/V2_SETUP.md           v2 上線步驟（建表、權限測試、匯入、啟動後端）
docs/V2_1_SETUP.md         v2.1 上線步驟（帳號系統、Google 登入設定、設定系統管理者、試用流程）
docs/V2_2_SETUP.md         v2.2 上線步驟（0004 migration、web/.env.local、npm、Vercel 部署、手機驗收）
docs/V2_2_1_SETUP.md       v2.2.1 上線步驟（0005、Discord Webhook、Vercel 環境變數、Google 登入正式版）
docs/V2_3_SETUP.md         v2.3 上線步驟（0006、手機驗收、合併到 main、打標籤）
docs/V2_5_SETUP.md         v2.5 上線步驟（0008、比賽列表與出賽登記驗收、合併到 main、打標籤）
docs/V2_6_SETUP.md         v2.6 上線步驟（0009、聊天室與 Discord 通知驗收、合併到 main、打標籤）
docs/SECURITY.md           金鑰保管、換金鑰、個資外洩處理順序
docs/HANDOFF.md            交接說明：上一版做了什麼、下一版要做什麼、環境的坑（新工作階段先讀它）
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
- 用詞：畫面上叫「球隊管理員」「管理員碼」「管理專區」「網站管理員」，不要寫「教練」「系統管理者」（`test_v221.py` 會檢查）；資料庫的角色值仍是 `coach`。政策裡不寫擁有者真名。
- 登入後的頁面都用 `RequireLogin` 包起來（會檢查同意版本）。政策內容有實質改變時，改 `web/lib/policies.ts` 的 `POLICY_VERSION`，大家下次登入會重新同意。
- 需要秘密的東西（目前只有 `DISCORD_WEBHOOK_URL`）只能用在 `app/api/**/route.ts`，不能加 `NEXT_PUBLIC_`。
- 圖表動畫一律用 `components/anim.tsx` 的 `useTween` / `AnimatedNumber` 或 globals.css 的 `.line-draw` `.pop-in` `.fade-up`；新的 CSS 動畫要加進 `@media (prefers-reduced-motion: reduce)` 關掉（`test_v23.py` 會檢查）。
- 跨隊的資料只能經過資料庫函式拿（例如 `get_career`），不要放寬 RLS 讓別隊的表直接讀得到。
- 手機版版面改動後，用 360 和 390 像素寬檢查：沒有左右捲動、雷達圖能力名稱不重疊。

## v2.4 組隊的規則

- 排人演算法（加分扣分、位置適合度比對）寫在 `domain/`、`stats/lineup.py`（Python 版）和 `web/lib/lineup.ts`／`assignment.ts`（網站版），兩邊邏輯要一致；改規則後重新產生 `web/tests/fixtures/lineup_cases.json`（`py web/scripts/lineup_fixture.py`），讓 `web/tests/v24.test.ts` 能對照 Python 的答案驗證。加分扣分數字只能放 `config/settings.toml` 的 `[lineup]`，不要寫死。
- 分享連結只能透過 `get_shared_lineup` 這一個函式讀（唯一 grant 給 anon 的函式），回傳欄位要白名單（背號、位置、隊名、陣型），絕對不能有球員 id、能力分數、是誰排的；新加欄位要同時檢查 `tests/test_v24.py` 的白名單測試。
- 官方陣容（`kind='official'`）只有球隊管理員能存/刪；草稿（`kind='draft'`）只有自己能存/刪/分享，規則在 `save_lineup`／`delete_lineup`／`set_lineup_share` 裡，不要放寬 RLS。
- 球場座標系統：105×68 公尺，進攻方向朝右（x 大 = 進攻方向），SVG 的 y 軸是往下的，畫的時候要用 `W - y` 反過來。

## 版本交接規則

**什麼時候寫交接說明（`docs/HANDOFF.md`，整份覆蓋）**
- 小版本完成：第二個數字變了（v2.3 → v2.4），上線、打好標籤之後。
- 階段切換（v2.x → v3.0）：一樣要寫，而且**更詳細**：整個階段的成果和沒做完的、資料庫全部的表和函式、下一階段要用的新工具和新環境、風險。
- 大的修補版（有新 migration、改政策、改權限、改很多畫面，例如 v2.2.1）：也要寫。
- 小的修 bug（只改幾行、沒動資料庫）：不用寫，在 commit 和 CLAUDE.md「下一步」記一行就好。

**交接說明要有**：開場指令和建議模型、專案目標、目前線上狀態、這一版的功能和檔案、測試結果、還沒驗收的、下一版的 SPEC 和計畫草稿、要先問使用者的決定、使用者的習慣、環境的坑。
寫完 commit、push，再告訴使用者：開一個新對話，貼上 HANDOFF.md 第 0 節的開場指令。

**模型**
- 助手不能切換自己的模型。開始一項工作前，如果它適合換模型，**先提醒使用者在 App 切換，等使用者說好再開工**：
  - 規劃、架構、資料庫和權限設計、難的 bug、寫交接說明 → Opus
  - 照確認過的計畫寫畫面、補測試、改文件、小修 → Sonnet
- 可以獨立完成的雜事交給子代理並指定便宜的模型：找檔案、讀大量文件、整理測試輸出 → Haiku；照清楚規格的小改動 → Sonnet。需要整段對話脈絡的工作（設計、除錯）留在主對話。

## 下一步（2026-10-08）

- v2.2 / v2.2.1：已上線（見 `docs/V2_2_1_SETUP.md` 的剩餘事項：Google 登入正式版、v2.2.1 標籤）。
- v2.3：已上線（main，從來沒打過 GitHub 標籤，不影響功能，有空再補）。還沒用真實資料測過：兩位球員比較的變形動畫、隊友看別人的生涯、兩個時間點比較。
- v2.4 組隊（F3）：**已上線（main，標籤 `v2.4.1`）**。
- **v2.5 比賽列表＋出賽登記（F7）：程式已寫完在 `v2.5` 分支，還沒合併到 main、還沒上線。** 0008 migration 和 rls_test 使用者已經在 Supabase 執行過、通過。步驟和驗收清單在 `docs/V2_5_SETUP.md`（本機測試 → 桌機/手機驗收 → 合併到 main → 打標籤）。
- **v2.6 隊伍聊天室（F6）：程式已寫完在 `v2.6` 分支，還沒合併到 main、還沒上線。** 0009 migration 和 rls_test 使用者已經在 Supabase 執行過、通過（`RLS OK`）。沙盒這次跑過 `pytest` 和 `node --test`（不需要 `node_modules`）全部通過，但 `npm run typecheck`、兩分頁即時更新、手機版、Discord Webhook 的真實測試都還沒做。步驟和驗收清單在 `docs/V2_6_SETUP.md`。
- 這兩版都因為沙盒連不到 npm registry（`npm install` 會被 403 擋掉），`npm run typecheck`／`npm test`（真的裝了套件之後）／手機實測、真實瀏覽器測試都要在使用者電腦上做一次（連結電腦後可以用 Claude in Chrome 直接操作使用者的 `localhost:3000`，`device_bash` 是獨立 VM、不是使用者電腦，不能拿來跑 `npm`／`pytest`）。
- 下一版 v2.7：賽季進步追蹤（F8）；之後語言設定（多語系）。
- 使用者問過「球場上能不能自由擺放（不限定 11 個位置框）」，討論後決定 v2.4.1 先不做，先維持「拖到固定位置框互換」。有空可以再提出來討論要不要做。

- 使用者之後會裝插畫風格的外掛，再加入手繪 / 人性化的視覺元素。
- 之後：依 `docs/PROJECT_PLAN.md` 的開發順序做影片分析（Video translate 放 `adapters/video.py`，OpenCV/YOLO 放 `infra/video/`）。
