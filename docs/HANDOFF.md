# 交接說明：v2.10 → v2.11

> 給下一個工作階段（新的 Claude 對話，或 VS Code 裡的 Claude Code）看的。每完成一個小版本或大一點的修補版就整份覆蓋；舊版本留在 git 歷史（`git log -p docs/HANDOFF.md`）。
> 寫於 2026-10-14，對應 main 上的 v2.10 commit `0cfbf1f`（之後只多了這份文件、`SECURITY_REVIEW.md` 和 CLAUDE.md 的更新）。
> **v2.11 是 v2 的最後一版**（視覺改版），做完就要切到 v3（影片分析）。v2.11 上線後的交接說明要照 CLAUDE.md「階段切換」的規定寫得更詳細。

## 0. 開場怎麼用

新對話第一句貼：

```
讀 StupidLlama/football 的 docs/HANDOFF.md、CLAUDE.md 和 docs/SPEC.md，接著做 v2.11 視覺改版。先列計畫（大分類＋細項）和要我決定的事（用答案表），等我確認再動手。
```

**建議模型**
- 開場（讀資料、列計畫、決定設計方向和字體載入方式）→ **Opus** 或 **Sonnet** 都可以；視覺改版大部分是照確認過的設計改畫面、CSS、動畫 → **Sonnet**。
- 掃大量頁面找要改的樣式、整理截圖 → 子代理用 **Haiku**。
- 助手不能自己換模型：開工前提醒使用者在 App 切換，等使用者說好再開工。

## 1. 專案目標（大方向）

- **Football Analysis Potato**：給業餘足球隊用的免費、開源（AGPL-3.0）網站。現在只有作者自己的球隊（NCKU 資工系隊）在用，之後要開放其他隊。
- 同時是軟體工程課的專題：最終目標是**從比賽影片自動分析**（YOLO 辨識 → 追蹤 → 事件 → 依位置的表現評分）。
- 開發分四個階段（`docs/SPEC.md`「版本規劃」）：v1.x Streamlit（已退役）→ **v2.x 全隊可用的基本功能 ← 現在在這裡，v2.10 已完成，下一個是 v2 最後一版 v2.11** → v3.x 影片分析 → v4.x 依位置評分、PR 值、開放其他隊。
- v2.11 之後：多語系（v2.12，使用者 2026-10-14 決定往後挪），然後進 v3。

## 2. 目前線上狀態

| 東西 | 狀態 |
|---|---|
| 正式網站 | https://football-analysis-potato.vercel.app — **v2.10 已上線（main @ `0cfbf1f`，2026-10-14）**，`/updates` 顯示 v2.10（`big: true`）；Vercel 建置成功；正式網站標頭有 `Cross-Origin-Opener-Policy: same-origin`，CSP 的 `connect-src` 只有自己的 Supabase 專案；Console 沒有錯誤 |
| 舊網站 | Streamlit 只顯示搬家公告 |
| 資料庫 | Supabase（東京），migration **0001–0014 都已執行**，`rls_test.sql` 在 Supabase 回報 RLS OK（含 v2.10 的全資料庫總檢查和 null 測試） |
| Supabase Auth | Email 確認開、密碼最短 8、擋外洩密碼開（2026-10-14 使用者設定） |
| GitHub 標籤 | 到 v2.9。**`v2.10` 還沒打**（要使用者在 GitHub 網頁打，Target 選 main） |
| 隱私權政策 | `POLICY_VERSION = 2026-10-13`（v2.10 沒改政策） |
| 分支 | `v2.10` 和 `main` 在同一個 commit；v2.11 從 `origin/main` 開新分支 |
| 測試資料 | 「測試隊」（新賽季 `77bad98a…`）：v2.10 驗收時 `林宥成` 多送了一份能力表（傳球 3），暱稱「測試210」、給球隊的話「v2.10 驗收」；使用者決定殘留資料留著。**只能用測試隊測，絕對不要動「資訊系足」** |

## 3. v2.10 做了什麼（完整資安檢查）

### 決定（使用者確認過，2026-10-14）

1. 原本的 v2.10 拆成兩版：**v2.10 資安**（這版）、**v2.11 視覺**；多語系變 v2.12。
2. 回饋截圖、可訂閱日曆網址：**只寫評估結論，之後另外排版本**（結論在 `SECURITY_REVIEW.md`）。
3. 資安細節**修好、上線後才 push 報告**；commit 訊息不寫怎麼攻擊。
4. CSP 的 `'unsafe-inline'`：**維持現狀**，記成低風險，v4 開放其他隊前再評估 nonce。
5. 第二輪用 **Trail of Bits** 的公開 skills（differential-review、insecure-defaults、sharp-edges）的檢查清單再審一次（使用者要求用別人做的 skill；在這裡照它們的流程手動跑，沒有安裝）。
6. `/find-skills` 找到的 Supabase「pentest」skill 會對正式資料庫送寫入請求，**不使用**。

