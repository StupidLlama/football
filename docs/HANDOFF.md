# 交接說明：v2 → v3（階段切換）

> 給下一個工作階段（新的 Claude 對話，或 VS Code 裡的 Claude Code）看的。每完成一個小版本或大一點的修補版就整份覆蓋；舊版本留在 git 歷史（`git log -p docs/HANDOFF.md`）。
> 寫於 2026-10-22，對應 main 上的 v2.11 commit `1a9819b`。這是**階段切換**（v2 網站 → v3 影片分析），照 CLAUDE.md 的規定寫得比平常詳細。

## 0. 開場怎麼用

新對話第一句貼：

```
讀 StupidLlama/football 的 docs/HANDOFF.md、CLAUDE.md、docs/SPEC.md 和 docs/PROJECT_PLAN.md，接著做 v3.0（影片分析排隊、品質檢查、Colab）。先列計畫（大分類＋細項）和要我決定的事（用答案表），等我確認再動手。
```

**建議模型**
- v3.0 開場：資料表、權限、「Colab 怎麼用使用者身分登入」這些設計 → **Opus**。
- 照確認過的計畫寫 OpenCV 量測、測試、網站畫面 → **Sonnet**。
- 讀 SoccerNet／Ultralytics 文件、整理測試輸出 → 子代理用 **Haiku**。
- 助手不能自己換模型：開工前提醒使用者在 App 切換，等使用者說好再開工。

## 1. 專案目標（大方向）

- **Football Analysis Potato**：給業餘足球隊用的免費、開源（AGPL-3.0）網站。現在只有作者的球隊（NCKU 資工系隊）在用，v4.3 才開放其他隊。
- 同時是軟體工程課（李信杰老師，Fall 2026）的專題：最終目標是**從比賽影片自動分析**（YOLO 辨識 → 追蹤 → 事件 → 依位置的表現評分）。**期限：學期末**（使用者 2026-10-22 說的，確切日期還沒有）。
- 四個階段（`docs/SPEC.md`「版本規劃」）：v1.x Streamlit（已退役）→ v2.x 全隊可用的網站（**已完成**）→ **v3.x 影片分析 ← 現在要開始** → v4.x 依位置評分、PR 值、教練片段、開放其他隊。

## 2. 目前線上狀態

| 東西 | 狀態 |
|---|---|
| 正式網站 | https://football-analysis-potato.vercel.app — **v2.11 已上線（main @ `1a9819b`，2026-10-22）**，`/updates` 顯示 v2.11（`big: true`） |
| 舊網站 | Streamlit 只顯示搬家公告（`config/settings.toml` 的 `[site] moved_to`） |
| 資料庫 | Supabase（東京，免費方案），migration **0001–0014 都已執行**，`rls_test.sql` RLS OK |
| Supabase Auth | Email 確認開、密碼最短 8、擋外洩密碼開 |
| GitHub 標籤 | 到 `v2.10`。**`v2.11` 還沒打**（使用者在 GitHub 網頁打，Target 選 main） |
| 隱私權政策 | `POLICY_VERSION = 2026-10-13` |
| 分支 | `v2.11` = `main`；`v3.0` 從 main 開（只多了這份文件和 CLAUDE.md 的更新） |
| 測試資料 | 只能用「測試隊」測，**絕對不要動「資訊系足」** |

## 3. v2 整個階段的成果

### 每一版

| 版本 | 內容 | 標籤 |
|---|---|---|
| v2.0 | Supabase 資料表、RLS、FastAPI、匯入 Google 表單舊資料 | — |
| v2.1 | 帳號、Team ID 加入、多隊、管理員碼、認領名單 | — |
| v2.2 / v2.2.1 | Next.js 網站（直接連 Supabase）、內建能力表、政策與同意、下載資料、刪帳號、聯絡我們 | — |
| v2.3 | 生涯、雷達切換、同位置比較、圖表動畫 | 沒打 |
| v2.4 | 組隊（拖曳、鎖定、分享連結、陣容圖） | `v2.4.1` |
| v2.5 | 比賽列表、出賽登記 | `v2.5` |
| v2.6 / v2.6.1 / v2.6.2 | 聊天室＋Discord；名單管理；管理員碼入口 | `v2.6`、`v2.6.1` |
| v2.7 / v2.7.1 | 練習月曆與出席、AI 匯入；返回鍵、更新紀錄、離開保護 | `v2.7`、`v2.7.1` |
| v2.8 | 賽季（lineage）、進步追蹤、出席率 | `v2.8` |
| v2.9 | 意見回饋、加到日曆（.ics）、舊網站退役 | `v2.9` |
| v2.10 | 完整資安檢查（`docs/SECURITY_REVIEW.md`） | `v2.10` |
| v2.11 | 視覺改版 C「戰情室」、新 Logo、捲到才播動畫、Android「加到 Google 日曆」 | **還沒打** |

