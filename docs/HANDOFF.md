# 交接說明：v2.7.1 → v2.8

> 給下一個工作階段（新的 Claude 對話，或 VS Code 裡的 Claude Code）看的。每完成一個小版本或大一點的修補版就整份覆蓋；舊版本留在 git 歷史（`git log -p docs/HANDOFF.md`）。
> 寫於 2026-10-12，對應 main 上的 v2.7.1 合併 commit `9d67c2c`（之後只多了這份文件和 CLAUDE.md 的更新）。

## 0. 開場怎麼用

新對話第一句貼：

```
讀 StupidLlama/football 的 docs/HANDOFF.md、CLAUDE.md 和 docs/SPEC.md，接著做 v2.8 賽季進步追蹤。先列計畫（大分類＋細項）和要我決定的事（用答案表），等我確認再動手。
```

**建議模型**：開場（讀資料、列計畫、**賽季資料表怎麼拆**、權限設計）用 **Opus**。計畫確認後，照計畫寫畫面（趨勢圖、出席率）、補測試、寫文件可以切 **Sonnet**。助手不能自己換模型：開工前提醒使用者在 App 切換，等使用者說好再開工。

## 1. 專案目標（大方向）

- **Football Analysis Potato**：給業餘足球隊用的免費、開源（AGPL-3.0）網站。現在只有作者自己的球隊（NCKU 資工系隊）在用，之後要開放其他隊。
- 同時是軟體工程課的專題：最終目標是**從比賽影片自動分析**（YOLO 辨識 → 追蹤 → 事件 → 依位置的表現評分）。
- 開發分四個階段（`docs/SPEC.md`「版本規劃」）：
  1. v1.x Streamlit 舊網站（已完成，v2.9 退役）
  2. **v2.x 全隊可用的基本功能（不需要影片）← 現在在這裡，v2.7.1 已完成，下一個是 v2.8**
  3. v3.x 影片分析
  4. v4.x 依位置評分、PR 值、開放其他隊
- v2 剩下的順序（2026-10-12 確認）：**v2.8 賽季進步追蹤（F8）＋出席率** → v2.9 意見回饋、全隊上線、舊網站退役 → **v2.10 視覺改版＋完整資安檢查（v2 最後一版）**。

## 2. 目前線上狀態

| 東西 | 狀態 |
|---|---|
| 正式網站 | https://football-analysis-potato.vercel.app — **v2.7.1 已上線（main @ `9d67c2c`，2026-10-12 助手合併）** |
| 舊網站 | https://football-analysis-potato.streamlit.app（並存到 v2.9） |
| 資料庫 | Supabase（東京），migration **0001–0011 都已執行**。v2.7.1 沒有新 migration |
| GitHub 標籤 | v1.0–v1.4.2、v2.0、v2.1、v2.2、v2.2.1、v2.4.1、v2.5、v2.6、v2.6.1、v2.7（`2cce416`）。**v2.7.1 打錯了**：使用者在合併前就打了，指向 `2cce416`（跟 v2.7 同一個 commit）。**要刪掉重打在 `9d67c2c`**（見第 7 節）。v2.3、v2.6.2 沒打過 |
| 隱私權政策 | POLICY_VERSION = 2026-10-08；v2.7 只改文字（補「練習和出席回覆」），沒更新版本號 |
| 更新紀錄 | `web/lib/updates.ts` 最新是 v2.7.1（`big: false`，只亮小圓點） |
| 測試資料 | 「測試隊」：帳號 `林宥成`（網站管理員＋球隊管理員，名單上隊長 #10）、`evan`（一般球員）；名單還有「測試球員一」#7、「測試球員二」#8 副隊長；v2.7 驗收時建了一些練習（包含故意寫錯的 AI 匯入那幾行） |

## 3. v2.7 和 v2.7.1 做了什麼

### v2.7 練習行事曆與出席（F11）

月曆（自己寫的 `web/lib/calendar.ts`，週一開頭，本隊比賽橘色）；練習新增／編輯／刪除、固定練習（建立時展開、共用 `series_id`、最多 60 次、可刪「這次和之後」）；出席登記（跟比賽共用 `attendance_who` 規則）；首頁待辦提醒；**AI 匯入**（網站不串 AI：產生指令 → 使用者貼給自己的 AI → 回 `日期|開始|結束|地點|集合|標題|內容|備註` → 貼回來預覽、標錯行、確認才建立）；可勾選發聊天室／推 Discord。細節：`docs/V2_7_SETUP.md`、`supabase/migrations/0011_practices.sql`、SPEC 的 F11。

