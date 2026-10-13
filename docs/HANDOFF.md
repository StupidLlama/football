# 交接說明：v2.9 → v2.10

> 給下一個工作階段（新的 Claude 對話，或 VS Code 裡的 Claude Code）看的。每完成一個小版本或大一點的修補版就整份覆蓋；舊版本留在 git 歷史（`git log -p docs/HANDOFF.md`）。
> 寫於 2026-10-13，對應 main 上的 v2.9 commit `6341553`（標籤 `v2.9`；之後只多了這份文件和 CLAUDE.md 的更新）。
> **v2.10 是 v2 的最後一版**，做完就要切到 v3（影片分析）。v2.10 上線後的交接說明要照 CLAUDE.md「階段切換」的規定寫得更詳細。

## 0. 開場怎麼用

新對話第一句貼：

```
讀 StupidLlama/football 的 docs/HANDOFF.md、CLAUDE.md 和 docs/SPEC.md，接著做 v2.10 視覺改版與完整資安檢查。先列計畫（大分類＋細項）和要我決定的事（用答案表），等我確認再動手。
```

**建議模型**
- 開場（讀資料、列計畫、拆 v2.10 的順序）和**完整資安檢查**（RLS、security definer 函式、CSP、金鑰、git 歷史）→ **Opus**。
- 計畫確認後，照設計稿改畫面、CSS、動畫、補測試、寫文件 → 可以切 **Sonnet**。
- 掃大量檔案、整理 `npm audit` 輸出這類雜事 → 子代理用 **Haiku**。
- 助手不能自己換模型：開工前提醒使用者在 App 切換，等使用者說好再開工。

**建議拆法**（開場時跟使用者確認）：v2.10 很大（M），建議拆兩段，各自上線、各自打標籤：
1. **v2.10a 資安檢查**（先做：改的是權限和標頭，風險高、要先穩；適合 Opus）
2. **v2.10b 視覺改版**（後做：改很多畫面，適合 Sonnet）

## 1. 專案目標（大方向）

- **Football Analysis Potato**：給業餘足球隊用的免費、開源（AGPL-3.0）網站。現在只有作者自己的球隊（NCKU 資工系隊）在用，之後要開放其他隊。
- 同時是軟體工程課的專題：最終目標是**從比賽影片自動分析**（YOLO 辨識 → 追蹤 → 事件 → 依位置的表現評分）。
- 開發分四個階段（`docs/SPEC.md`「版本規劃」）：
  1. v1.x Streamlit 舊網站（**v2.9 已退役**，只剩搬家公告）
  2. **v2.x 全隊可用的基本功能（不需要影片）← 現在在這裡，v2.9 已完成，下一個是 v2 最後一版 v2.10**
  3. v3.x 影片分析
  4. v4.x 依位置評分、PR 值、開放其他隊
- v2.10 之後：多語系（使用者決定放 v2.10 之後），然後進 v3。

## 2. 目前線上狀態

| 東西 | 狀態 |
|---|---|
| 正式網站 | https://football-analysis-potato.vercel.app — **v2.9 已上線（main @ `6341553`，2026-10-13）**，`/updates` 確認顯示 v2.9。**v2.9 起是唯一的正式網站** |
| 舊網站 | https://football-analysis-potato.streamlit.app — 只顯示「搬家了」公告＋新網站按鈕（`config/settings.toml` 的 `[site] moved_to`）。程式碼留在 repo 當 Clean Architecture 課程範例 |
| 資料庫 | Supabase（東京），migration **0001–0013 都已執行**，`rls_test.sql` 在 Supabase 回報 RLS OK |
| GitHub 標籤 | v1.0–v1.4.2、v2.0、v2.1、v2.2、v2.2.1、v2.4.1、v2.5、v2.6、v2.6.1、v2.7、v2.7.1、v2.8、**v2.9（`6341553`）**。v2.3、v2.6.2 沒打過 |
| 隱私權政策 | **POLICY_VERSION = 2026-10-13**（v2.8 升的）。v2.9 只補文字（回饋會記錄網站版本和粗略裝置），**沒升版本** |
| 更新紀錄 | `web/lib/updates.ts` 最新是 v2.9（`big: true`：「意見回饋和加到日曆」） |
| 分支 | `v2.9` 和 `main` 在同一個 commit；v2.10 從 `origin/main` 開新分支 |
| 測試資料 | 「測試隊」有兩個賽季（舊 `226b4199…` 已封存、新 `77bad98a…`）、可能有「（未命名）」組隊草稿、v2.9 的測試回饋。使用者決定**殘留資料留著**。帳號 `林宥成`（網站管理員＋球隊管理員）、`evan`（一般球員）。**只能用測試隊測，絕對不要動「資訊系足」** |

