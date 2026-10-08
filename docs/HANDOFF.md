# 交接說明：v2.6.1 → v2.7

> 給下一個工作階段（新的 Claude 對話，或 VS Code 裡的 Claude Code）看的。每完成一個小版本或大一點的修補版就整份覆蓋；舊版本留在 git 歷史（`git log -p docs/HANDOFF.md`）。
> 寫於 2026-10-08，對應 main 上的 `d9a93ac`（v2.6.1 已上線；標籤 `v2.6.1` 請使用者在 GitHub 網頁打，Target `main`）。

## 0. 開場怎麼用

新對話第一句貼：

```
讀 StupidLlama/football 的 docs/HANDOFF.md、CLAUDE.md 和 docs/SPEC.md，接著做 v2.7。先列計畫（大分類＋細項），等我確認再動手。
```

**建議模型**：開場（讀資料、列計畫、資料表與權限設計、AI 匯入的格式設計）用 **Opus**。計畫確認後，照計畫寫月曆畫面、補測試可以切 **Sonnet**。切換要使用者在 App 裡手動做，助手要在開工前提醒、等使用者說好再開工。

## 1. 專案目標（大方向）

- **Football Analysis Potato**：給業餘足球隊用的免費、開源（AGPL-3.0）網站。現在只有作者自己的球隊（NCKU 資工系隊）在用，之後要開放其他隊。
- 同時是軟體工程課的專題：最終目標是**從比賽影片自動分析**（YOLO 辨識 → 追蹤 → 事件 → 依位置的表現評分）。
- 開發分四個階段（`docs/SPEC.md`「版本規劃」）：
  1. v1.x Streamlit 舊網站（已完成，v2.9 退役）
  2. **v2.x 全隊可用的基本功能（不需要影片）← 現在在這裡，v2.6.1 已完成**
  3. v3.x 影片分析
  4. v4.x 依位置評分、PR 值、開放其他隊
- 原則：跟影片無關的功能全部在 **v2.9** 前做完（2026-10-08 版本往後挪一號，見第 4 節）。

## 2. 目前線上狀態

| 東西 | 狀態 |
|---|---|
| 正式網站 | https://football-analysis-potato.vercel.app — **v2.6.1 已上線（main @ `d9a93ac`）**。使用者自己合併、push 到 `de697f2`；最後一個小修（手機背號欄位，`d9a93ac`）是助手 fast-forward 到 main 的 |
| 舊網站 | https://football-analysis-potato.streamlit.app（並存到 v2.9） |
| 資料庫 | Supabase（東京），migration **0001–0010 都已執行**（0010 由使用者執行，網站上新增球員成功＝確認生效） |
| GitHub 標籤 | v1.0–v1.4.2、v2.0、v2.1、v2.2、v2.2.1、v2.4.1、v2.5、v2.6（打在 `8c7e177`）。**v2.6.1 還沒打**。v2.3 從來沒打過 |
| 隱私權政策 | POLICY_VERSION = 2026-10-08（v2.6 改版，加了聊天室與 Discord）；v2.6.1 沒有改政策 |
| 測試資料 | 「測試隊」：帳號 `林宥成`（球隊管理員，名單上是隊長 #10）、`evan`（球員）；名單多了「測試球員一」#7、「測試球員二」#8 副隊長（v2.6.1 驗收時建立，可以在「能力表進度」刪掉） |

## 3. v2.6 和 v2.6.1 做了什麼

### v2.6 隊伍聊天室（F6）

所有人發一般貼文和回覆（只有一層）；球隊管理員發筆記／戰術（可附正式陣容）、置頂最多 5 則；刪除＝清空留殼；Supabase Realtime + 30 秒輪詢；選用的 Discord Webhook（新主貼文才推）。細節見 `docs/V2_6_SETUP.md`、`supabase/migrations/0009_chat.sql`。

### v2.6.1 名單管理（SPEC F6.1）

