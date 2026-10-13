# 交接說明：v2.8 → v2.9

> 給下一個工作階段（新的 Claude 對話，或 VS Code 裡的 Claude Code）看的。每完成一個小版本或大一點的修補版就整份覆蓋；舊版本留在 git 歷史（`git log -p docs/HANDOFF.md`）。
> 寫於 2026-10-13，對應 main 上的 v2.8 合併 commit `0fc3c28`（之後只多了這份文件和 CLAUDE.md 的更新）。

## 0. 開場怎麼用

新對話第一句貼：

```
讀 StupidLlama/football 的 docs/HANDOFF.md、CLAUDE.md 和 docs/SPEC.md，接著做 v2.9 意見回饋與全隊上線。先列計畫（大分類＋細項）和要我決定的事（用答案表），等我確認再動手。
```

**建議模型**：開場（讀資料、列計畫、回饋資料表和權限設計、舊網站退役的順序）用 **Opus**。計畫確認後，照計畫寫畫面（回饋按鈕、回饋管理頁）、補測試、寫文件可以切 **Sonnet**。助手不能自己換模型：開工前提醒使用者在 App 切換，等使用者說好再開工。

## 1. 專案目標（大方向）

- **Football Analysis Potato**：給業餘足球隊用的免費、開源（AGPL-3.0）網站。現在只有作者自己的球隊（NCKU 資工系隊）在用，之後要開放其他隊。
- 同時是軟體工程課的專題：最終目標是**從比賽影片自動分析**（YOLO 辨識 → 追蹤 → 事件 → 依位置的表現評分）。
- 開發分四個階段（`docs/SPEC.md`「版本規劃」）：
  1. v1.x Streamlit 舊網站（已完成，**v2.9 退役**）
  2. **v2.x 全隊可用的基本功能（不需要影片）← 現在在這裡，v2.8 已完成，下一個是 v2.9**
  3. v3.x 影片分析
  4. v4.x 依位置評分、PR 值、開放其他隊
- v2 剩下的順序：**v2.9 意見回饋（F10）、本隊試用、全隊上線、Google 表單和舊網站退役**（關卡：隊友日常都用新網站）→ **v2.10 視覺改版＋完整資安檢查（v2 最後一版）**。

## 2. 目前線上狀態

| 東西 | 狀態 |
|---|---|
| 正式網站 | https://football-analysis-potato.vercel.app — **v2.8 已上線（main @ `0fc3c28`，2026-10-13）**，用正式網址確認過 v2.8 更新視窗和 `/teams` 賽季分組 |
| 舊網站 | https://football-analysis-potato.streamlit.app（並存到 v2.9，v2.9 退役） |
| 資料庫 | Supabase（東京），migration **0001–0012 都已執行**，`rls_test.sql` 在 Supabase 回報 RLS OK |
| GitHub 標籤 | v1.0–v1.4.2、v2.0、v2.1、v2.2、v2.2.1、v2.4.1、v2.5、v2.6、v2.6.1、v2.7、v2.7.1（已重打在 main）、**v2.8（`0fc3c28`）**。v2.3、v2.6.2 沒打過 |
| 隱私權政策 | **POLICY_VERSION = 2026-10-13**（v2.8 改：隊友看得到同一個系列前幾季的能力表），上線後大家要重新同意一次 |
| 更新紀錄 | `web/lib/updates.ts` 最新是 v2.8（`big: true`，會跳「有新功能」視窗） |
| 測試資料 | 「測試隊」現在有**兩個賽季**：舊賽季（id `226b4199…`，已封存、唯讀）和新賽季（id `77bad98a…`）。可能還留著一個「（未命名）」的組隊草稿。帳號 `林宥成`（網站管理員＋球隊管理員）、`evan`（一般球員）。**只能用測試隊測，絕對不要動「資訊系足」** |

## 3. v2.8 做了什麼（賽季進步追蹤 F8＋出席率）

### 做了哪些決定（使用者在答案表確認過）

