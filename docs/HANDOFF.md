# 交接說明：v2.5 → v2.6

> 給下一個工作階段（新的 Claude 對話，或 VS Code 裡的 Claude Code）看的。每完成一個小版本（v2.5 → v2.6）或大一點的修補版就整份覆蓋；舊版本留在 git 歷史（`git log -p docs/HANDOFF.md`）。
> 寫於 2026-10-08，對應 commit：main 上的 `ecbea52`（還沒打標籤，請先打 `v2.5`，見第 2 節）。

## 0. 開場怎麼用

新對話第一句貼：

```
讀 StupidLlama/football 的 docs/HANDOFF.md、CLAUDE.md 和 docs/SPEC.md，接著做 v2.6。先列計畫（大分類＋細項），等我確認再動手。
```

**建議模型**：開場（讀資料、列計畫、資料庫設計）用 **Opus**；v2.6 隊伍聊天室要新增訊息表和即時更新（Supabase Realtime 或輪詢，兩種取捨要先想清楚），跟現有權限規則也要接起來，設計要仔細。計畫確認後，照計畫寫畫面、補測試可以切 **Sonnet**。切換要使用者在 App 裡手動做，助手要在開工前提醒、等使用者說好再開工（見 CLAUDE.md「版本交接規則」）。

## 1. 專案目標（大方向）

- **Football Analysis Potato**：給業餘足球隊用的免費、開源（AGPL-3.0）網站。現在只有作者自己的球隊（NCKU 資工系隊）在用，之後要開放其他隊。
- 同時是軟體工程課的專題：最終目標是**從比賽影片自動分析**（YOLO 辨識 → 追蹤 → 事件 → 依位置的表現評分）。
- 開發分四個階段（`docs/SPEC.md`「版本規劃」）：
  1. v1.x Streamlit 舊網站（已完成，v2.8 退役）
  2. **v2.x 全隊可用的基本功能（不需要影片）← 現在在這裡，v2.5 已完成**
  3. v3.x 影片分析
  4. v4.x 依位置評分、PR 值、開放其他隊
- 原則：跟影片無關的功能全部在 v2.8 前做完，就算影片分析來不及，全隊也有完整可用的網站。

## 2. 目前線上狀態

| 東西 | 狀態 |
|---|---|
| 正式網站 | https://football-analysis-potato.vercel.app（Next.js，Vercel，push 到 main 自動部署）— **v2.5 已上線（main @ `ecbea52`）**，已經用 Claude in Chrome 在正式網址上開過比賽頁確認過一次。**還沒打 GitHub 標籤**，下一步請先在 GitHub 網頁上補一個 `v2.5` 標籤（Releases → Draft a new release → Tag `v2.5`、Target `main`） |
| 舊網站 | https://football-analysis-potato.streamlit.app（並存到 v2.8） |
| 資料庫 | Supabase（東京），migration 0001–0008 都已執行；`rls_test.sql`（含 v2.5 新增的出賽登記測試）在正式資料庫通過（使用者確認過兩次「all done, succes, rls ok」） |
| GitHub | StupidLlama/football，main = v2.5（未打標籤）。標籤：v1.0–v1.4.2、v2.0、v2.1、v2.2、v2.2.1、v2.4.1。v2.3 從來沒打過標籤（不影響功能） |
| 隱私權政策 | POLICY_VERSION = 2026-10-06（v2.3 改版，沿用到現在，v2.5 沒有改政策內容） |
| 測試資料 | 「測試隊」（2026-27）：作者一人（暱稱 evan）。比賽頁測完後助手已經把建立的測試比賽都刪乾淨，只留了 v2.4 時期就有的「vs 機械」這場（10/10）當作示範資料，使用者可以自行刪除或保留 |

## 3. v2.5 做了什麼

### 功能（F7 出賽登記 + F4 的一部分）