### v2.11 做了什麼（6 個 commit，`v2.10..main`，42 個檔案）

- 戰情室配色與字體（`web/app/globals.css`、`next/font`：霞鶩文楷 TC、思源黑體、Barlow Semi Condensed、Kaushan Script）；規則已寫進 CLAUDE.md「UI 風格」。
- Logo：`components/ui.tsx` 的 `Logo`、`web/public/logo.png`（使用者提供）、`app/icon.svg`。
- 拿掉卡片樣式（參考 FotMob、Sofascore）：KPI 一條、列表用分隔線。
- 位置圖改成橫向全場、左右邊路分開、每個位置畫活動範圍框、位置名稱寫在框中間。
- 比賽卡片、評分顏色、隱私權政策文字（沒升 `POLICY_VERSION`）。
- 測試：`web/tests/v211.test.ts`。

### 沒做完、移到之後的

- **未登入首頁「轉播」動畫（三人傳球）**：另一個討論串做了示範稿（Artifact `2b6dPVkcDGuZQoAdysvzr3`），使用者決定做成 **v2.11.1** 小修，不併進 v3.0。使用者電腦的 `v2.11` 分支上有還沒 commit 的 `web/lib/pass-loop.ts`、`web/tests/v211.test.ts` 改動，應該就是它，**不要動、不要覆蓋**。
- **多語系**（原本的 v2.12）：往後排，v3 期間不做。
- **左右邊位置分開存**：資料庫現在把「LB/RB」這類存成一個選項。要改能力表、球員報告、組隊和 Python；往後排（v4.0 依位置評分前要決定）。
- 回饋截圖、可訂閱日曆網址：評估過、沒排版本（`SECURITY_REVIEW.md`）。
- 提醒推播：等 LINE 機器人。
- 球場「自由擺放」：先不做。

## 4. 資料庫全貌（給 v3 加表時對照）

### 資料表（20 張，全部開 RLS）

| 表 | 一筆是什麼 | 加於 |
|---|---|---|
| `teams` | 一支球隊的**一個賽季**（`lineage_id` 串同一支隊、`prev_team_id`、`archived_at`） | 0001、0012 |
| `team_secrets` | 管理員碼、Team ID 的秘密資料（只給函式） | 0003 |
| `profiles` | 帳號顯示名稱、`is_admin` | 0001 |
| `memberships` | 帳號在某隊的身分（`coach` / `player`） | 0001 |
| `players` | 名單上的一位球員（背號、隊長、`prev_player_id`、`career_shared`） | 0001 |
| `ability_ratings` | 一份能力自評（只能用 `submit_self_rating` 寫） | 0001 |
| `coach_codes`、`coach_code_guard`、`join_attempts` | 管理員碼、輸錯紀錄、加入嘗試（只給函式） | 0003 |
| `fixtures`、`duties` | 系際聯賽賽程、裁判任務 | 0001 |
| `matches`、`attendance` | 比賽、出賽登記 | 0001、0008 |
| `lineups` | 陣容（`official` / `draft`、分享權杖） | 0007 |
| `messages`、`chat_reads`、`chat_discord` | 聊天室、已讀、Discord 設定 | 0009 |
| `practices`、`practice_attendance` | 練習、練習出席 | 0011 |
| `contact_messages` | 意見回饋（不另開 feedback 表） | 0005、0013 |

### 函式（都是 `security definer` + 固定 `search_path`，回傳 `{"status": ...}`）

- 身分判斷：`is_member`、`is_coach`、`is_own_player`、`is_admin`、`can_manage`、`shares_team`、`can_edit_lineup`
- 帳號與球隊：`admin_create_team`、`join_team`、`leave_team`、`remove_member`、`reset_team_code`、`create_coach_code`、`redeem_coach_code`、`revoke_coach_code`、`unban_coach_code`、`demote_coach`、`request_claim`、`decide_claim`、`add_player`、`edit_player`、`delete_unlinked_player`
- 能力與生涯：`submit_self_rating`、`get_career`、`set_career_shared`、`get_progress`、`get_team_progress`、`start_new_season`
- 組隊與比賽：`save_lineup`、`delete_lineup`、`set_lineup_share`、`get_shared_lineup`（**唯一給 anon 的函式**）、`save_match`、`delete_match`、`set_attendance`、`match_from_fixture`
- 聊天室：`post_message`、`edit_message`、`delete_message`、`set_pinned`、`mark_chat_read`、`get_chat_discord`、`set_chat_discord`、`notify_discord`
- 練習：`save_practice`、`save_practices`、`delete_practice`、`set_practice_attendance`、`practice_announce`、`attendance_who`
- 隱私與回饋：`accept_policies`、`export_my_data`、`delete_my_account`、`send_contact_message`、`set_feedback_status`、`reply_feedback`、`mark_feedback_read`
- 觸發器：`season_guard`（舊賽季唯讀，0012 掛到所有屬於球隊的表）、`players_guard`、`players_prev_guard`、`handle_new_user`