1. **一筆 `teams` = 一支球隊的一個賽季**，不拆 `seasons` 表；同一支隊的各賽季共用 `lineage_id`，`prev_team_id` 指向上一季，`archived_at` 有值 = 舊賽季（理由寫在 SPEC F8）。
2. 開新賽季時**名單和帳號自動帶過去**（`players.prev_player_id` 串起同一個人）；**不複製**能力表、比賽、練習、聊天室、陣容。
3. 同一個系列的隊友看得到彼此的進步（所以政策要改、`POLICY_VERSION` 要升）。
4. 球員報告新增「**進步**」分頁。
5. 球隊管理員有**全隊進步排行**（只有管理員看得到）。
6. 每季用**最後一份**能力表代表；同一季較早的幾份可以展開看。
7. 出席率**比賽、練習分開**兩個數字。
8. 只算已結束的場次；**請假不算進分母**；已結束卻沒回覆的**算沒到**。本人看自己、球隊管理員看全隊，一般球員看別人的報告時不顯示。
9. **舊賽季唯讀**：v2.8 就做，由資料庫統一擋。
10. 開新賽季時可以勾選在聊天室發通知（提醒大家重填能力表）。

### 檔案

| 部分 | 檔案 |
|---|---|
| 資料庫 | `supabase/migrations/0012_seasons.sql`：`teams.lineage_id / prev_team_id / archived_at`、`players.prev_player_id`（觸發器 `players_prev_guard`：只有 `start_new_season` 能設）、`season_archived(t)`、觸發器 `season_guard`（舊賽季的寫入一律 raise `season_archived`，掛在所有屬於球隊的資料表上）、`join_team` 對舊賽季回傳 `archived`、`start_new_season`、`progress_chain`、`get_progress`、`get_team_progress`；`export_my_data`、`delete_my_account` 跟著更新。權限測試在 `supabase/tests/rls_test.sql` 的 v2.8 段 |
| 計算（純 TS） | `web/lib/progress.ts`（`buildProgress`、`trendOf`、`categoryTrend`、`latestChange`、`compareTwo`、`teamRanking`）、`web/lib/attendance-rate.ts`（`matchRate`、`practiceRate`、`teamRates`、`rateText`）、`web/lib/seasons.ts`（`groupSeasons`：目前賽季 = 最新的沒封存的一季）；`web/lib/nav.ts` 的 `homeFor` 用它 |
| API | `web/lib/api.ts`：`Team` 型別加欄位、`getProgress`、`getTeamProgress`、`startNewSeason`；`isArchivedError` 把資料庫的 `season_archived` 翻成 `{status: "archived"}`、`ARCHIVED_TEXT`；`getTeamNotes` 跳過舊賽季 |
| 畫面 | `components/progress.tsx`（進步分頁）、`components/attendance-rate.tsx`、`components/season-panel.tsx`（管理專區「賽季」分頁：開新賽季、全隊出席率、進步排行）、`shell.tsx`（舊賽季橫幅、「切換球隊／賽季」）、`app/teams/page.tsx`（賽季分組）；舊賽季把新增比賽／練習、組隊、出席按鈕、聊天室輸入、能力表、管理工具都收起來（`matches`、`matches/[matchId]`、`practice`、`lineup`、`coach`、`form`、`[teamId]/page.tsx`、`attendance-buttons.tsx`、`chat-composer.tsx`） |
| 政策／更新 | `web/lib/policies.ts`（`POLICY_VERSION = "2026-10-13"`）、`app/privacy/page.tsx`（補賽季進步一段）、`web/lib/updates.ts`（v2.8，`big: true`） |
| 測試 | `web/tests/v28.test.ts`、`tests/test_v28.py`（migration 靜態檢查、`GUARDED` 清單、網站↔migration 對照、舊賽季收按鈕）；`test_v27.py`、`test_v271.py`、`test_v261.py` 跟著改 |
| 文件 | `docs/V2_8_SETUP.md`、`docs/SPEC.md`（F8、資料模型）、`CLAUDE.md`（v2.8 規則） |

### 測試結果

- 沙盒 `node --test web/tests/*.test.ts`：**112 項全過**。
- 沙盒 `pytest --continue-on-collection-errors`：**141 passed、3 skipped**；6 個 collection error 全是沙盒沒有 `pandas`（已知）。
- 沙盒 PostgreSQL 跑 `local_shim.sql` → 0001–0012 → `rls_test.sql`：RLS OK；使用者在 Supabase 也跑過，回報「success and rls ok」。
- 使用者電腦：`pytest`、`typecheck`、`npm test` 使用者說「rest are done」（全過）。
- Claude in Chrome（使用者 localhost:3000，測試隊）：開新賽季、名單帶過去、新賽季重填能力表後進步 −0.48、舊賽季橫幅、舊賽季收起管理按鈕（驗收時發現沒收，修好 `9dbdff2`、`f34cb84`）、`/teams` 賽季分組、手機寬（400 視窗）都看過。

### 還沒驗收