- **比賽列表**：即將進行／已結束兩個分頁，狀態不存資料庫、用開賽時間和比分自動算。
- **建立比賽**：球隊管理員手動輸入（對手、開賽時間必填；集合時間、地點、球衣顏色、賽制、備註選填），或從系際聯賽賽程「一鍵帶入」（`match_from_fixture`，同一場不會重複建立）。
- **出賽登記**：球員點「出席／請假」（沒有第三種「不確定」狀態，沒登記就是「還沒回覆」）；再點一次已選的會清掉登記。開賽後一般球員不能再改，球隊管理員在比賽詳情頁「全隊登記狀況」仍可以代任何人登記/更正。
- **比賽詳情頁**：完整資訊、自己的登記面板、全隊登記狀況（依出席/請假/還沒回覆分組）、「去排陣容」連到組隊頁並自動帶入這場。
- **組隊頁接出席名單（F3 串接）**：新增「這組陣容要排哪一場」下拉；綁定後名單自動跟著那場的出席登記走（賽制也鎖定跟著比賽），不綁定則維持原本手動勾選。
- **首頁**：「下一場」優先顯示自己隊的下一場比賽（倒數＋出席按鈕），沒有才退回顯示系際聯賽賽程版本；待辦新增「下一場還沒回覆」。

### 合併前修正的 bug

組隊頁「開新陣容」按鈕原本寫成 `onClick={freshLineup}`，`freshLineup` 改成接受 `mId` 參數（預設目前綁定的比賽）之後，React 會把滑鼠事件物件當成第一個參數傳進去，導致每次按「開新陣容」都會把出席名單清空、賽制重設成 11 人制，而且跟原本綁定的比賽對不起來。改成 `onClick={() => freshLineup()}`，已經用 Claude in Chrome 複測確認修好。

### 討論過、確認的決定

- 出賽登記只有「出席／請假」兩種狀態，不做「暫定」。
- 比賽列表這版只到「即將進行／已結束」，不含影片分析才有的「已分析」、跑動數據、表現評分。
- 教練不在這版手動輸入每場的進球／助攻／上場分鐘，比分有填就算已結束，個人數據留給影片分析。

### 檔案

| 檔案 | 內容 |
|---|---|
| `supabase/migrations/0008_matches.sql` | `matches`、`attendance` 表，`lineups.match_id` 新欄位，`save_match`／`delete_match`／`match_from_fixture`／`set_attendance`，改寫 `save_lineup`（新增 `match` 參數）／`get_shared_lineup`（多回傳比賽資訊）／`export_my_data`／`delete_my_account` |
| `supabase/tests/rls_test.sql` | 新增約 30 個 v2.5 相關斷言（建立比賽權限、出賽登記、鎖定與管理員覆寫、跨隊隔離、`match_from_fixture` 行為、陣容綁定驗證、分享連結白名單、刪除連動） |
| `web/lib/matches.ts` | 純計算：比賽狀態／鎖定判斷、出席分組、排序、時間格式、可帶入的聯賽賽程場次 |
| `web/lib/api.ts` | 新增 `Match`／`Attendance` 型別、`saveMatch`／`deleteMatch`／`matchFromFixture`／`setAttendance`，`saveLineup`／`SharedLineup` 加上比賽欄位 |
| `web/lib/todos.ts` | 待辦新增「下一場還沒回覆」 |
| `web/components/match-form.tsx`、`attendance-buttons.tsx` | 建立/編輯比賽表單、出席登記大按鈕 |
| `web/app/t/[teamId]/matches/page.tsx`、`matches/[matchId]/page.tsx` | 比賽列表、詳情頁 |
| `web/app/t/[teamId]/lineup/page.tsx` | 新增比賽綁定下拉、`bindMatch`、`freshLineup` 改參數（這次修的 bug 就在這） |
| `web/app/t/[teamId]/home/page.tsx` | `NextGame` 元件（自己隊的下一場） |
| `web/components/lineup-share.tsx`、`shell.tsx`、`ui.tsx` | 分享頁顯示比賽資訊、導覽拿掉「即將推出」標籤、`useNow` 共用 hook |
| `tests/test_v25.py`、`web/tests/v25.test.ts` | 靜態檢查、純計算測試（11 項全過） |
| `tests/test_v22.py` | 順便修了一個漏洞：欄位檢查沒把新表 `matches`／`attendance` 算進去 |
| `docs/V2_5_SETUP.md` | 上線步驟和驗收清單 |