- 「管理專區」所有人都看得到：一般球員進去只有「成為球隊管理員」（輸入管理員碼，用 v2.1 就有的 `redeem_coach_code`）；球隊管理員最下面有一行小字說明怎麼讓別人升級。
- 新分頁「球員名單」：球隊管理員新增球員、改姓名／背號／隊長／副隊長。同隊背號不重複（0–999，`07` 存成 `7`）、C 和 VC 各一位；只在有改到的欄位檢查（舊資料重複不卡住）。隊長可以同時是球隊管理員（兩個欄位本來就無關）。
- 順便帶上 v2.6 標籤之後才修的 Discord 提示文字。

**討論過、確認的決定**（使用者用答案表回覆的）
- 兌換管理員碼放在管理專區頁面本身。
- 編輯球員只開放姓名、背號、隊長／副隊長；暱稱、位置、慣用腳還是球員自己改。
- 背號、隊長要擋重複；換隊長要先把原本的人改成「無」。
- AI 排練習：**網站不串 AI**（見第 4 節）。
- 練習：月曆＋點日期編輯＋**出席登記**（使用者後來補充要出席）。
- 版本：E/F 兩項放 v2.7，賽季進步追蹤挪到 v2.8，全隊上線挪到 v2.9。

### 檔案

| 檔案 | 內容 |
|---|---|
| `supabase/migrations/0010_roster.sql` | `add_player`、`edit_player`（security definer，回傳 status），共用 `roster_problem`、`clean_jersey`（登入的人不能直接呼叫） |
| `supabase/tests/rls_test.sql` | 最後面多一段「v2.6.1 名單管理」 |
| `web/lib/roster.ts` | 瀏覽器端同一套檢查（`rosterProblem`、`cleanJersey`、`sortRoster`），純 TS |
| `web/lib/api.ts` | `addPlayer`、`editPlayer` |
| `web/app/t/[teamId]/coach/page.tsx` | `Redeem`（非管理員看到的）、`Roster` + `PlayerForm`（球員名單分頁） |
| `web/components/shell.tsx` | 「管理專區」對所有人顯示（紅點只給管理員） |
| `tests/test_v261.py`、`web/tests/v261.test.ts` | 靜態檢查、`roster.ts` 測試 |
| `docs/SPEC.md` | 新增 F6.1、F11，版本表 v2.6.1／v2.7／v2.8／v2.9 |
| `docs/V2_6_1_SETUP.md` | 上線步驟和驗收清單 |

### 測試結果

- 沙盒本機 PostgreSQL 16：0001–0010 + 完整 `rls_test.sql` → `RLS OK`。
- 沙盒 `node --test`：58 項全過；沙盒 `pytest`（沒有 pandas 的 6 個檔案跑不了）：其餘全過。
- 使用者電腦：使用者說「pushed」前有跑 `py -m pytest`、`npm.cmd run typecheck`（沒有回報錯誤，但沒有明確說全部通過——下次合併前要先問清楚）。
- Claude in Chrome 在使用者 `localhost:3000` 測過：新增（07 → #7）、背號重複、第二位隊長被擋、副隊長、隊長交接、管理員同時是隊長、排序、手機 400 寬（360 用頁面縮放模擬）。

### 還沒驗收

- **一般球員輸入管理員碼的畫面**：使用者第一次去看時開到正式網站（當時還沒合併），之後就直接合併了，沒有回報結果。上線後可以請使用者用 `evan` 帳號在正式網站測一次（輸錯一次看提示 → 輸對 → 同一頁變成管理工具）。
- 真的手機。

## 4. 下一版：v2.7 練習行事曆與出席（SPEC F11）

**SPEC**：`docs/SPEC.md` 的「F11 練習行事曆與出席（v2.7）」。重點：

- 「練習」頁（現在是 `web/app/t/[teamId]/practice/page.tsx` 的 `<ComingSoon>`）改成**月曆**；球隊管理員點日期新增／編輯／刪除練習：日期、開始／結束時間、地點、集合時間、內容／要帶的東西、備註；可以一次建立「每週幾、到哪天」的固定練習。
- **出席登記**：同 v2.5 比賽的規則（`in`／`out`、開始後鎖定、管理員可以更正）；首頁「我的待辦」提醒下一次練習還沒回覆。
- **AI 匯入（網站不串接 AI API）**：管理員填基本資訊（隊名、學期、球場…）→ 網站產生一段「給 AI 的指令」→ 管理員連同課表／賽程圖片貼給自己的 AI → AI 回固定格式文字 → 貼回網站 → 解析、**預覽**、確認後才建立；格式錯的行標出來，不要整批失敗。
- 完成標準：手機 1 分鐘內改好一次練習；照格式回來的文字 100% 解析。