- [ ] iPad 寬度：進步分頁的雷達圖和折線圖、管理專區賽季分頁的表格。
- [ ] 一般球員帳號（`evan`）看別人的球員報告：**看不到**出席率卡片；看自己的看得到。
- [ ] 真的有三季以上資料時的趨勢圖（現在測試隊只有兩季）。
- [ ] 開新賽季勾選「發聊天室通知」後，Discord 有沒有收到推播（測試隊沒設 Discord 網址的話不會推）。
- [ ] 正式網站上，大家登入時要跳「重新同意」頁（`POLICY_VERSION` 升了）。

## 4. 下一版：v2.9 意見回饋（F10）＋全隊上線＋舊網站退役

**SPEC**：`docs/SPEC.md` 的「F10 意見回饋」和版本表 v2.9（關卡：**隊友日常都用新網站**，規模 S）。

### F10 意見回饋（SPEC 原文重點）

- 每一頁右下角一個回饋按鈕：選類型（Bug／建議／其他）、寫內容、可附截圖。
- 系統自動附上是誰、哪一頁、哪個版本、什麼裝置。
- 有新回饋時發到管理者的私人 Discord 頻道（Webhook）。
- 「回饋管理」頁只有網站管理員看得到，每則有狀態（新的 → 處理中 → 已解決），回覆會通知填寫的人。
- 不自動開 GitHub Issue（repo 公開）。
- 完成標準：送出後 1 分鐘內 Discord 收到通知；Webhook 網址只放在伺服器設定。

### 已經有的、可以重用的

- **v2.2.1「聯絡我們」幾乎就是 F10 的一半**：`contact_messages` 表（0005）、`send_contact_message` 函式（要登入、一小時最多 5 則）、`web/app/api/contact/route.ts`（伺服器端用 `DISCORD_WEBHOOK_URL` 轉發到 Discord）、`app/contact/page.tsx`。v2.9 要評估「擴充它」還是「另開 feedback 表」。
- `web/lib/updates.ts` 有目前版本號（自動附版本用）；`components/shell.tsx` 是放全站浮動按鈕的地方。
- 網站管理員判斷：`web/lib/policies.ts`、`is_admin`。

### 草稿計畫（開場時跟使用者確認）

1. **資料庫 `0013_feedback.sql`**：回饋狀態欄位（new / doing / done）、管理員回覆、類型、頁面、版本、裝置；動作寫成函式（`send_feedback`、`set_feedback_status`、`reply_feedback`），回傳 `{status}`；收回 `public, anon` 執行權；`export_my_data`、`delete_my_account` 跟著改；`rls_test.sql` 加段落。
2. **網站**：全站右下角回饋按鈕（手機不能擋住聊天室的送出鍵）；回饋表單；「回饋管理」頁（網站管理員）；「我的回饋」看回覆狀態。
3. **截圖**：要嗎？要的話用 Supabase Storage（新的權限面、檔案大小限制、個資），還是 v2.9 先不做截圖。
4. **全隊上線**：寫給隊友的「怎麼加入」說明（Team ID、Google 登入、同意頁、填能力表）；Google 登入從「測試」切到「正式」（`docs/V2_2_1_SETUP.md`，**沒切的話外人登不進來，這是全隊上線的前提**）。
5. **舊網站退役**：Streamlit 網站放公告／轉址到新網站；Google 表單停止收回覆；確認 v1 資料都已匯入 v2（`backend/importer.py`）；repo 裡的 Streamlit 程式碼要不要保留（課程要求的 Clean Architecture 四層、`tests/test_architecture.py` 還在用它）。
6. 上線：`docs/V2_9_SETUP.md`、`updates.ts`（v2.9 `big: true`）、CLAUDE.md、HANDOFF（v2.9 → v2.10）。

### 要先用答案表問使用者的

1. **回饋跟「聯絡我們」**：(a) 合併成一個（聯絡我們升級成回饋）(b) 分開兩個入口 (c) 回饋取代聯絡我們、聯絡我們只留給沒登入的人。
2. **截圖**：(a) v2.9 做（Supabase Storage）(b) 先不做，只寫文字 (c) 只附一個圖片網址。
3. **回覆通知**：(a) 網站內小圓點／「我的回饋」(b) 再加 Email (c) 只在網站內。
4. **誰能回饋**：(a) 只有登入的人 (b) 沒登入也可以（要防垃圾訊息）。
5. **舊網站**：(a) v2.9 直接關掉（Streamlit 停用）(b) 留著但首頁只放「搬家了」公告＋連結 (c) 再並存一段時間。
6. **Streamlit 程式碼**：(a) 留在 repo（課程要看）(b) 移到 `legacy/` (c) 刪掉。
7. **全隊上線時間**：哪天開始讓隊友用？要不要先找 2～3 個隊友試用（SPEC 寫「本隊試用」）？
8. 還沒回答的舊問題：多語系放 v2.10 之前或之後（助手建議之後）；練習加到 Google 日曆（`.ics`）、提醒通知放 v2.9 還是 v2.10。