### 測試結果

- Python：使用者電腦上跑過 `py -m pytest`，全過（使用者口頭確認「全部通過」，這次沒有附實際數字，下一版若要重新確認可以直接問）。
- 網站：使用者電腦上 `npm.cmd run typecheck`、`npm.cmd test` 都通過（同樣是口頭確認「全部通過」）。
- 沙盒這邊的靜態檢查（`minitest.py` 土炮跑的 Python 測試，不含需要 pytest fixture 的檔案）66 過 0 錯；`node --test` 跑 `web/tests/*.test.ts` 45 過 0 錯。
- **這次用 Claude in Chrome 連到使用者電腦，直接在他的 `localhost:3000` 上操作測試**：建立比賽、刪除比賽（兩步確認）、出席/請假登記、清掉登記、開賽後鎖定（自己不能改、管理員仍可代登記，特地建了一場過去時間的比賽測完再刪掉）、組隊頁綁定/解除綁定比賽、「開新陣容」bug 複測、首頁下一場＋倒數＋待辦、一般球員看不到建立/刪除比賽的按鈕（用真實隊伍「資訊系足」的球員身分測的）。
- **手機寬度**也用 Claude in Chrome 測了：這次 `resize_window` 工具在**新開的分頁**上縮小成功了（400×642、360×780），之前 v2.4 那次在已經開著的分頁上縮不了；比賽列表/詳情/組隊頁/首頁都沒有左右捲動、按鈕夠大。但這仍然是視窗縮小模擬，不是真的手機。
- 合併到 main 之後，用 Claude in Chrome 開正式網址（`football-analysis-potato.vercel.app`）確認比賽頁能正常打開、看得到資料。

### 還沒驗收

- **從系際聯賽賽程一鍵帶入**：「測試隊」沒設定聯賽隊名、沒有賽程資料，沒機會測到。等換到真實隊伍「資訊系足」（有設定聯賽隊名、賽程表）上線後，找一場還沒建立的賽程場次試著帶入一次。
- **分享連結顯示比賽資訊**（陣容綁定比賽時，分享頁標題下面會多一行「vs 對手・開賽時間」）、**存檔後重新整理再打開，綁定的比賽是否還在**：都沒有留測試資料驗證，建議使用者自己手動存一次確認。
- **真的手機**：只用視窗縮小模擬過，沒用真手機看過。
- 上一版（v2.3）留下的「還沒驗收」項目也還沒補：兩位球員比較的變形動畫、隊友看別人的生涯、兩個時間點比較（隊上要有第二個人、自己要填第二次能力表）——這些跟 v2.5 無關，純粹是隊上現在只有一個人，沒有真實資料可以測。

## 4. 下一版：v2.6 隊伍聊天室（F6）

**SPEC**：`docs/SPEC.md` 的「F6 隊伍聊天室」。

**F6 原文**：
> 教練發筆記、戰術（可附陣容、影片片段），可置頂；球員可回覆。完成標準：新訊息不用重新整理就出現；教練可刪除任何訊息。

**還沒決定、要先問使用者的**