### 結果

- **沒有高風險**。中風險 2 個（都已修）：球員可以繞過 `submit_self_rating` 直接寫 `ability_ratings`／`players`（塞 999 分、2099 年、10 萬字）；同意頁 `?next=` 可以用「`/` + Tab + `/壞網站`」跳到別的網站。
- 低風險 11 個：7 個已修、1 個使用者處理（舊網站金鑰）、3 個接受。Supabase Security Advisor 沒有 ERROR，58 個 WARN 逐條判斷（見報告）。`npm audit`、`pip-audit` 都是 0。git 歷史 88 個 commit、618 個檔案版本沒有真的金鑰或個資。

### 檔案

| 部分 | 檔案 |
|---|---|
| 資料庫 | `supabase/migrations/0014_security.sql`：收回 `ability_ratings` 直接 insert／delete（刪 `ratings_insert`、`ratings_delete`）；`players`、`teams`、`fixtures` 加 `NOT VALID` 的字數／格式 check；`export_my_data` 補裁判任務、聊天室已讀、嘗試紀錄；收回 `handle_new_user` 執行權限 |
| 檢查 SQL | `supabase/tests/v210_precheck.sql`（只讀，跑 0014 前確認舊資料沒超過上限） |
| 權限測試 | `supabase/tests/rls_test.sql`：舊的兩處直接 insert 改成管理者身分；最後加「v2.10」一段（直接寫、塞爆、null）和**整個資料庫的總檢查**；`supabase/tests/local_shim.sql` 加函式預設權限 |
| 網站 | `web/lib/nav.ts`（`safeNext` 擋控制字元＋URL 解析）、`web/next.config.mjs`（COOP；讀不到 Supabase 網址時正式版建置失敗）、`app/t/[teamId]/coach/page.tsx`（隊名上限 60 → 40）、`web/lib/updates.ts`（v2.10） |
| 測試 | `tests/test_v210.py`（12 項：能力表只能用函式、資料表上限、下載資料涵蓋每張個人資料表、每張新表要分類、網站上限不能比資料表寬、CSP 不放寬…）、`web/tests/v210.test.ts`（`safeNext` 14 種跳走寫法） |
| 文件 | `docs/SECURITY_REVIEW.md`（報告）、`docs/V2_10_SETUP.md`、`docs/SPEC.md`（版本表拆 v2.10／v2.11）、`CLAUDE.md`（「v2.10 資安的規則」） |

### 測試結果

- 沙盒：`node --test` 130 項全過；`pytest` 168 passed、3 skipped（6 個 collection error 是沙盒沒有 pandas）；PostgreSQL 0001–0014 → RLS OK。
- 使用者電腦：pytest、npm test、typecheck、build 都過；Supabase RLS OK。
- Claude in Chrome（localhost:3000，測試隊）：送能力表、改我的介紹、改隊名、改背號、下載我的資料（有新欄位）、Console 沒錯誤。正式網站：標頭、`/updates`、聊天室都正常。

### 還沒做（使用者）

- [ ] GitHub 打標籤 `v2.10`（Target：main）。
- [ ] `V2_10_SETUP.md` 第 6 節：清空 Streamlit Cloud 的 secrets、停用 Google 服務帳號金鑰。
- [ ] 把 `football-security-review` skill 存起來（v2.10 時給過卡片）。
- [ ] v2.9 留下的驗收（見第 7 節）。

## 4. 下一版：v2.11 視覺改版（v2 最後一版）

**SPEC**：`docs/SPEC.md` 版本表 v2.11（規模 M）。完成條件：**360／390 寬和 iPad 驗收；設了「減少動態效果」不播動畫**。

### 內容（SPEC 原文）

- **C「戰情室」風格**：卡片變少、KPI 合成一條；字體：標題霞鶩文楷、內文思源黑體、數字 Barlow Semi Condensed。
- **新 Logo**：馬鈴薯足球圖＋「FOOTBALL ANALYSIS」窄體大寫＋「Potato」Kaushan Script；深色底 #E9B45C／淺色底 #9C5F27；favicon 另描簡化 SVG。**馬鈴薯足球是使用者用 Gemini 生成的圖，開工時請使用者提供原檔（用圖片之前要先問使用者）。**
- **圖表捲到才播動畫**（長條從 0 長、雷達從中心擴散），用 `IntersectionObserver` 接 `components/anim.tsx` 的 `useTween`。
- **未登入首頁**：三人傳球、射中橫桿彈回第一人的循環動畫（取代戰術板）。
- 參考其他運動網站挑的功能（開場時問使用者想參考哪些）。
- 示範稿在使用者的 Design 畫布「**Potato 視覺改版示範**」（使用者選 C 戰情室、Logo 用 Kaushan Script 版）。開工時用 Artifact 的 list 找它。