**還沒決定、要先問使用者的**（用答案表問，見第 5 節）

- **資料表**：練習另開 `practices` + `practice_attendance`，還是把現有的 `matches`／`attendance` 加一個 `kind`（比賽／練習）？另開比較乾淨；共用可以重用 `set_attendance`、首頁「下一場」的程式。需要權衡（建議另開，但出席規則抽成共用的 SQL 小工具）。
- **固定練習**：建立時就展開成一筆一筆（好改單次、好記出席），還是存規則再算？（建議展開，最多一學期約 20 筆）
- **AI 回傳格式**：CSV 一行一筆（`日期,開始,結束,地點,集合,內容,備註`）還是 JSON？CSV 對人和 AI 都好讀；JSON 比較不會被逗號搞壞。指令裡要不要附範例和「不確定就留空、不要猜」的規則。
- **月曆元件**：自己寫（純 TS 算日期格子放 `web/lib/`，比較好測）還是用套件（沙盒裝不了，要使用者電腦裝）？建議自己寫。
- 練習要不要也發到聊天室／Discord（例如新增或改時間時自動發一則筆記）？
- 聯賽比賽日要不要在月曆上一起顯示（灰色、不能編輯）？

**已經有的東西可以參考**

- v2.5 `matches`／`attendance`／`set_attendance`（`0008_matches.sql`）和 `web/lib/matches.ts`、`web/app/t/[teamId]/matches/`：出席規則、鎖定、管理員代登記都一樣。
- v2.6.1 `roster_problem` 的寫法：檢查函式回傳 `jsonb`／null，不 raise，revoke 掉直接呼叫。
- `web/lib/todos.ts`：首頁待辦。

## 5. 使用者的習慣（一定要照做）

- 用**繁體中文**回覆；使用者是 NCKU 資工大一，Python 有基礎、還在學；用白話，能用足球比喻更好。
- **大改動先列待辦清單（大分類＋細項），等使用者確認再動手**；小事直接做。
- **要使用者做決定時，給「答案表」**（表格：題號／問題／編號選項，可以只回編號）。使用者的回答有時是英文、編號跟題號對應，可能有打錯字，照上下文判斷；真的看不懂再問。
- **叫使用者跑指令時，給可以直接複製貼上的程式碼區塊**，一行一個指令，第一行固定是：
  ```powershell
  cd "$env:USERPROFILE\Desktop\軟工\football-team-site"
  ```
  （repo 在 `C:\Users\user\Desktop\軟工\football-team-site`；**不要用 `git rev-parse --show-toplevel`**，中文路徑在 PowerShell 會變亂碼；也不要假設使用者在哪個資料夾。）
- **用圖片之前先問**。
- 做完要**在瀏覽器實際測過**；優先用 Claude in Chrome 操作使用者的 `localhost:3000`。
- 開工前如果這項工作適合換模型，**先提醒使用者在 App 切換**，等使用者說好再開工。
- 合併前**先問使用者測試是不是全部通過**。

## 6. 環境注意事項（踩過的坑）

**使用者的電腦**
- Windows，VS Code 繁中版，PowerShell。`npm` 要打 **`npm.cmd`**；Python 用 `py`。
- 使用者常常已經開著 `npm run dev`（再開會出現「Another next dev server is already running」）：不用重開，切分支後會自動更新，重新整理就好。
- 使用者有時會開到**正式網站**而不是 `localhost`，看不到新功能時先確認網址。
- 使用者的 Chrome 有 Grammarly：Next.js 開發模式左下角的「1 Issue」（hydration mismatch，`data-gr-ext-installed`）是外掛造成的，不用修。
- 使用者的帳號是**網站管理員**（`is_admin`），在任何隊都看得到管理工具；要測「一般球員」畫面要用 `evan` 帳號。