- **即時更新怎麼做**：Supabase Realtime（訂閱 `messages` 表的變化，真正「不用重新整理」）還是簡單輪詢（例如每幾秒重抓一次）？Realtime 體驗好但要多學一個 Supabase 功能、多一條連線規則要設計；輪詢簡單但不是真即時。
- **附件**：「可附陣容、影片片段」——陣容附件應該就是分享現有的 `lineups`（存個 `lineup_id` 參照，權限要注意別洩漏草稿）；影片片段要等 v3 才有真正的片段資料，這版要不要先留欄位、或乾脆先不做附件，只做純文字＋置頂？
- **刪除規則**：「教練可刪除任何訊息」——球員可以刪自己發的訊息嗎？回覆算不算獨立訊息，還是掛在原訊息下面？
- **通知**：新訊息要不要跟現有的「我的待辦」或 Discord Webhook（`DISCORD_WEBHOOK_URL`，目前只用在聯絡我們表單）接起來，提醒大家去看？

**已經有的東西，可以參考**

- v2.5 `set_attendance`／`save_match` 這類「動作用資料庫函式、不 raise、回傳 status」的模式，聊天室的發文/刪文/置頂應該照同樣的寫法。
- `web/components/ui.tsx` 的 `useNow`、`useToast` 可以直接用。
- 權限規則照 v2.4／v2.5 的慣例：新表一定要 RLS、新函式要 revoke from anon/public 再 grant authenticated、`tests/test_v2x.py` 要照既有的檢查模式補上去。

## 5. 使用者的習慣（一定要照做）

- 用**繁體中文**回覆；使用者是 NCKU 資工大一，Python 有基礎、還在學；用白話，能用足球比喻更好。
- **大改動先列待辦清單（大分類＋細項），等使用者確認再動手**；小事直接做。給選項時用編號，附上建議。
- **用圖片之前先問**。
- 做完要**在瀏覽器實際測過**，不要只說做完了；有連結使用者電腦時優先用 Claude in Chrome 直接在他的 `localhost` 上操作測試，比自己憑空判斷可靠很多。
- 進度要邊做邊回報（task 清單＋重點訊息）。
- 開工前如果這項工作適合換模型，**先提醒使用者在 App 切換**，等使用者說好再開工（見 CLAUDE.md「版本交接規則」）。
- 合併到 main、跑完測試之後，**先用一句話問使用者測試結果是不是全部通過**，不要自己假設都過了就直接合併——這次就是先問過、使用者確認「全部通過」才合併的。

## 6. 環境注意事項（踩過的坑）

**使用者的電腦**
- Windows，VS Code 繁中版。PowerShell 擋 `npm.ps1`：一律打 **`npm.cmd`**。Python 用 `py`。
- 本機網站：`cd web` → `npm.cmd run dev` → http://localhost:3000。

**雲端工作環境（助手自己的，Claude Code 的沙盒容器）**
- 連不到 npm（403）、pip 也大多裝不了：型別檢查、`npm test`、`npm run build`、`pytest` 都要在使用者電腦上跑。
- **這次意外發現：沙盒裡有一個可以用的本機 PostgreSQL 16**（`/usr/lib/postgresql/16/bin/{initdb,pg_ctl}`，用 `runuser -u postgres --` 繞過 root 直接跑的安全檢查），配合 `supabase/tests/local_shim.sql`（模擬 `auth.users`／`auth.uid()`／角色的 shim）可以在沙盒裡**真的跑一次 migration + 完整的 `rls_test.sql`**，不用等使用者在正式 Supabase 上測才知道權限規則對不對。這次 0008 migration 就是先在這裡測過、確認 `RLS OK` 才請使用者在正式環境跑的，比上一版（只能看程式碼判斷）可靠很多。下一版資料庫設計好以後，建議先用這個方法驗過一輪。
- **也意外發現：`npm`／`pip` 沒裝好的情況下，可以寫一個土炮的測試執行器**（這次叫 `minitest.py`，直接執行沒有參數的 `test_*` function，對會 `import pytest` 但其實不需要 fixture 的檔案塞一個假的 `pytest` 模組）來跑既有的 Python 靜態檢查測試，比完全無法自我檢查好。但這**不能取代**使用者電腦上的真正 `pytest`（某些測試需要真的 pytest fixture，會被跳過）。
- `git push` 到分支和 main 都正常，但 **push tag 還是會 403**——標籤要使用者自己在 GitHub 網頁上「Draft a new release」打。
- `gh` CLI 裝了但沒登入，不能用 `gh release create`。