### 注意

- 新 migration 是 **`0013_xxx.sql`**；新表要開 RLS、明確 grant 給 authenticated（不給 TRUNCATE）、**掛 `season_guard`**（如果是屬於球隊的資料；回饋是屬於使用者的、不屬於球隊，大概不用掛，但要在 `tests/test_v28.py` 的 `GUARDED` 說明原因）。只給函式讀寫、沒有 RLS 規則的表加進 `tests/test_v20.py` 的 `SECRET_TABLES`。
- Discord Webhook 只能在 `app/api/**/route.ts` 用，不能加 `NEXT_PUBLIC_`。回饋的 Webhook 要不要跟聯絡我們共用同一個，要問使用者。
- 狀態訊息同時改 `web/lib/status.ts` 和 `backend/accounts.py` 的 `STATUS`。
- 用詞：「網站管理員」「球隊管理員」，不要寫「教練」「系統管理者」。
- 如果收集「裝置」資訊，隱私權政策要補一段，評估要不要升 `POLICY_VERSION`（v2.8 剛升過，大家剛同意完；可以只改文字、不升版本，像 v2.7 那樣——要問使用者）。

## 5. 使用者的習慣（一定要照做）

- 用**繁體中文**回覆；使用者是 NCKU 資工大一，Python 有基礎、還在學；用白話，能用足球比喻更好。
- **大改動先列待辦清單（大分類＋細項），等使用者確認再動手**；小事直接做。
- **要使用者做決定時，給「答案表」**（可以只回編號的表單）。使用者常用英文、只回數字或很短的話（例如「yes / sure / yes / you do it」），照題號對應；可能有錯字，照上下文判斷。
- **叫使用者跑指令時，給可以直接複製貼上的程式碼區塊**，一行一個指令，第一行固定是：
  ```powershell
  cd "$env:USERPROFILE\Desktop\軟工\football-team-site"
  ```
  （**不要用 `git rev-parse --show-toplevel`**，中文路徑在 PowerShell 會變亂碼。使用者的終端機常常已經在 `web` 資料夾裡，所以**不要再寫 `cd web`**，改用完整路徑 `cd "$env:USERPROFILE\Desktop\軟工\football-team-site\web"`；git 指令可以用 `git -C ..`。）
- **用圖片之前先問**。
- 做完要**在瀏覽器實際測過**；優先用 Claude in Chrome 操作使用者的 `localhost:3000`，**只用「測試隊」**。
- 開工前如果這項工作適合換模型，**先提醒使用者在 App 切換**，等使用者說好再開工。
- **合併前先問使用者測試是不是全部通過**。
- **標籤要在合併到 main 之後才打**，Target 選 `main`；給使用者 Release title 和 Description。
- 使用者常用 iPad 看網站：只靠滑鼠 hover 的提示要改成畫面上看得到的文字。
- 使用者有新的 skill `prompt-for-other-ai`：要請他用 Gemini／GPT 生圖（例如 v2.10 的 Logo）時，可以用它產生提示詞。

## 6. 環境注意事項（踩過的坑）

**使用者的電腦**
- Windows，VS Code 繁中版，PowerShell。`npm` 要打 **`npm.cmd`**；Python 用 `py`。
- 專案資料夾：`C:\Users\user\Desktop\軟工\football-team-site`（是「軟工」，繁體）。
- 使用者常常已經開著 `npm run dev`：不用重開，切分支後重新整理就好。出現「Another next dev server is already running」或跑到 3001 port：
  ```powershell
  taskkill /F /IM node.exe
  npm.cmd run dev
  ```
- 使用者在分支上時，本機可能**沒 pull 到最新**（v2.8 驗收時畫面是舊的）：先 `git pull origin vX.Y`。
- 使用者有時會開到**正式網站**而不是 `localhost`，看不到新功能時先確認網址。Vercel 預覽網址用 Google 登入會跳回正式網站（Supabase Redirect URLs 白名單），**不要加萬用字元**。
- 使用者的帳號是**網站管理員**（`is_admin`），在任何隊都看得到管理工具；要測一般球員畫面用 `evan` 帳號。
- 助手**沒辦法 pull 到使用者電腦**，只能 push 到 GitHub，請使用者自己 `git pull`。