## 3. v2.9 做了什麼（意見回饋 F10＋加到日曆＋全隊上線＋舊網站退役）

### 做了哪些決定（使用者在答案表確認過，2026-10-13）

1. 「聯絡我們」**升級成意見回饋**：同一張 `contact_messages` 表、同一個入口、同一個 Discord Webhook（不另開 feedback 表）。
2. **截圖先不做**（v2.10 跟資安檢查一起評估 Supabase Storage）。
3. 回覆**只在網站內通知**（側邊欄數字、「我的回饋」），不寄 Email。
4. **只有登入的人**能送（沿用一小時 5 則的限制）。
5. 隱私權政策**只改文字、不升 `POLICY_VERSION`**（v2.8 大家才剛同意過）。
6. Google 登入已經是正式版。
7. **不另外找人試用**，v2.9 做完直接全隊上線。
8. Streamlit 只留搬家公告；程式碼**原地保留**（課程要看四層架構）。
9. Google 表單停止收回覆（試算表留著）。
10. 多語系放 v2.10 之後。
11. `.ics` 加到日曆放 v2.9；**提醒通知等接 LINE 機器人再做**（`.ics` 裡不放 VALARM）。
12. 最後追加（使用者要求）：**不是 iOS Safari 的手機／平板跳一次提醒視窗**，說明加到日曆和 Google 登入在那些瀏覽器可能不順。

### 檔案

| 部分 | 檔案 |
|---|---|
| 資料庫 | `supabase/migrations/0013_feedback.sql`：`contact_messages` 新欄位 `version / device / reply / replied_at / reply_read_at`；狀態改成 `new / doing / done`；先 `drop` 舊的三參數 `send_contact_message` 再建新的（`version`、`device` 有預設值）；`set_feedback_status`、`reply_feedback`（函式裡檢查 `is_admin`）、`mark_feedback_read`（只動 `user_id = auth.uid()`）；收回直接 update 權限、刪掉 0005 的 update policy；`export_my_data` 加回饋欄位。**不掛 `season_guard`**（回饋屬於使用者，不屬於球隊）。權限測試在 `supabase/tests/rls_test.sql` 的 v2.9 段 |
| 計算（純 TS） | `web/lib/feedback.ts`（`deviceLabel`、`pagePath`、`statusLabel`、`hasUnreadReply`、`feedbackBadge`、`sortFeedback`）、`web/lib/ics.ts`（`icsTime`、`escapeText`、`foldLine`、`practiceEvent`、`matchEvent`、`seasonEvents`、`buildIcs`、`icsFileName`）、`web/lib/browser-notice.ts`（`browserNotice(ua, touchPoints)` → `ios-inapp / ios-other / android-inapp / android` 或 null） |
| API | `web/lib/api.ts` 的 contact 段（我的回饋、全部回饋、改狀態、回覆、標記已讀）；`web/app/api/contact/route.ts`（伺服器端，多送 `version`、`device`，Discord 訊息 `allowed_mentions: { parse: [] }`） |
| 畫面 | `components/feedback.tsx`（`FeedbackFab` 右下角按鈕，`focusin` 時藏起來；回饋表單；`FeedbackNavLink` 側邊欄數字）、`app/feedback/page.tsx`（我的回饋／回饋管理，`tab === "admin" && isAdmin`）、`app/contact/page.tsx`、`app/settings/page.tsx`（改成「意見回饋」連結）、`components/add-to-calendar.tsx`（下載 `.ics`）、練習頁「整季加到日曆」、`practice-day-panel.tsx`、比賽詳情頁、`components/browser-notice.tsx`（`BrowserNoticePopup`，localStorage `fap.browserNoticeSeen` 記住看過哪一種）、`app/providers.tsx`（掛 `FeedbackFab`、`BrowserNoticePopup`）、`globals.css`（`.fb-fab`；`.main, .page, .narrow` 下方留 88px） |
| 舊網站 | `app.py`（`if config.moved_to():` 顯示公告後 `st.stop()`，在 `st.navigation` 之前）、`infra/config.py`（`load_moved_to`、`moved_to`）、`config/settings.toml`（`[site] moved_to`） |
| 政策／更新 | `app/privacy/page.tsx`（裝置種類、網站版本）、`web/lib/updates.ts`（v2.9，`big: true`） |
| 測試 | `web/tests/v29.test.ts`、`tests/test_v29.py`（0013 靜態檢查、只有管理員的函式、沒有直接 update、狀態值網站↔資料庫一致、不是球隊表、`.ics` 只在瀏覽器且沒有 VALARM、舊網站公告、**rls_test.sql 的每個 update／delete 都要有 where**）；`tests/test_v271.py`、`tests/test_v28.py` 跟著改 |
| 文件 | `docs/V2_9_SETUP.md`、`docs/SPEC.md`（F10、版本表）、`CLAUDE.md`（v2.9 規則） |