### v2.7.1（大一點的修補版，沒動資料庫）

| 功能 | 檔案 |
|---|---|
| **子頁「‹ 返回」**：有上一頁就 `router.back()`，直接開網址的回到 fallback 列表頁。用在比賽詳情、球員報告、從比賽／聊天室進來的組隊、以及所有 `DocPage`（更新紀錄、隱私權政策、服務條款） | `web/components/back-button.tsx`（`BackButton`）、`components/doc.tsx` |
| **編輯面板返回**：比賽、練習、固定練習、AI 匯入、管理專區新增／編輯球員最上面有「‹ 返回」；返回和「取消」都經過 `useLeave` | `back-button.tsx`（`PanelBack`、`useDirty`、`useLeave`） |
| **「放棄修改？」確認視窗**：原生 `<dialog>` + `showModal()`（class `update-pop`），按鈕「繼續編輯」（預設焦點、Esc 也是留下）／「放棄修改」 | `back-button.tsx` 的 `LeaveDialog` |
| **整頁離開保護** `useLeaveGuard(dirty)`：有沒存的修改時，重新整理／關分頁用瀏覽器的 `beforeunload`；點站內連結（側邊欄、頁尾…）用 capture 階段的 click 攔下來，跳同一個視窗，確認後 `router.push`。同一頁有好幾個保護時用 `stopImmediatePropagation`，只跳一個視窗 | 用在：我的介紹（`app/t/[teamId]/page.tsx` 的 EditMine）、管理專區（PlayerForm、TeamSettings、Discord 網址）、組隊、聊天室發文／回覆／編輯、設定（顯示名稱、網站管理員建隊）、聯絡我們 |
| **組隊換陣容也會問**：`useGuardedAction(dirty)` 包住「開新陣容」和點列表換一組；組隊的 dirty 是跟「剛打開／剛存檔」的快照比（`baseline` ref + `markClean()`） | `app/t/[teamId]/lineup/page.tsx` |
| **組隊賽制說明**：綁定比賽時賽制不能改，畫面直接寫「賽制跟著這場比賽…」（iPad 沒有 hover 看不到 title） | `lineup/page.tsx` |
| **更新紀錄頁 `/updates`**：版本號跟 GitHub 標籤一樣；頁尾和側邊欄有入口；沒看過的更新亮小圓點；**小版本（`big: true`）下次打開網站跳「有新功能」視窗**；第一次來的人直接記成看過最新版、不跳。記在瀏覽器 localStorage（`fap.seenVersion`，讀寫都包 try/catch），用自訂事件 `fap-updates-seen` 讓同一頁的圓點同步消失 | `web/lib/updates.ts`（純資料＋`notice()`）、`components/updates.tsx`（`useUpdateNotice`、`UpdateDot`、`UpdatePopup`，只在 `shell.tsx` 放一次）、`components/updates-seen.tsx`、`app/updates/page.tsx` |
| **Grammarly 的 hydration 錯誤**：`<body suppressHydrationWarning>` | `web/app/layout.tsx` |

**刻意沒做的（使用者知道）**
- 瀏覽器自己的「上一頁」按鈕攔不到（網頁沒辦法可靠地擋）。
- 能力表沒加離開保護：它每一步都自動存草稿在這台裝置，離開不會丟東西。

**規則（已寫進 CLAUDE.md）**：每版上線都要在 `web/lib/updates.ts` 的 `UPDATES` 最上面加一段（版本號跟標籤一樣、球員看得懂的 2～5 條；小版本 `big: true`、修補版 `big: false`）。`web/tests/updates.test.ts` 會檢查排序、日期、「x.y.0 一定是 big」。**v2.8 上線時記得加一段 `big: true`。**

### 測試結果

- 沙盒 `node --test web/tests/*.test.ts`：98 項全過（新的 `updates.test.ts` 7 項）。
- 沙盒 `pytest --continue-on-collection-errors`：123 passed、3 skipped；6 個 collection error 全是沙盒沒有 `pandas`（已知）。新的 `tests/test_v271.py`（8 項靜態檢查：子頁返回鍵、編輯面板確認、更新紀錄接線、每個可編輯頁面都有 `useLeaveGuard`…）。
- 使用者電腦：使用者說「merge it for me」就合併了；**`npm.cmd run typecheck`、`npm.cmd test`、`py -m pytest` 在使用者電腦上最後一輪（整頁離開保護 `6856ca2` 和 `4193779` 之後）有沒有跑過、有沒有全過，沒有明確回報**。
- Claude in Chrome（使用者 localhost:3000）：v2.7.1 前半（返回鍵、更新紀錄、編輯面板）使用者自己測過，說除了確認視窗以外都好；確認視窗改成彈出視窗後、以及整頁離開保護，**沒有在瀏覽器實際驗收**。

