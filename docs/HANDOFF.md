# 交接說明：v2.4 → v2.5

> 給下一個工作階段（新的 Claude 對話，或 VS Code 裡的 Claude Code）看的。每完成一個小版本（v2.4 → v2.5）或大一點的修補版就整份覆蓋；舊版本留在 git 歷史（`git log -p docs/HANDOFF.md`）。
> 寫於 2026-10-07，對應 commit：main 上的 v2.4.1 標籤（`47c2571`）。

## 0. 開場怎麼用

新對話第一句貼：

```
讀 StupidLlama/football 的 docs/HANDOFF.md、CLAUDE.md 和 docs/SPEC.md，接著做 v2.5。先列計畫（大分類＋細項），等我確認再動手。
```

**建議模型**：開場（讀資料、列計畫、資料庫設計）用 **Opus**；v2.5 要新增比賽資料表和出賽登記的權限規則，跟組隊（F3）會互相呼叫，設計要仔細。計畫確認後，照計畫寫畫面、補測試可以切 **Sonnet**。切換要使用者在 App 裡手動做，助手要在開工前提醒、等使用者說好再開工（見 CLAUDE.md「版本交接規則」）。

## 1. 專案目標（大方向）

- **Football Analysis Potato**：給業餘足球隊用的免費、開源（AGPL-3.0）網站。現在只有作者自己的球隊（NCKU 資工系隊）在用，之後要開放其他隊。
- 同時是軟體工程課的專題：最終目標是**從比賽影片自動分析**（YOLO 辨識 → 追蹤 → 事件 → 依位置的表現評分）。
- 開發分四個階段（`docs/SPEC.md`「版本規劃」）：
  1. v1.x Streamlit 舊網站（已完成，v2.8 退役）
  2. **v2.x 全隊可用的基本功能（不需要影片）← 現在在這裡，v2.4.1 已完成**
  3. v3.x 影片分析
  4. v4.x 依位置評分、PR 值、開放其他隊
- 原則：跟影片無關的功能全部在 v2.8 前做完，就算影片分析來不及，全隊也有完整可用的網站。

## 2. 目前線上狀態

| 東西 | 狀態 |
|---|---|
| 正式網站 | https://football-analysis-potato.vercel.app（Next.js，Vercel，push 到 main 自動部署）— **v2.4.1 已上線（main @ `47c2571`）**，請下一階段開工前先自己打開看一眼確認 Vercel 真的部署成功 |
| 舊網站 | https://football-analysis-potato.streamlit.app（並存到 v2.8） |
| 資料庫 | Supabase（東京），migration 0001–0007 都已執行；`rls_test.sql` 在正式資料庫通過 |
| GitHub | StupidLlama/football，main = v2.4.1。標籤：v1.0–v1.4.2、v2.0、v2.1、v2.2、v2.2.1、v2.4.1。**注意：v2.3 從來沒有打過標籤**（`docs/HANDOFF.md` 的上一版寫錯了，GitHub 上查不到 v2.3 這個 tag，main 的 commit 歷史是連續的，只是沒有打標籤而已，不影響功能） |
| 隱私權政策 | POLICY_VERSION = 2026-10-06（v2.3 改版，沿用到現在） |
| 測試資料 | 「測試隊」（2026-27）：隊上只有作者一人（暱稱 evan）、填過能力表。組隊頁裡留了兩筆助手測試用的陣容草稿：「（未命名）」和「v2.4測試陣容」，**使用者可以自行刪除，不影響正式隊伍** |

## 3. v2.4.1 做了什麼

### 功能（組隊 F3）

- **自動排陣容**：選 11 人制／8 人制、選陣型，依位置適合度和自評擅長/不擅長自動排人，門將優先排到；人數不夠時列出還缺哪些位置。
- **手動換人**：桌機拖曳球場上兩個位置互換、或把替補名單的人拖到球場位置；手機用「點一個、再點一個」互換（拖曳在手機上不可靠，所以手機版完全用點選）。
- **鎖定**：鎖定某個位置後再按自動排，鎖定的人不會被換走。
- **「為什麼是他」**：點一個位置看適合度和自評，候選名單可以直接點著換人。
- **存陣容**：官方陣容（`kind='official'`，球隊管理員才能存/刪，全隊看得到）、個人草稿（`kind='draft'`，只有自己能存/刪/分享）。
- **分享連結**：不用登入就能看（`get_shared_lineup`，唯一開放 anon 呼叫的函式），只回傳背號和位置，不會有球員 id、能力分數、是誰排的；可以選擇要不要顯示真名；可以重新產生連結讓舊連結失效。
- **陣容圖片下載**：固定尺寸（1080×1350，適合 IG/LINE）的 PNG，球場、背號、標題都在圖片裡畫好。

### 合併前修正的 bug