### 測試結果

- 沙盒 `node --test web/tests/*.test.ts`：**127 項全過**（含瀏覽器提醒 2 項）。
- 沙盒 `pytest --continue-on-collection-errors`：**156 passed、3 skipped**；6 個 collection error 是沙盒沒有 `pandas`（已知）。
- 沙盒 PostgreSQL 跑 0001–0013 → `rls_test.sql`：RLS OK；使用者在 Supabase 也跑過，回報「rls ok」。
- **v2.9 踩到的坑**：`rls_test.sql` 原本有一行沒加 `where` 的 `update ability_ratings`，在正式資料庫會碰到舊賽季的真實資料，被 `season_guard` 擋下（`season_archived`）。已修，並加了回歸測試 `test_rls_test_never_writes_real_rows`。**以後寫 rls_test 一律只動測試自己新增的資料。**
- Vercel production build 成功（沙盒連不到 npm，用 `gh api` 看部署狀態）。

### 還沒驗收（使用者還沒回報結果）

- [ ] 使用者電腦：`py -m pytest`、`npm.cmd test`、`npm.cmd run typecheck`（瀏覽器提醒是最後加的，**typecheck 只有使用者電腦能跑**）。
- [ ] iPhone Safari：「📅 加到日曆」會問要不要加到行事曆、時間地點對；「整季加到日曆」只有還沒結束的。
- [ ] 送回饋後 **1 分鐘內 Discord 收到通知**（SPEC 完成標準）。
- [ ] 聊天室打字時回饋按鈕消失；手機寬 360／390 按鈕不擋住頁面最下面的東西。
- [ ] `evan`：側邊欄數字 → 看回覆 → 數字消失；看不到「回饋管理」。
- [ ] 瀏覽器提醒：iPhone 的 Chrome、LINE 內建瀏覽器、Android 各跳一次，按「知道了」後不再跳；iPhone Safari 和電腦不跳。
- [ ] `V2_9_SETUP.md` 第 5 節：跑 SQL 確認 v1 資料都在、關掉 Google 表單「接受回應」。
- [ ] `V2_9_SETUP.md` 第 6 節：貼加入訊息到隊群組（換成真的 Team ID）。**關卡：隊友日常都用新網站**——上線幾天後看管理專區誰還沒認領／沒填能力表、看「回饋管理」。
- [ ] v2.8 留下的：iPad 寬度（進步分頁、賽季分頁）、`evan` 看別人報告時看不到出席率、三季以上的趨勢圖。

### 討論過、還沒決定

- **Android「加到 Google 日曆」按鈕**：Google 日曆 App 不能直接開 `.ics`，可以加一個用網址（`calendar.google.com/calendar/render?action=TEMPLATE&...`）開的按鈕。只適合單一行程，整季不行。小改動（Sonnet）。使用者還沒回答要不要做、要放 v2.9.1 還是併進 v2.10。
- **可訂閱的日曆網址**（自動更新）：需要公開網址＋權杖，會碰到權限和資安，所以放 v2.10 跟資安檢查一起評估。