**雲端工作環境（助手的沙盒）**
- 連不到 npm（403）、pip 裝不了、沒有 `pandas`、沒有 `py`：完整 `pytest`、`npm run typecheck`、`npm run build` 要在使用者電腦上跑。
- pytest：`/root/.local/bin/pytest -q --continue-on-collection-errors`（缺 pandas 的 6 個檔案會 collection error）。**`pytest | tail` 的結束碼是 tail 的**，要自己看輸出。
- 有全域 `tsc`，但沒有 React／Next 型別：只能 grep 自己改的檔案找真的錯。
- `node --test web/tests/*.test.ts` 可以直接跑。
- **本機 PostgreSQL 16**：`service postgresql start` 後，用 `su postgres -c "psql ..."` 依序跑 `supabase/tests/local_shim.sql` → `supabase/migrations/0*.sql` → `supabase/tests/rls_test.sql`，看到 `RLS OK` 才請使用者在 Supabase 執行新 migration。檔案先複製到 `/tmp` 給 postgres 讀。
- push 分支和 main 都可以；**push tag 會 403**，標籤要使用者在 GitHub 網頁打。`gh` 只能用 REST（`gh api repos/StupidLlama/football/...`）。
- 開新分支：`git switch -c vX.Y origin/main`，推：`git push -u origin vX.Y`。

**Claude in Chrome**
- 先 `tabs_context_mcp(createIfEmpty: true)`，在**自己的新分頁**測。
- `screenshot`／`left_click` 有時逾時：改用 `javascript_tool`（`element.click()`、讀 `innerText`；React 輸入框要用原生 setter + `input` 事件）。逾時 2～3 次就停下來請使用者幫忙點。捲動後的截圖有時是舊的，用頁面文字確認。
- 視窗用 `resize_window` 縮到 390 時，實際可視寬度大約 400；360 寬用 `document.documentElement.style.zoom = String(400/360)` 模擬。iframe 模擬手機會被擋。
- `ConfirmButton`（按兩下才執行，4 秒後失效）：兩次點擊要放在**同一個** `browser_batch` 裡。
- `<dialog>` 確認視窗用 `document.querySelector('dialog[open]')` 找按鈕。**不要觸發瀏覽器原生的 `beforeunload` 對話框**。
- 登入由使用者自己做；助手不輸入密碼、不填金鑰。

**上線流程**
- 新功能放 `vX.Y` 分支，不要直接 push main。
- 寫程式 → 沙盒 PostgreSQL 跑 rls_test → 使用者在 Supabase 執行 migration + rls_test → 使用者電腦跑測試 → Claude in Chrome 在 localhost 驗收（測試隊）→ **問使用者測試是否全部通過** → 合併 main → 用正式網址確認 → 使用者打標籤 → `updates.ts`／CLAUDE.md／HANDOFF。

## 7. 待辦（不屬於 v2.9，但別忘了）

- 第 3 節「還沒驗收」那幾項。
- 測試隊的殘留資料（兩個賽季、未命名的組隊草稿）：要不要清，問使用者。
- v2.7.1 交接說明裡的「還沒驗收」（離開保護確認視窗、更新紀錄小圓點、iPad 組隊賽制說明）沒有回報結果。
- v2.6.1／v2.6.2 兌換管理員碼的畫面還沒親眼驗收；v2.6 真的 Discord 推播、真的手機；v2.5 系際聯賽賽程一鍵帶入。
- v2.3、v2.6.2 沒打過標籤（可打可不打）。
- **v2.10**（v2 最後一版，內容在 SPEC 版本表）：C「戰情室」視覺改版、新 Logo（馬鈴薯足球是使用者用 Gemini 生成的圖，改版時請使用者提供原檔）、圖表捲到才播動畫、未登入首頁三人傳球動畫、**完整資安檢查**寫成 `docs/SECURITY_REVIEW.md`（適合 Opus）。示範稿在使用者的 Design 畫布「Potato 視覺改版示範」。
- 球場「自由擺放」先不做，有空可以再提。
- 使用者之後會裝插畫風格的外掛，加入手繪／人性化的視覺元素。
- v3：影片分析照 `docs/PROJECT_PLAN.md`。