### 計畫草稿（開場時跟使用者確認）

1. **設計基礎**：`web/app/globals.css` 換戰情室配色；四種字體都用 `next/font`（**字體是打包在網站自己身上，CSP 不用改**；思源黑體很大，要看手機載入速度、考慮只載常用字重）。
2. **Logo**：使用者給原圖 → Logo 元件（深淺色）＋ 簡化 SVG favicon（`app/icon.svg`）。
3. **版面**：卡片變少、KPI 一條；逐頁改（首頁、球員、報告、比較、組隊、比賽、練習、聊天室、管理專區、設定、回饋、更新紀錄、政策頁）；`FeedbackFab`、瀏覽器提醒、更新視窗跟新風格一致、不擋送出鍵。
4. **動畫**：捲到才播的 hook；未登入首頁傳球動畫（SVG＋CSS）；全部加進 `prefers-reduced-motion`（`test_v23.py` 會檢查）。
5. **驗收**：每頁 360／390 寬和 iPad（Claude in Chrome：`resize_window` 390；360 用 `zoom`），只用測試隊。
6. **上線**：`updates.ts`（`big: true`）、CLAUDE.md「UI 風格」那段改寫、合併、標籤。
7. **階段切換交接**（Opus）：整個 v2 的成果和沒做完的、資料庫全部的表和函式、v3 的新工具和環境（YOLO、OpenCV、Colab、影片儲存）、風險。

### 要先用答案表問使用者的

1. **Logo 原檔**：(a) 直接提供 Gemini 原圖 (b) 用 `prompt-for-other-ai` 重新生成透明背景版 (c) 先試原圖、不好用再重生。
2. **參考網站**：想參考哪些運動網站／App 的功能（FotMob、Sofascore、FPL…，或請助手挑 3 個給他選）？
3. **Android「加到 Google 日曆」按鈕**（v2.9 討論過，還沒決定）：(a) 併進 v2.11 (b) 另外做小修 (c) 不做。
4. 使用者之後會裝**插畫風格的外掛**，加手繪／人性化元素：要不要在 v2.11 一起做？
5. 改版很大：要不要拆成 v2.11（設計基礎＋Logo＋主要頁面）和 v2.11.1（動畫＋其他頁面）？

### 注意

- 新的 CSS 動畫一律加進 `@media (prefers-reduced-motion: reduce)`。
- 每頁都要在 360／390 寬和 iPad 看過（沒有左右捲動、雷達圖能力名稱不重疊）。
- 用詞：「網站管理員」「球隊管理員」，不要寫「教練」「系統管理者」（`test_v221.py`）。
- 輸入框的 `maxLength` 不能比資料表的 check 寬（`tests/test_v210.py` 會擋隊名、賽季）。
- 改了外部資源（圖片、字體從別的網域）要改 CSP；用 `next/font` 和 `public/` 裡的檔案就不用。
- CLAUDE.md「UI 風格」那段（舊網站 `infra/charts/style.py` 已退役，不用跟著改）要改寫成新的設計規則。
- 上線前照 `football-security-review` 跑一次簡單的資安檢查（v2.11 沒有新的資料庫權限，重點是 CSP 和新的外部資源）。

## 5. 使用者的習慣（一定要照做）

- 用**繁體中文**回覆；使用者是 NCKU 資工大一，Python 有基礎、還在學；用白話，能用足球比喻更好。
- **大改動先列待辦清單（大分類＋細項），等使用者確認再動手**；小事直接做。
- **要使用者做決定時，給「答案表」**（可以只回編號的表單）。使用者常用英文、只回數字或很短的話（例如「1a 2b 3a」「now」），照題號對應；可能有錯字，照上下文判斷。
- **叫使用者跑指令時，給可以直接複製貼上的程式碼區塊**，一行一個指令，第一行固定是：
  ```powershell
  cd "$env:USERPROFILE\Desktop\軟工\football-team-site"
  ```
  （**不要用 `git rev-parse --show-toplevel`**，中文路徑在 PowerShell 會變亂碼。使用者的終端機常常已經在 `web` 資料夾裡，所以**不要寫 `cd web`**，改用完整路徑 `cd "$env:USERPROFILE\Desktop\軟工\football-team-site\web"`。）