### v3 加新表時一定要做（測試會擋）

1. 新 migration `0015_xxx.sql`，**不改舊的**。
2. 開 RLS；從 `public, anon` 收回、明確 grant 給 `authenticated`（不給 TRUNCATE）。
3. 寫入只用 `security definer` 函式（檢查身分、長度、次數），不開放直接 insert／update／delete。
4. 屬於球隊的表掛 `season_guard`（`tests/test_v28.py` 的 GUARDED）。
5. 決定放不放進 `export_my_data`（`tests/test_v210.py` 的 `PERSONAL_TABLES` / `NOT_PERSONAL`）；刪帳號時要不要一起刪。
6. 只給函式讀寫的表加進 `tests/test_v20.py` 的 `SECRET_TABLES`。
7. 跑 `rls_test.sql`（最後的總檢查會抓沒開 RLS、給 anon 的權限、沒固定 `search_path`）。

## 5. 下一版：v3.0（影片分析排隊、品質檢查）

**SPEC**：`docs/SPEC.md` 版本表 v3.0（規模 M）。完成條件：比賽顯示「已結束 · 分析中」和進度。

### 使用者已經決定的（2026-10-22）

1. 下一版是 **v3.0**（多語系、左右邊位置往後排）。
2. **影片不經過網站**：Supabase 免費方案單檔上限 50 MB、總共 1 GB，一場 1080p 好幾 GB。分析在 **Google Colab** 跑，只把進度和結果寫回資料庫。
3. **其他隊的球隊管理員也要能用**：同一份 Colab 筆記本放在 repo，管理員用自己的 Google 帳號跑、影片放自己的 Google Drive；筆記本裡用**自己的 Potato 帳號登入**（不用共用的 service_role 金鑰），資料庫函式檢查他是那一隊的球隊管理員。一般球員只看進度和結果。v4.3 開放其他隊時再考慮換成付費雲端 GPU（分析程式在 Tools shell，可以換）。
4. 使用者的筆電**沒有 NVIDIA 顯卡** → GPU 工作全部在 Colab。
5. **本隊比賽還沒拍**：v3.0 先用網路上的比賽影片測（有版權，不進 repo、不公開散布）。
6. 期限：學期末。

### 計畫草稿（開場時跟使用者確認）

完整草稿在專案資料夾的 `v3.0_plan.md`（2026-10-22 給使用者看過）。重點：

1. **Core**：`domain/video.py` 品質規則（解析度 ≥1920×1080、幀率 25–60、長度 ≤120 分鐘、模糊／亮度／晃動／場地線門檻 → 合格／可信度低／拒絕＋原因）；門檻放 `config/settings.toml` 的 `[video]`。
2. **量測**：`infra/video/probe.py`、`infra/video/quality.py`（OpenCV：Laplacian 變異數、亮度、前後格差異、Hough 直線）；`adapters/video.py` 翻譯成 Core 格式。測試用 numpy 畫的假畫面。
3. **資料庫** `0015_video.sql`：`match_videos`（比賽、球隊、檔名、長度、幀率、解析度、品質等級、原因、狀態 排隊中／處理中／待確認／失敗／完成、進度、建立者）；函式 `create_video_job`、`cancel_video_job`、`report_video_job`（都檢查球隊管理員）；掛 `season_guard`。
4. **Colab**：`analysis/run_job.py` ＋ 筆記本：登入 → 選一個排隊中的工作 → 從 Drive 讀影片 → 品質檢查 → 回報進度和結果。v3.0 只做到品質檢查，YOLO 留給 v3.1。
5. **網站**：比賽頁顯示狀態和進度（Realtime＋輪詢）、失敗原因用白話、「建立影片分析」表單、「怎麼拍比賽影片」說明頁；照戰情室風格。
6. **政策與文件**：隱私權政策補影片段落；`docs/V3_0_SETUP.md`、CLAUDE.md「v3 影片的規則」、`updates.ts`。