### 還沒驗收（v2.8 開工前先請使用者在正式網站點一下）

- [ ] 「我的」頁改暱稱不存，點側邊欄「球員」→ 跳「放棄修改？」；「繼續編輯」留下、「放棄修改」離開。
- [ ] 組隊頁換一個人的位置，按「開新陣容」→ 跳視窗；存檔後再按不跳。
- [ ] 聊天室打一半字，點側邊欄 → 跳視窗；重新整理 → 瀏覽器自己的確認。
- [ ] 同一頁兩個保護（例如管理專區「球隊設定」同時改了隊名和 Discord 網址）只跳一個視窗。
- [ ] 更新紀錄：用另一個瀏覽器（或清掉 localStorage 的 `fap.seenVersion` 改成 `v2.6.1`）打開，要跳 v2.7 的「有新功能」視窗、側邊欄有小圓點；進 `/updates` 後圓點消失。
- [ ] iPad：組隊綁定比賽時看得到賽制說明文字。
- [ ] 終端機和 Console 沒有 Grammarly 的 hydration 錯誤。

## 4. 下一版：v2.8 賽季進步追蹤（SPEC F8）＋出席率

**SPEC**：`docs/SPEC.md` 的「F8 賽季進步追蹤」和版本表 v2.8（完成條件：**跨賽季同一人資料連得起來**）。

- 每賽季重填一次能力表（F9），畫出各能力的變化趨勢；影片分析上線前只看自評的變化。
- SPEC「Team ID 與賽季」寫了：v2.1 先把一筆 `teams` 當成「一支球隊的一個賽季」，**獨立的 `seasons` 表在 v2.8 再拆出來**；新賽季發新的 Team ID、舊賽季唯讀；同一個帳號跨賽季是同一個人。
- v2.7 決定：**出席率統計放 v2.8**（比賽＋練習的出席率，個人和全隊）。

**現在已經有的、可以重用的**
- `ability_ratings`（0001）：重填能力表會**新增一筆**，舊的保留（`submit_self_rating`，0004）→ 同一隊內的時間序列已經有了。
- v2.3 **球員生涯**（0006：`career_shared`、`set_career_shared`、`get_career`；`web/lib/career.ts`、`components/career.tsx`、`components/line-chart.tsx`）：球員自己選要把哪幾隊串成生涯、跨隊的趨勢圖、兩個時間點比較。**跨隊資料只能經過資料庫函式拿**（CLAUDE.md 規則），不要放寬 RLS。
- `web/lib/compare.ts`（同位置平均、進步退步）、`components/anim.tsx`（圖表動畫）。
- 出席：`attendance`（0008，比賽）、`practice_attendance`（0011），規則都在 `attendance_who`。

**還沒決定、要先用答案表問使用者的**
1. **賽季怎麼表示**：
   - (a) 照 SPEC 拆出 `seasons` 表（一支 `teams` 有多個賽季；Team ID、能力表、比賽、練習都掛在賽季下）——乾淨但牽動很多表、RLS 和網站上「切換球隊」的意義；
   - (b) 維持「一筆 teams = 一個賽季」，加一個「球隊系列」把同一支隊的不同賽季串起來（例如 `teams.lineage_id` + 「開新賽季」動作：複製名單、發新 Team ID、舊的唯讀）——改動小，跟 v2.3 生涯的模型一致；
   - (c) 不分賽季，只在同一隊內用時間（例如每學期）切能力表。
   （建議先評估 (b)，並把它跟生涯的關係講清楚；這是 v2.8 最大的決定，適合 Opus。）
2. **進步追蹤畫面放哪**：球員報告的「生涯」分頁擴充？還是新的「進步」分頁／頁面？球隊管理員要不要看全隊的進步排行（誰進步最多）？
3. **「一個賽季一份能力表」**：賽季中重填要覆蓋還是全部保留（現在是全部保留）？趨勢圖用每一份還是每賽季最後一份？
4. **出席率**：算比賽、練習、還是分開兩個數字？請假算不算進分母？沒回覆的怎麼算？誰看得到別人的出席率（只有球隊管理員？全隊？）。
5. **舊賽季唯讀**：v2.8 就做，還是只做資料串接、唯讀留到 v2.9？
6. 要不要「開新賽季」時自動在聊天室發通知、提醒大家重填能力表（v2.6.1 已有「能力表進度」和提醒）？