球場上拖曳球員，在 Chrome／Safari（WebKit）會變成選取文字而不是真的拖動 —— WebKit 對非圖片、連結的元素，光有 `draggable="true"` 不夠，要加 `-webkit-user-drag: element` 這個 CSS。commit `380614a`，修在 `web/components/lineup-pitch.tsx` 的 `SlotBox`。這個版本的標籤因此改叫 **v2.4.1**，不是 v2.4。

### 討論過、決定先不做的事

使用者問過「球場上能不能自由擺放（不限定 11 個位置框）」。討論後決定**這版不做**，因為牽涉：陣容資料結構要從「位置代碼」改成「座標」（要新 migration）、自動排演算法的「位置適合度」概念要重想、球場元件要從瀏覽器原生拖放整個換成 pointer events 自己算座標（幾乎重寫）、手機版互動要重新設計、分享連結的白名單欄位也要跟著改。如果之後要做，排進 v2.5 之後再提出來討論。

### 檔案

| 檔案 | 內容 |
|---|---|
| `supabase/migrations/0007_lineups.sql` | `lineups` 表、`save_lineup`／`delete_lineup`／`set_lineup_share`／`get_shared_lineup`、更新 `export_my_data`／`delete_my_account` |
| `supabase/tests/rls_test.sql` | 組隊相關權限測試 |
| `web/lib/lineup.ts` | 陣容型別、純計算（= `stats/lineup.py` 的 TS 版） |
| `web/lib/assignment.ts` | 自動排人演算法（= `stats/assignment.py`／`domain/` 的 TS 版） |
| `web/lib/config.ts` | 讀 `config.json` 組出 `RULES`／`LINEUP_RULES`（**這次修了 `LINEUP_RULES.formations` 原本是 `undefined` 的 bug**） |
| `web/components/lineup-pitch.tsx` | 球場 SVG、`SlotBox`（拖曳、點選）、陣容圖片 PNG 產生與下載 |
| `web/components/lineup-share.tsx` | 分享面板、分享頁用的陣容顯示 |
| `web/app/t/[teamId]/lineup/page.tsx` | 組隊頁主畫面 |
| `web/app/l/[token]/page.tsx` | 公開分享頁（不用登入） |
| `web/lib/api.ts` | 新增的 Supabase RPC 呼叫 |
| `web/scripts/lineup_fixture.py` | 從 Python 版演算法產生 `web/tests/fixtures/lineup_cases.json`，給 TS 測試比對答案 |
| `tests/test_v24.py`、`web/tests/v24.test.ts` | 靜態檢查、分享連結白名單、計算測試 |
| `docs/V2_4_SETUP.md` | 上線步驟和驗收清單（已經全部打勾） |

### 測試結果

- Python：使用者電腦上 223 個通過、0 失敗（沙盒連不到 pytest，所以型別檢查／單元測試／build 都是使用者在自己電腦上跑的）。
- 網站：`npm run typecheck` 0 錯誤、`npm test` 全過、`npm run build` 成功（含新的 `lineup`、`l/[token]` 路由）。
- 實際測試方式：這次助手透過**連結使用者電腦的瀏覽器擴充功能（Claude in Chrome）**，直接在使用者的 `localhost:3000` 上操作測試（開頁面、自動排、拖曳、分享、下載圖片），不只是看程式碼，是真的點過一輪。桌機版功能全部手動測過一輪、確認正常（含拖曳修好後的複測）。
- 手機版（DevTools 390 寬）：版面、「點一個、再點一個」換人、分享面板、下載按鈕都手動測過，正常。

### 還沒驗收

- `docs/V2_4_SETUP.md` 清單裡「有真實資料後再看」那兩項還沒做：全隊都填過能力表後自動排是否合理、分享連結分享到 LINE/IG 的實際顯示效果（現在隊上只有 1 個人的資料）。
- 手機版沒有用**真的手機**（只有 DevTools 模擬器）測過，要等隊友都知道上線了再找時間用手機看一次。
- Vercel 正式部署後**還沒有在正式網址上**（不是 localhost）測過拖曳、分享連結、下載圖片——理論上跟 localhost 一樣，但建議下一階段開工前先花 2 分鐘確認一次。

## 4. 下一版：v2.5 比賽列表 + 出賽登記（F7）

**SPEC**：`docs/SPEC.md` 的「F7 出賽登記」和「F4 比賽列表、比賽數據與表現評分」。v2.5 只做 F7 全部，和 F4 的一小部分（比賽列表的「即將進行」「已結束」兩種狀態，**不含**影片分析後才有的「已分析」狀態、跑動數據、表現評分——那些是 v3/v4 的事）。完成條件：出席名單要能直接給組隊（F3）用。