### 要先用答案表問使用者的

1. **Colab 怎麼登入**：(a) 筆記本裡輸入 Email／密碼，用 supabase-py 登入（使用者自己輸入，助手不碰密碼） (b) 網站產生一次性的「分析權杖」（有期限、只能回報那一個工作），貼進筆記本 (c) 先用使用者自己的 service_role 金鑰（只有作者能用，其他隊之後再說）。建議 (b)：Google 登入的帳號沒有密碼，(a) 不能用。
2. **網路影片從哪裡來**：使用者自己挑一場、放 Google Drive？還是先申請 SoccerNet（要 NDA，v3.1 也會用到）？
3. **品質檢查門檻**：網路轉播影片會切鏡頭、會縮放，照 SPEC 會被標成「可信度低」。v3.0 要不要加一個「轉播影片」模式？
4. **進度怎麼算**：處理到第幾秒 ÷ 影片總長，可以嗎？
5. 隱私權政策要不要升 `POLICY_VERSION`（影片不經過我們的伺服器，只存檔名和品質數字，建議只補文字、不升）。

## 6. v3 的新工具和新環境

| 東西 | 用途 | 注意 |
|---|---|---|
| Google Colab（免費 GPU） | 跑分析程式 | 每日 GPU 時數有上限；分頁關掉或閒置太久會斷線；工作要能「從中斷的地方重來」或至少失敗時回報 |
| Google Drive | 放影片 | Colab 用 `drive.mount`；影片不進 git |
| OpenCV（`opencv-python`） | 讀影片、取格、品質量測、透視轉換（v3.2） | 只在 `infra/video/`；`requirements.txt` 還沒有，要加 |
| Ultralytics YOLO | v3.1 辨識球員和球 | **AGPL-3.0**，跟 repo 授權一樣，OK |
| ByteTrack / BoT-SORT | v3.1 追蹤 | 內建在 Ultralytics |
| supabase-py | Colab 回報進度 | 用使用者身分，不用 service_role（見第 5 節第 1 題） |
| SoccerNet | v3.1 以後的訓練與考卷 | 要在 Hugging Face 申請、同意 NDA，只能研究用；**建議現在就請使用者申請** |
| StatsBomb Open Data | 事件定義、校正評分 | 沒有影片 |

**架構（照 `docs/PROJECT_PLAN.md`）**：`infra/video` 辨識 → `adapters/video.py` 翻譯成事件 → 存資料庫 → `stats/` 統計 → 網站顯示。`domain/`、`stats/` 不能 import `cv2`（`tests/test_architecture.py`）。PROJECT_PLAN 寫的是 SQLite＋Streamlit，**v2 起改成 Supabase＋Next.js**，影片分析結果也存 Supabase。

## 7. 風險

| 風險 | 影響 | 備案 |
|---|---|---|
| 學期末來不及做完 v3.0–v3.4 | 課程 Demo 不完整 | 照 PROJECT_PLAN「先做 3 個數據」：跑動距離（最簡單）→ 控球率 → 傳球成功率；每版都能 Demo |
| Colab 斷線、GPU 時數用完 | 一場跑不完 | 每秒只取幾格；分段處理、記錄做到哪；v3.0 先只做品質檢查（不用 GPU） |
| 網路轉播影片和業餘固定鏡頭差很多 | 測得準不代表本隊影片準 | 盡快拍一場本隊比賽（腳架、高處、1080p，**先取得隊友同意**），人工標記 10 分鐘當考卷 |
| 讓其他隊用 Colab 要登入 | 權杖外洩 = 別人能改進度 | 權杖有期限、只能回報一個工作、只存雜湊值（跟管理員碼一樣） |
| 影片版權 | 不能公開網路影片 | 網路影片只在自己的 Drive，不進 repo、不放網站 |
| Supabase 免費方案一週沒人用會暫停 | Demo 當天網站掛掉 | Demo 前一天登入一次 |

## 8. 測試結果（2026-10-22，使用者電腦，main @ `1a9819b` ＋ 動畫的未 commit 改動）

- `py -m pytest`：343 passed。
- `npm test`：134 項全過。
- typecheck、build、Supabase rls_test：v2.11 上線時跑過（這次沒重跑）。

## 9. 使用者的習慣（一定要照做）