**注意**
- 新的 migration 是 **`0012_xxx.sql`**；新表要開 RLS、明確 grant 給 authenticated（不給 TRUNCATE）；新函式從 `public, anon` 收回執行權限；動作類回傳 `{"status": ...}` 不 raise。改權限後在沙盒 PostgreSQL 跑 `rls_test.sql`。
- 如果 0012 會讓舊網站讀失敗（像 v2.7 的 0011），上線步驟要寫「先跑資料庫再開網站」。
- 下載我的資料（`export_my_data`）、刪帳號（`delete_my_account`）要跟著新表更新；如果個資用途改了，評估要不要改隱私權政策和 `POLICY_VERSION`。
- 計算（趨勢、出席率）寫在 `web/lib/` 的純 TS 檔，加 `node --test` 測試；圖表動畫用 `useTween`／`.line-draw`，新 CSS 動畫加進 `prefers-reduced-motion`。
- 上線時：`web/lib/updates.ts` 加 v2.8（`big: true`）；寫 `docs/V2_8_SETUP.md`；寫新的 HANDOFF（v2.8 → v2.9）。

## 5. 使用者的習慣（一定要照做）

- 用**繁體中文**回覆；使用者是 NCKU 資工大一，Python 有基礎、還在學；用白話，能用足球比喻更好。
- **大改動先列待辦清單（大分類＋細項），等使用者確認再動手**；小事直接做。
- **要使用者做決定時，給「答案表」**（可以只回編號的表單）。使用者常用英文、只回數字（例如「1 1 1 1」「4 1 3 2 1」），照題號對應；可能有錯字，照上下文判斷。
- **叫使用者跑指令時，給可以直接複製貼上的程式碼區塊**，一行一個指令，第一行固定是：
  ```powershell
  cd "$env:USERPROFILE\Desktop\軟工\football-team-site"
  ```
  （**不要用 `git rev-parse --show-toplevel`**，中文路徑在 PowerShell 會變亂碼。）
- **用圖片之前先問**。
- 做完要**在瀏覽器實際測過**；優先用 Claude in Chrome 操作使用者的 `localhost:3000`。
- 開工前如果這項工作適合換模型，**先提醒使用者在 App 切換**，等使用者說好再開工。
- **合併前先問使用者測試是不是全部通過**（v2.7.1 使用者直接說「merge it for me」，沒回報測試結果；下次要在答案表裡明確問）。
- **標籤要在合併到 main 之後才打**，Target 選 `main`。給使用者的「tag context」要附 Release title 和 Description，並提醒「先合併再打」（v2.7.1 就是先打了才合併）。
- 使用者常用 iPad 看網站：只靠滑鼠 hover 的提示要改成畫面上看得到的文字。

## 6. 環境注意事項（踩過的坑）

**使用者的電腦**
- Windows，VS Code 繁中版，PowerShell。`npm` 要打 **`npm.cmd`**；Python 用 `py`。
- 使用者常常已經開著 `npm run dev`：不用重開，切分支後重新整理就好。
- 使用者有時會開到**正式網站**而不是 `localhost`，看不到新功能時先確認網址。Vercel 預覽網址（分支）用 Google 登入會跳回正式網站：是 Supabase 的 Redirect URLs 白名單造成的，**不要加 `https://*.vercel.app/**` 這種萬用字元**。
- 使用者的帳號是**網站管理員**（`is_admin`），在任何隊都看得到管理工具；要測一般球員畫面用 `evan` 帳號。
- 助手**沒辦法 pull 到使用者電腦**（雲端沙盒和使用者電腦分開；電腦連結工具沒有連到資料夾），只能 push 到 GitHub，請使用者自己 `git pull`。