## 4. 下一版：v2.10 視覺改版＋完整資安檢查（v2 最後一版）

**SPEC**：`docs/SPEC.md` 版本表 v2.10（規模 M）。完成條件：**360／390 寬和 iPad 驗收；設了「減少動態效果」不播動畫；資安檢查沒有高風險問題未修**。

### A. 完整資安檢查（SPEC 原文範圍）

對照 OWASP Top 10，逐項檢查，發現的問題分級（高／中／低）修好，寫成 **`docs/SECURITY_REVIEW.md`**：

1. **每張表的 RLS**、**每個 `security definer` 函式**逐一看：有沒有 `set search_path = public`、有沒有從 `public, anon` 收回、有沒有檢查呼叫的人是誰（`auth.uid()`、`is_admin`、是不是這隊的人）、回傳的東西有沒有多給。
2. Supabase **Security Advisor**（使用者在 Supabase 網頁上看，把結果貼給助手）。
3. 金鑰有沒有出現在程式碼或 **git 歷史**（`git log -p` 搜 `service_role`、`sb_secret`、`webhook`、`private_key`）。
4. `npm audit` 和 Python 套件漏洞（沙盒連不到 npm → 請使用者在電腦跑，貼結果）。
5. **安全標頭與 CSP**（`web/next.config.*`；v2.2.1 已經有一些標頭，`test_v221.py` 有檢查）。
6. 登入和同意流程（`RequireLogin`、`POLICY_VERSION`）。
7. 輸入長度與次數限制（每個會寫資料的函式）。
8. 分享連結（`get_shared_lineup`，唯一給 anon 的函式）和 Discord webhook 會不會洩漏資料。
9. 刪帳號（`delete_my_account`）和下載資料（`export_my_data`）是否完整涵蓋 0001–0013 所有表。
10. 順便評估：回饋截圖（Supabase Storage）、可訂閱的日曆網址——兩個都會開新的權限面，結論寫進報告，要做的話另外排版本。

### B. 視覺改版（SPEC 原文）

- **C「戰情室」風格**：卡片變少、KPI 合成一條；字體：標題霞鶩文楷、內文思源黑體、數字 Barlow Semi Condensed。
- **新 Logo**：馬鈴薯足球圖＋「FOOTBALL ANALYSIS」窄體大寫＋「Potato」Kaushan Script；深色底 #E9B45C／淺色底 #9C5F27；favicon 另描簡化 SVG。**馬鈴薯足球是使用者用 Gemini 生成的圖，開工時請使用者提供原檔**（用圖片之前要先問使用者）。
- **圖表捲到才播動畫**（長條從 0 長、雷達從中心擴散），用 `IntersectionObserver` 接 `components/anim.tsx` 的 `useTween`。
- **未登入首頁**：三人傳球、射中橫桿彈回第一人的循環動畫（取代戰術板）。
- 參考其他運動網站挑的功能（開場時問使用者想參考哪些）。
- 示範稿在使用者的 Design 畫布「**Potato 視覺改版示範**」（使用者選 C 戰情室、Logo 用 Kaushan Script 版）。

### 已經有的、可以重用的

- 顏色、字體、圓角集中在 `web/app/globals.css`；舊網站的 `infra/charts/style.py` 已退役，**不用跟著改**（但 CLAUDE.md「UI 風格」那段要更新）。
- 動畫：`components/anim.tsx`（`useTween`、`AnimatedNumber`）、globals.css 的 `.line-draw` `.pop-in` `.fade-up`；新的 CSS 動畫要加進 `@media (prefers-reduced-motion: reduce)`（`test_v23.py` 會檢查）。
- 字體目前從哪裡載入要先查（`app/layout.tsx`）；新字體會影響 CSP 的 `font-src`／`style-src`，**所以資安檢查先做、再改字體比較順**。

### 要先用答案表問使用者的