**F7 原文**：
> 教練建立比賽（對手、時間、球衣顏色、熱身時間、賽制），比賽從「即將進行」開始；球員點「出席 / 請假」，取代在群組裡複製接龍訊息。出席名單直接給組隊（F3）使用。

**已經有的東西**

- `web/app/t/[teamId]/matches/page.tsx`：側邊欄已經有「比賽」這個項目、標著 `soon: "v2.5"`，頁面本身是空殼，可以直接改。
- `domain/match.py`、`stats/match.py`：**這是給 v3 影片分析用的比賽數據統計（跑動、進球等），跟 v2.5 的「比賽列表」不是同一件事**，不要搞混；v2.5 要的是「這場比賽什麼時候、誰會去」，不是比賽數據。
- `domain/fixture.py`、`stats/schedule.py`、`adapters/schedule.py`、`infra/schedule.py`：這是**系際聯賽賽程表**（讀 Google 試算表、算戰績、抽裁判任務），跟球隊自己的「比賽列表」也是兩件事，不要搞混。如果教練想從系際聯賽賽程表一鍵建立「比賽」，可以問使用者要不要做這個串接，但不是這版的必做項目。
- 組隊（F3）現在是「從全隊名單選人」，v2.5 要把它改成「只能從『出席』的人裡面選」，介面已經在 `web/lib/lineup.ts`／`assignment.ts` 留了彈性（球員名單是外部傳入的陣列），應該不用大改，但要仔細設計怎麼接。

**計畫草稿（給下一個工作階段參考，要先給使用者確認）**

1. 新 migration `0008`：比賽表（對手、時間、地點/球衣顏色、熱身時間、賽制、狀態）、出席登記表（球員 id、比賽 id、出席/請假、時間戳）。狀態（即將進行／已結束）用時間自動算，不用存欄位（跟 F4 原文一致：「過了開賽時間」就算已結束）。
2. 權限：建立比賽只有球隊管理員；球員只能登記自己的出席/請假，看得到全隊的登記狀態（取代接龍訊息，本來就是要讓大家看到彼此）。
3. 比賽列表頁：「即將進行」「已結束」兩個分頁或篩選；即將進行的比賽可以點進去登記出席、看目前名單、直接跳到組隊頁（帶著這場的出席名單）。
4. 組隊頁接出席名單：原本「從全隊選人」改成「這場比賽只能從出席的人裡面選」——但沒有建立比賽、或還沒選定是哪場比賽時，要保留現在這種「不綁定比賽、從全隊選」的用法（草稿陣容本來就不一定對應特定比賽）。這個切換怎麼設計最自然，要先跟使用者確認。
5. 手機版：出席登記的按鈕要大、一鍵完成（球員實際情境是在群組訊息裡順手點一下）。

**要先問使用者的決定**

- 比賽列表要不要串接系際聯賽賽程表（`infra/schedule.py`）自動建立比賽，還是教練每次手動輸入？
- 出席登記要不要有「暫定/未回覆」狀態，還是只有「出席/請假」兩種（沒回覆就算未讀）？
- 組隊頁「選定某場比賽 → 只能從出席名單選人」和「不綁定比賽的草稿陣容」這兩種模式要怎麼切換，畫面上怎麼呈現比較不會搞混？
- SPEC 裡還沒決定：教練要不要在 v2.5 順便手動輸入每場的進球、助攻、出場分鐘？（`docs/SPEC.md` 待決定清單最後一項）

## 5. 使用者的習慣（一定要照做）

- 用**繁體中文**回覆；使用者是 NCKU 資工大一，Python 有基礎、還在學；用白話，能用足球比喻更好。
- **大改動先列待辦清單（大分類＋細項），等使用者確認再動手**；小事直接做。給選項時用編號，附上建議。
- **用圖片之前先問**。
- 做完要**在瀏覽器實際測過**，不要只說做完了；有連結使用者電腦時優先用 Claude in Chrome 直接在他的 `localhost` 上操作測試，比自己憑空判斷可靠很多。
- 進度要邊做邊回報（task 清單＋重點訊息）。
- 開工前如果這項工作適合換模型，**先提醒使用者在 App 切換**，等使用者說好再開工（見 CLAUDE.md「版本交接規則」）。
- 使用者有時候在手機上操作，不方便打字確認——這種時候可以考慮用一個小的互動式 Artifact（按鈕選項＋留言框，用 `db` capability 存答案）取代純文字問答，讓使用者點一點就能回覆；這次交接文件要不要寫、要不要切模型，就是這樣讓使用者在手機上確認的。

## 6. 環境注意事項（踩過的坑）

**使用者的電腦**
- Windows，專案在 `C:\Users\user\Desktop\軟工\football-team-site`，VS Code 繁中版。
- PowerShell 擋 `npm.ps1`：一律打 **`npm.cmd`**（例如 `npm.cmd run dev`）。Python 用 `py`。
- 本機網站：`cd web` → `npm.cmd run dev` → http://localhost:3000。開發模式第一次開每頁要編譯幾秒。