**雲端工作環境（助手的沙盒）**
- 連不到 npm（403）、pip 裝不了、沒有 `pandas`、沒有 `py`：完整 `pytest`、`npm run typecheck`、`npm test`（真的套件）、`npm run build` 要在使用者電腦上跑。
- pytest：`/root/.local/bin/pytest -q --continue-on-collection-errors`（缺 pandas 的 6 個檔案會 collection error）。**注意：`pytest | tail` 的結束碼是 tail 的**，串在 `&&` 後面不會擋住後面的 push，要自己看輸出。
- 有全域 `tsc`，但沒有 React／Next 型別：`tsc --noEmit -p web` 一堆 `key`、`TS2307` 雜訊，只能 grep 自己改的檔案找真的錯。
- `node --test web/tests/*.test.ts` 可以直接跑。
- **本機 PostgreSQL 16**：`service postgresql start` 後，用 `su postgres -c "psql ..."` 依序跑 `supabase/tests/local_shim.sql` → `supabase/migrations/0*.sql` → `supabase/tests/rls_test.sql`，看到 `RLS OK` 才請使用者在 Supabase 執行新 migration。檔案先複製到 `/tmp` 給 postgres 讀。
- push 分支和 main 都可以；**push tag 會 403**，標籤要使用者在 GitHub 網頁打。`gh` 只能用 REST（`gh api repos/StupidLlama/football/...`），GraphQL（`gh release list`、`gh pr`）會被擋。
- 開新分支：`git switch -c vX.Y origin/main`，推：`git push -u origin vX.Y`。如果 stop hook 說「有未推送的 commit」但 `git ls-remote origin vX.Y` 跟 `HEAD` 一樣：`git config --add remote.origin.fetch '+refs/heads/vX.Y:refs/remotes/origin/vX.Y'` 再 `git fetch`。

**Claude in Chrome**
- 先 `tabs_context_mcp(createIfEmpty: true)`，在**自己的新分頁**測。
- `screenshot`／`left_click` 有時逾時（使用者切走視窗、或視窗縮到 400 寬時常發生）：改用 `javascript_tool`（`element.click()`、讀 `innerText`；React 輸入框要用原生 setter + `input` 事件）。逾時 2～3 次就停下來請使用者幫忙點。
- 最窄只能縮到 400；360 寬用 `document.documentElement.style.zoom = String(400/360)` 模擬。
- `ConfirmButton`（按兩下才執行）：兩次點擊要放在**同一個** `browser_batch` 裡。
- 現在有 `<dialog>` 確認視窗：測的時候用 `document.querySelector('dialog[open]')` 找按鈕。**不要觸發瀏覽器原生的 `beforeunload` 對話框**（重新整理有改動的頁面）——會卡住擴充功能，這項請使用者自己測。
- 登入由使用者自己做；助手不輸入密碼、不填金鑰。

**上線流程**
- 新功能放 `vX.Y` 分支，不要直接 push main。
- 寫程式 → 沙盒 PostgreSQL 跑 rls_test → 使用者在 Supabase 執行 migration + rls_test → 使用者電腦跑測試 → Claude in Chrome 在 localhost 驗收 → **問使用者測試是否全部通過** → 合併 main → 用正式網址確認 → 使用者打標籤 → `updates.ts`／CLAUDE.md／HANDOFF。

## 7. 待辦（不屬於 v2.8，但別忘了）

- **重打 `v2.7.1` 標籤**（現在指向 `2cce416` = v2.7）：GitHub → Releases 刪掉 v2.7.1 → Tags 刪掉 v2.7.1 → Draft a new release，tag `v2.7.1`、Target `main`（`9d67c2c` 或之後）。Release 內容在上一個對話給過，大意見第 3 節。
- 第 3 節「還沒驗收」那幾項。
- v2.6.1／v2.6.2 一般球員和網站管理員兌換管理員碼的畫面還沒親眼驗收。
- v2.6：真的 Discord 推播、真的手機；v2.5：系際聯賽賽程一鍵帶入、分享連結含比賽資訊。
- v2.2.1：Google 登入從「測試」切成「正式」（`docs/V2_2_1_SETUP.md`）。
- v2.3、v2.6.2 沒打過標籤（可打可不打）。
- **還沒回答的規劃問題**：(a) 多語系放 v2.10 之前還是之後（助手建議之後）；(b) 小功能（練習加到 Google 日曆 `.ics`、提醒通知）放 v2.8／v2.9 還是 v2.10。
- **v2.10**（v2 最後一版，內容在 SPEC 版本表）：C「戰情室」視覺改版、新 Logo（馬鈴薯足球是使用者用 Gemini 生成的圖，改版時請使用者提供原檔；「Potato」用 Kaushan Script、FOOTBALL ANALYSIS 用 Barlow Semi Condensed 大寫）、圖表捲到才播動畫、未登入首頁三人傳球打中橫桿彈回的循環動畫、參考其他網站的功能、**完整資安檢查**寫成 `docs/SECURITY_REVIEW.md`（適合 Opus）。示範稿在使用者的 Design 畫布「Potato 視覺改版示範」。
- 球場「自由擺放」先不做（v2.4.1 討論過），有空可以再提。
- 使用者之後會裝插畫風格的外掛，加入手繪／人性化的視覺元素。
- v3：影片分析照 `docs/PROJECT_PLAN.md`。