- **用圖片之前先問**。
- 做完要**在瀏覽器實際測過**；優先用 Claude in Chrome 操作使用者的 `localhost:3000`，**只用「測試隊」**。使用者也會自己用手機測正式網站（v2.9 就是合併後直接在正式網站測 `.ics`）。
- 開工前如果這項工作適合換模型，**先提醒使用者在 App 切換**，等使用者說好再開工。使用者會用 `/model` 自己切，切完通常就是「開始做」的意思。
- **合併前先問使用者測試是不是全部通過**（使用者說「run the tests then deploy」就是同意合併）。
- **標籤要在合併到 main 之後才打**，Target 選 `main`；給使用者 Release title 和 Description（使用者會說「for the tag」）。
- 使用者會要「context」：給一段可以貼到新對話的現況摘要（程式碼區塊）。
- 使用者常用 iPad／iPhone 看網站：只靠滑鼠 hover 的提示要改成畫面上看得到的文字。
- 使用者有 skill `prompt-for-other-ai`：要請他用 Gemini／GPT 生圖（例如 v2.10 的 Logo）時，可以用它產生提示詞。

## 6. 環境注意事項（踩過的坑）

**使用者的電腦**
- Windows，VS Code 繁中版，PowerShell。`npm` 要打 **`npm.cmd`**；Python 用 `py`。
- 專案資料夾：`C:\Users\user\Desktop\軟工\football-team-site`（是「軟工」，繁體）。
- 使用者常常已經開著 `npm run dev`：不用重開，切分支後重新整理就好。出現「Another next dev server is already running」或跑到 3001 port：
  ```powershell
  taskkill /F /IM node.exe
  npm.cmd run dev
  ```
- 手機測本機：用 `npm run dev` 印出的 **Network** 網址（同一個 Wi-Fi）；但 Google 登入會跳回正式網站，所以**手機測試建議直接用正式網站**。
- 使用者在分支上時，本機可能沒 pull 到最新：先 `git pull origin vX.Y`。如果助手 force-push 過，改用 `git fetch origin` ＋ `git reset --hard origin/vX.Y`。
- 使用者有時會開到**正式網站**而不是 `localhost`，看不到新功能時先確認網址。Vercel 預覽網址用 Google 登入會跳回正式網站（Supabase Redirect URLs 白名單），**不要加萬用字元**。
- 使用者的帳號是**網站管理員**（`is_admin`）；要測一般球員畫面用 `evan` 帳號。
- 助手**沒辦法 pull 到使用者電腦**，只能 push 到 GitHub，請使用者自己 `git pull`。

**雲端工作環境（助手的沙盒）**
- repo 不會自動在沙盒裡：用 `add_repo` 加 StupidLlama/football，clone 時給長一點的 timeout（第一次呼叫可能回「NOT RUN」，再呼叫一次）。clone 是 shallow：要 `git fetch origin main` 才有遠端分支。
- 連不到 npm（403）、pip 裝不了、沒有 `pandas`、沒有 `py`：完整 `pytest`、`npm run typecheck`、`npm run build` 要在使用者電腦上跑；Vercel 部署狀態用 `gh api repos/StupidLlama/football/deployments`／`statuses` 看。
- pytest：`/root/.local/bin/pytest -q --continue-on-collection-errors`（缺 pandas 的 6 個檔案會 collection error）。**`pytest | tail` 的結束碼是 tail 的**，要自己看輸出。
- 有全域 `tsc`，但沒有 React／Next 型別：只能 grep 自己改的檔案找真的錯。
- `node --test web/tests/*.test.ts` 可以直接跑。
- **本機 PostgreSQL 16**：`service postgresql start` 後，用 `su postgres -c "psql ..."` 依序跑 `supabase/tests/local_shim.sql` → `supabase/migrations/0*.sql` → `supabase/tests/rls_test.sql`，看到 `RLS OK` 才請使用者在 Supabase 執行新 migration。**檔案要複製到 postgres 讀得到的資料夾**（例如 `/tmp/rls210`；`/tmp/claude-0` 沒有權限）。沙盒重開後資料庫要重建。
- push 分支和 main 都可以；**push tag 會 403**，標籤要使用者在 GitHub 網頁打。`gh` 只能用 REST（`gh api repos/StupidLlama/football/...`）。
- **Stop hook**：commit 作者要是 `Claude <noreply@anthropic.com>`（`git -c user.name=Claude -c user.email=noreply@anthropic.com commit ...`），分支要有遠端追蹤。hook 說「unpushed」但 `git ls-remote` 顯示遠端已經是最新時，是本機的 `origin/xxx` 過期：`git update-ref refs/remotes/origin/vX.Y <sha>`。
- 開新分支：`git switch -c v2.11 origin/main`，推：`git push -u origin v2.11`。