**雲端工作環境（助手的沙盒）**
- 連不到 npm（403）、pip 裝不了、沒有 `pandas`：完整 `pytest`、`npm run typecheck`、`npm test`（真的套件）、`npm run build` 要在使用者電腦上跑。
- 有 pytest：`/root/.local/bin/pytest -q --continue-on-collection-errors`（缺 pandas 的 6 個檔案會 collection error，其他照跑）。
- 有全域 `tsc`（`/home/claude/.npm-global/bin/tsc`），但沒有 React／Next 型別：`tsc --noEmit -p web` 只能 grep 自己改的檔案看有沒有真的型別錯誤。
- `node --test web/tests/*.test.ts` 可以直接跑（Node 22 內建型別剝除）。
- **本機 PostgreSQL 16**：`service postgresql start` 後，用 `su postgres -c "psql ..."` 依序跑 `supabase/tests/local_shim.sql` → `supabase/migrations/0*.sql` → `supabase/tests/rls_test.sql`，看到 `RLS OK` 才請使用者在 Supabase 執行新 migration。檔案要先複製到 `/tmp` 給 postgres 使用者讀。v2.6.1 有一支腳本做這件事（在助手的 scratchpad，新工作階段不會留著，照這個順序重寫就好）。
- push 分支和 main 都可以；**push tag 會 403**，標籤要使用者在 GitHub 網頁打。`gh` 沒登入。
- 開新分支時用 `git switch -c vX.Y origin/main`，**推的時候用 `git push -u origin vX.Y`**；如果 stop hook 說「有未推送的 commit」但 `git ls-remote origin vX.Y` 跟 `HEAD` 一樣，是本機的遠端追蹤紀錄沒更新：`git fetch origin vX.Y:refs/remotes/origin/vX.Y` 就好。

**Claude in Chrome**
- 先 `tabs_context_mcp(createIfEmpty: true)`，在**自己的新分頁**測；使用者自己開的分頁不在可操作的分頁群組裡。
- `screenshot`／`left_click` 有時逾時（使用者切走視窗時常發生）：改用 `javascript_tool`（`element.click()`、`document.querySelector('main').innerText`；React 輸入框要用原生 setter + `input` 事件）照樣能測完。
- **縮視窗**：`createIfEmpty` 開出來的**新視窗**可以 `resize_window`，但最窄只有 **400**；360 寬用 `document.documentElement.style.zoom = String(400/360)` 模擬。網站有安全標頭，**不能用 iframe** 嵌自己。
- `ConfirmButton`（按兩下才執行）：兩次點擊要放在**同一個** `browser_batch` 裡，不然 4 秒會過期。
- 登入由使用者自己做；助手不輸入密碼、不填金鑰。

**上線流程**
- 新功能放 `vX.Y` 分支，不要直接 push main。
- 寫程式 → 沙盒 PostgreSQL 跑 rls_test → 使用者在 Supabase 執行 migration + rls_test → 使用者電腦跑測試 → Claude in Chrome 在 localhost 驗收 → **問使用者測試是否全部通過** → 合併 main → 用正式網址確認 → 寫 HANDOFF。

## 7. 待辦（不屬於 v2.7，但別忘了）

- 打 `v2.6.1` 標籤（Target `main`，對應 `d9a93ac`）。
- v2.6.1 一般球員兌換管理員碼的畫面還沒親眼驗收（見第 3 節）。
- v2.6 還沒驗收的：真的 Discord 推播收到訊息、真的手機。
- v2.5 還沒驗收的：系際聯賽賽程一鍵帶入、分享連結含比賽資訊、真的手機。
- v2.2.1 剩：Google 登入從「測試」切成「正式」（`docs/V2_2_1_SETUP.md`）。
- v2.3 從來沒打過 GitHub 標籤。
- 球場「自由擺放」先不做（v2.4.1 時討論過）。
- 使用者之後會裝插畫風格的外掛，加入手繪／人性化的視覺元素。
- 之後：語言設定（多語系）；影片分析照 `docs/PROJECT_PLAN.md`。