**雲端工作環境（助手自己的，Claude Code 的沙盒容器）**
- 連不到 npm（403）、pip 也大多裝不了：型別檢查、`npm test`、`npm run build` 要在使用者電腦上跑。這次沙盒連 pytest 都沒裝到，Python 測試也是使用者自己跑的。
- **git push 到分支正常，但 push tag 會 403**（`error: RPC failed; HTTP 403`，重試也一樣）——這個沙盒的 git 權杖看起來只開放推 branch，不開放推 tag。main 分支可以直接在這個環境 `git merge` + `git push` 推上去，但**標籤要使用者自己在 GitHub 網頁上「Draft a new release」打**，不是在終端機 `git tag` + `git push`。
- `gh` CLI 裝了但沒登入（`GH_TOKEN` 無效），不能用 `gh release create`。

**連結使用者電腦的部分（這次主要用的方式，跟上一版 HANDOFF 寫的「用 git bundle 傳檔案」不一樣，這次是直接連他的電腦）**
- 這次的對話是**連結到使用者的 Windows 電腦**的（透過 Claude 桌面版 App 的連線）：`mcp__remote-devices__device_bash` 是一個跟使用者電腦**分開的、獨立的 Linux VM**，不是真的在使用者的 Windows 上跑指令——所以那個 VM 裡也連不到 GitHub（403）、也沒有使用者裝好的 Python 套件（pytest 等）、也會抓錯 Node 原生模組（Linux 版 swc，但使用者的 `node_modules` 是 Windows 版），**不要以為連了電腦就能在那個 VM 裡跑使用者的指令**——真的要跑 `npm`／`pytest`／`git pull` 這些，還是要請使用者自己在 VS Code 終端機打。
- **Claude in Chrome（瀏覽器擴充功能）才是真的操作使用者的真實 Chrome**，跟 `device_bash` 是两回事。這次測試組隊頁幾乎都是透過它：開 `localhost:3000`、點擊、拖曳、截圖、讀 DOM（`javascript_tool`）确认 CSS 有沒有套用上去。拖曳的 bug 就是這樣抓到的：`draggable="true"` 看起來有設定，但實際拖曳還是不會動，查 `getComputedStyle` 才發現少了 WebKit 的 `-webkit-user-drag`。
- `resize_window` 工具在使用者的 Chrome 視窗最大化時常常縮不了，模擬手機寬度還是要請使用者自己 F12 → Ctrl+Shift+M。
- 這次沒有再踩到「同步到使用者電腦後版本對不起來」的坑，因為沒有用 bundle 傳檔案——直接 push 到 GitHub，使用者 `git pull` 就好，簡單很多，之後優先用這個方式。
- 登入一律由使用者自己做；助手不輸入密碼、不填金鑰。這次使用者自己登入後，助手才能用 Claude in Chrome 操作已登入的頁面。

**上線流程**
- 新功能先放在 `vX.Y` 分支，**不要直接 push main**（push main = Vercel 立刻上線；資料庫 migration 還沒跑的話網站會壞）。
- 順序：寫程式 → migration 給使用者在 Supabase SQL Editor 執行 → rls_test → 本機實測 → 合併 main（這個環境可以直接 push main，但標籤要使用者自己在 GitHub 網頁打）→ 寫新的 HANDOFF.md。
- **合併前在使用者電腦上用 `npm run typecheck` 多抓到兩個 bug**（這個沙盒的 `esbuild`／單檔 `tsc` 檢查抓不到，因為沒有完整的專案型別解析）：`formation.label` 應該是 `formation.name`、SVG `<g>` 的 `draggable` 屬性型別不符。以後改完畫面，**一定要請使用者在他電腦上跑一次完整的 `npm run typecheck`，不能只信任沙盒裡的檢查**。

## 7. 待辦（不屬於 v2.5，但別忘了）

- v2.2.1 剩：Google 登入從「測試」切成「正式」（`docs/V2_2_1_SETUP.md`）。
- **v2.3 從來沒有打過 GitHub 標籤**，有空的話可以補一個（commit 是 main 歷史上 v2.4 功能加入前的某一個，需要先確認正確的 commit 再補標籤；不急，不影響功能）。
- 使用者問過球場「自由擺放」要不要做，決定先不做，細節在上面第 3 節「討論過、決定先不做的事」。
- 使用者之後會裝插畫風格的外掛，加入手繪／人性化的視覺元素。
- 之後：語言設定（多語系）。
- SPEC 最後還有沒決定的事項（見 `docs/SPEC.md`「待決定」：控球秒數定義、原始影片保留天數、各版本日期）。