**連結使用者電腦的部分**
- 這次的對話是**連結到使用者的 Windows 電腦**的：`mcp__remote-devices__device_bash` 是一個跟使用者電腦**分開的、獨立的 Linux VM**，不要以為連了電腦就能在那個 VM 裡跑使用者的指令（`npm`／`pytest`／`git pull` 這些還是要請使用者自己在 VS Code 終端機打）。
- **Claude in Chrome 才是真的操作使用者的真實 Chrome**：這次比賽頁、組隊頁綁定比賽、首頁下一場幾乎都是透過它測的，包含建立/刪除測試比賽、代登記、鎖定狀態。「開新陣容」的 bug 也是這樣複測確認修好的。
- `read_page`（accessibility tree）和 `javascript_tool` 在 `computer` 工具的 `screenshot`／`left_click` 偶爾逾時（CDP `Page.captureScreenshot` timeout，可能是 Next dev 熱重載卡住渲染）時還是能用——這次遇到 `computer` 的 click 和 screenshot 連續失敗，改用 `javascript_tool` 直接 `element.click()` 和 `document.body.innerText` 照樣把整個流程測完，比乾脆放棄測試可靠。下次遇到類似情況可以先試這招，不用馬上跟使用者說測不了。
- **`resize_window` 這次在新開的分頁上成功了**（縮到 400×642、360×780），跟上一版「視窗最大化時常常縮不了」的經驗不完全一樣——看起來差別可能在於「全新分頁 vs 沿用舊分頁」，但樣本太少不確定，下次可以先試試看新分頁，縮不了再跟使用者說改用他自己的 DevTools。
- 登入一律由使用者自己做；助手不輸入密碼、不填金鑰。
- git 分支 `v2.5` 這次遇到本機 git 設定缺了 fetch refspec（只設了 `main` 的，沒有 `v2.5` 的），導致 stop hook 誤判「有未推送的 commit」，其實已經推上去了。用 `git config --add remote.origin.fetch '+refs/heads/v2.5:refs/remotes/origin/v2.5'` 補上就好。换到新版本分支工作前可以先確認一下 fetch 設定。

**上線流程**
- 新功能先放在 `vX.Y` 分支，**不要直接 push main**。
- 順序：寫程式 → migration 給使用者在 Supabase SQL Editor 執行 → rls_test → 本機實測（`npm run typecheck`／`npm test`／`pytest`，使用者電腦上跑）→ Claude in Chrome 在使用者電腦的 localhost 上實際操作測試 → **先問使用者測試結果是否全部通過，得到明確答覆再合併** → 合併 main（這個環境可以直接 push main，但標籤要使用者自己在 GitHub 網頁打）→ 合併後用 Claude in Chrome 開正式網址確認一次 → 寫新的 HANDOFF.md。

## 7. 待辦（不屬於 v2.6，但別忘了）

- **v2.5 還沒打 GitHub 標籤**，請使用者在 GitHub 網頁上補（見第 2 節）。
- v2.2.1 剩：Google 登入從「測試」切成「正式」（`docs/V2_2_1_SETUP.md`）。
- v2.3 從來沒有打過 GitHub 標籤，有空的話可以補一個。
- v2.5 的「還沒驗收」項目（見第 3 節）：系際聯賽賽程一鍵帶入、分享連結含比賽資訊、重新整理後綁定是否還在、真的手機。
- 使用者問過球場「自由擺放」要不要做，決定先不做，細節見 v2.4.1 時期的討論（`git log -p docs/HANDOFF.md` 找得到）。
- 使用者之後會裝插畫風格的外掛，加入手繪／人性化的視覺元素。
- 之後：語言設定（多語系）。
- SPEC 最後還有沒決定的事項（見 `docs/SPEC.md`「待決定」：控球秒數定義、原始影片保留天數、各版本日期）。