- 用**繁體中文**回覆；使用者是 NCKU 資工大一，Python 有基礎、還在學；用白話，能用足球比喻更好。使用者常用英文、只回數字或很短的話（例如「3. no 4. use online ones」），照題號對應。
- **大改動先列待辦清單（大分類＋細項），等使用者確認再動手**；小事直接做。
- **要使用者做決定時，給「答案表」**（可以只回編號）。
- **叫使用者跑指令時，給可以直接複製貼上的程式碼區塊**，一行一個指令，第一行固定是：
  ```powershell
  cd "$env:USERPROFILE\Desktop\軟工\football-team-site"
  ```
  （不要用 `git rev-parse --show-toplevel`；不要寫 `cd web`，用完整路徑。）
- **用圖片之前先問**。
- 喜歡 FotMob／Sofascore 那種平的畫面，不要 AI 風格的卡片。
- 做完要**在瀏覽器實際測過**，**只用「測試隊」**。使用者也會用手機測正式網站。
- 開工前如果適合換模型，**先提醒使用者在 App 切換**。
- **合併前先問測試是不是全部通過**；**標籤在合併到 main 之後才打**（Target 選 main），給使用者 Release title 和 Description。
- 使用者會要「context」：給一段可以貼到新對話的現況摘要（程式碼區塊）。
- 使用者常用 iPad／iPhone：只靠 hover 的提示要改成畫面上看得到的文字。
- 使用者有 skill `prompt-for-other-ai`（生圖、寫給別的 AI 的提示詞）、`football-security-review`（每版上線前的資安檢查）。

## 10. 環境注意事項（踩過的坑）

**使用者的電腦**
- Windows、PowerShell；`npm` 要打 **`npm.cmd`**；Python 用 `py`。專案資料夾 `C:\Users\user\Desktop\軟工\football-team-site`。
- 助手現在可以直接在使用者電腦上跑指令（Remote Control）：pytest、npm test 都能跑。**同一個資料夾可能有別的討論串在改**（例如 v2.11.1 動畫），切分支、`git reset`、`git stash` 之前先看 `git status`，不要動別人的未 commit 改動。
- 使用者常開著 `npm run dev`；卡住時 `taskkill /F /IM node.exe` 再 `npm.cmd run dev`。
- Google 登入會跳回正式網站：手機測試直接用正式網站；Vercel 預覽網址的 Redirect 不要加萬用字元。
- 使用者的帳號是**網站管理員**；測一般球員畫面用 `evan` 帳號。

**Colab（v3 新的）**
- Colab 的 Python 版本和使用者電腦不同：`domain/`、`stats/` 只用標準函式庫，兩邊都能跑。
- 金鑰／權杖放 **Colab Secrets**，不寫在筆記本裡（筆記本會進 repo）。
- 筆記本進 repo 前清掉輸出（裡面可能有影片畫面、球員名字）。

**雲端沙盒（如果在雲端工作）**
- 連不到 npm（403）、沒有 pandas；有 PostgreSQL 16（`local_shim.sql` → migrations → `rls_test.sql`），檔案要複製到 postgres 讀得到的資料夾。
- push tag 會 403，標籤要使用者在 GitHub 網頁打。commit 作者用 `Claude <noreply@anthropic.com>`。

**Claude in Chrome**
- 自己開新分頁測；`screenshot` 逾時就改 `javascript_tool`；`<dialog>` 用 `document.querySelector('dialog[open]')`；不要觸發 `beforeunload`；登入由使用者自己做。

**上線流程**
- 新功能放 `vX.Y` 分支 → 沙盒或本機跑 rls_test → 使用者在 Supabase 執行 migration + rls_test → 使用者電腦跑 pytest、npm test、typecheck、build → localhost 驗收（測試隊）→ **問使用者測試是否全部通過** → 合併 main → 等 Vercel success → 正式網址確認 → 使用者打標籤 → `updates.ts`／CLAUDE.md／HANDOFF。

## 11. 待辦（不屬於 v3.0，但別忘了）

- [ ] 使用者：GitHub 打標籤 `v2.11`（Target：main）。
- [ ] 使用者：`V2_10_SETUP.md` 第 6 節（清空 Streamlit secrets、停用 Google 服務帳號金鑰）。
- [ ] v2.11.1：未登入首頁轉播動畫（另一個討論串）。
- [ ] 使用者：申請 SoccerNet；拍一場本隊比賽（先取得隊友同意）。
- [ ] v2.9 的驗收：iPhone Safari 加到日曆、Discord 1 分鐘內收到回饋、`evan` 看回覆、關 Google 表單、貼加入訊息到隊群組。
- [ ] v2.8 的驗收：iPad 寬度、三季以上的趨勢圖。
- [ ] 往後排：多語系、左右邊位置分開存、回饋截圖、可訂閱日曆、LINE 機器人提醒。