1. **拆版本**：(a) 拆成 v2.10a 資安＋v2.10b 視覺，各自上線 (b) 一次做完一起上線 (c) 先視覺再資安。
2. **Android Google 日曆按鈕**：(a) 併進 v2.10 (b) 先做成 v2.9.1 小修 (c) 不做。
3. **截圖、可訂閱日曆**：資安檢查評估後 (a) 有結論就在 v2.10 做 (b) 只寫結論、之後再排 (c) 不做。
4. **Logo 原檔**：什麼時候提供？要不要用 `prompt-for-other-ai` 重新生成透明背景版？
5. **參考網站**：視覺改版想參考哪些運動網站／App 的功能？
6. **更新視窗**：視覺改版上線時要不要用 `big: true`（大家會看到「有新功能」）？
7. **資安檢查的結果要不要公開**：`docs/SECURITY_REVIEW.md` 放在公開 repo——高風險問題修好之前不要 push 細節（建議：先修再寫）。
8. 多語系：確認還是放 v2.10 之後（v2.11？還是 v3 之前）。

### 注意

- 新 migration 是 **`0014_xxx.sql`**；已執行過的不要改。屬於球隊的新表要掛 `season_guard`（`tests/test_v28.py` 的 `GUARDED`）。
- 資安修補如果改了權限，`rls_test.sql` 要補測試，而且**每個 update／delete 都要有 where**（`test_v29.py` 會擋）。
- 改 CSP 時小心：Supabase（`*.supabase.co` 的 REST 和 Realtime WebSocket）、Google 登入、字體、Vercel 的東西都要放行，不然整個網站會壞。改完在正式網站的瀏覽器 Console 看有沒有 CSP 錯誤。
- 視覺改版改很多畫面：每一頁都要在 360／390 寬和 iPad 看過（沒有左右捲動、雷達圖能力名稱不重疊）。
- 用詞：「網站管理員」「球隊管理員」，不要寫「教練」「系統管理者」（`test_v221.py`）。
- 右下角回饋按鈕（`FeedbackFab`）和瀏覽器提醒視窗：改版時確認位置和樣式跟新風格一致，不能擋住送出鍵。
- **v2.10 上線後是階段切換（v2 → v3）**：交接說明要寫整個 v2 的成果和沒做完的、資料庫全部的表和函式、v3 要用的新工具和新環境（YOLO、OpenCV、GPU／Colab、影片儲存）、風險。

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
- 開新分支：`git switch -c v2.10 origin/main`，推：`git push -u origin v2.10`。

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
- 寫程式 → 沙盒 PostgreSQL 跑 rls_test → 使用者在 Supabase 執行 migration + rls_test → 使用者電腦跑測試 → Claude in Chrome 在 localhost 驗收（測試隊）→ **問使用者測試是否全部通過** → 合併 main（fast-forward）→ 用正式網址確認 → 使用者打標籤 → `updates.ts`／CLAUDE.md／HANDOFF。

## 7. 待辦（不屬於 v2.10，但別忘了）

- 第 3 節「還沒驗收」那幾項，尤其是**全隊上線的關卡**（隊友日常都用新網站）。
- **提醒通知（比賽、練習前提醒）等使用者接 LINE 機器人再做**；接好之前不要在 `.ics` 放 VALARM、不要做推播。
- 多語系：v2.10 之後。
- v2.7.1 的「還沒驗收」（離開保護確認視窗、更新紀錄小圓點、iPad 組隊賽制說明）沒有回報結果。
- v2.6.1／v2.6.2 兌換管理員碼的畫面還沒親眼驗收；v2.6 真的 Discord 推播、真的手機；v2.5 系際聯賽賽程一鍵帶入。
- v2.3、v2.6.2 沒打過標籤（可打可不打）。
- 球場「自由擺放」先不做，有空可以再提。
- 使用者之後會裝插畫風格的外掛，加入手繪／人性化的視覺元素（可能跟 v2.10 視覺改版一起討論）。
- v3：影片分析照 `docs/PROJECT_PLAN.md`（Video translate 放 `adapters/video.py`，OpenCV／YOLO 放 `infra/video/`）。舊 Streamlit 的四層架構（`domain/`、`stats/`、`adapters/`、`infra/`）和 `tests/test_architecture.py` 會在 v3 繼續用。