**Claude in Chrome**
- 先 `tabs_context_mcp(createIfEmpty: true)`，在**自己的新分頁**測。
- `screenshot`／`left_click` 有時逾時：改用 `javascript_tool`（`element.click()`、讀 `innerText`；React 輸入框要用原生 setter + `input` 事件）。逾時 2～3 次就停下來請使用者幫忙點。
- 視窗用 `resize_window` 縮到 390 時，實際可視寬度大約 400；360 寬用 `document.documentElement.style.zoom = String(400/360)` 模擬。
- `ConfirmButton`（按兩下才執行）：兩次點擊要放在**同一個** `browser_batch` 裡。
- `<dialog>` 用 `document.querySelector('dialog[open]')` 找按鈕（更新視窗、瀏覽器提醒、回饋表單都是 `<dialog>`）。**不要觸發瀏覽器原生的 `beforeunload` 對話框**。
- 測瀏覽器提醒：Chrome 電腦版不會跳；要模擬的話在 DevTools 換 User-Agent，或直接請使用者用手機測。
- 登入由使用者自己做；助手不輸入密碼、不填金鑰。

**上線流程**
- 新功能放 `vX.Y` 分支，不要直接 push main。
- 寫程式 → 沙盒 PostgreSQL 跑 rls_test → 使用者在 Supabase 執行 migration + rls_test → 使用者電腦跑測試（含 `npm.cmd run build`）→ Claude in Chrome 在 localhost 驗收（測試隊）→ **問使用者測試是否全部通過** → 合併 main（fast-forward）→ `gh api repos/StupidLlama/football/commits/<sha>/status` 等 Vercel success → 用正式網址確認 → 使用者打標籤 → `updates.ts`／CLAUDE.md／HANDOFF。

**v2.10 新增的坑**

- `local_shim.sql` 現在也模擬 Supabase 的「public 新函式預設給 anon、authenticated 執行權限」。新函式忘了 `revoke` 時，沙盒會跟正式環境一樣被 `rls_test.sql` 最後的總檢查抓到。
- `next.config.mjs`：正式版讀不到 `NEXT_PUBLIC_SUPABASE_URL` 會**建置失敗**（故意的，不放寬 CSP）。本機 `npm run dev` 不受影響。
- 沙盒的 shell 連不到正式網站（curl 403）；要看正式網站的標頭，用 Claude in Chrome 在頁面裡 `fetch('/', {method:'HEAD'})`。
- Claude in Chrome 測下載：攔 `URL.createObjectURL` 讀內容、把 `a.click()` 換掉，就不會真的下載到使用者電腦。
- 使用者的 Chrome 有一個安全外掛會在 Console 印很多 `chrome-extension://…` 的訊息，那不是網站的錯誤；看錯誤用 `onlyErrors: true`。
- 使用者有 skill `football-security-review`（v2.10 存的資安檢查流程），每版上線前可以照它重跑。


## 7. 待辦（不屬於 v2.11，但別忘了）

- v2.9 的「還沒驗收」：iPhone Safari 加到日曆、送回饋 1 分鐘內 Discord 收到、聊天室打字時回饋按鈕消失、`evan` 看回覆、瀏覽器提醒、`V2_9_SETUP.md` 第 5、6 節（關 Google 表單、貼加入訊息到隊群組）。**關卡：隊友日常都用新網站。**
- v2.8 留下的：iPad 寬度（進步分頁、賽季分頁）、`evan` 看別人報告時看不到出席率、三季以上的趨勢圖。
- 評估過、還沒排版本：回饋截圖（Supabase Storage，要改政策、升 `POLICY_VERSION`）、可訂閱日曆網址（第二個給 anon 的函式，每人一組權杖）。結論在 `SECURITY_REVIEW.md`。
- **提醒通知等使用者接 LINE 機器人再做**；接好之前 `.ics` 不放 VALARM、不做推播。
- 多語系：v2.12。
- v2.7.1、v2.6.x、v2.5 還沒親眼驗收的項目（見舊的交接說明 `git log -p docs/HANDOFF.md`）。
- v2.3、v2.6.2 沒打過標籤（可打可不打）。
- 球場「自由擺放」先不做。
- v3：影片分析照 `docs/PROJECT_PLAN.md`。
