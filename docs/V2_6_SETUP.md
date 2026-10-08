# v2.6 上線步驟（照順序做）

v2.6 = **隊伍聊天室（F6）**：所有成員都能發一般貼文、回覆（只有一層）；只有球隊管理員能發筆記／戰術
（可附正式陣容）、置頂（最多 5 則）；自己可以刪自己發的，球隊管理員可以刪任何人的（刪除＝清空內容、
留下「已刪除」的殼，回覆還看得懂）；編輯只有作者本人、不限時間；球隊管理員可以在管理專區設定
Discord Webhook，有新的主貼文（不包含回覆）就推到 Discord，沒設定只有站內未讀紅點；即時更新用
Supabase Realtime，斷線時每 30 秒輪詢補漏。

## 1. 資料庫（已完成 2026-10-08，RLS OK）

- [x] Supabase → SQL Editor 執行 `supabase/migrations/0009_chat.sql`
- [x] 執行 `supabase/tests/rls_test.sql`，最後出現 `RLS OK`（使用者在自己的 Supabase 上確認過）

`0009` 新增了：

| 東西 | 做什麼 |
|---|---|
| `messages` 表 | 一則訊息：`parent_id` 空的是主貼文、有值是回覆（只有一層）；`kind` 一般／筆記／戰術；`pinned_at`／`edited_at`／`deleted_at` |
| `chat_reads` 表 | 每個人在每隊最後讀到什麼時候（未讀紅點用）；每個人只看得到自己那一列 |
| `chat_discord` 表 | 球隊的 Discord Webhook 網址，等於密碼：沒有任何 RLS 規則，連球隊管理員都讀不到，只有資料庫函式能寫（`set_chat_discord`）和查「有沒有設定」（`get_chat_discord`） |
| Realtime | `messages` 加進 `supabase_realtime` publication，RLS 一樣把關，只收得到自己隊的 |
| `post_message` | 發文／回覆；球員只能發一般、球隊管理員才能發筆記／戰術；只能附同一隊的正式陣容；1 分鐘內最多 10 則防洗版 |
| `edit_message` | 只有作者能編輯，不限時間；編輯已刪除的訊息回 `not_found` |
| `delete_message` | 作者或球隊管理員；清空內容、留下殼，不是整列刪掉 |
| `set_pinned` | 只有球隊管理員；只能置頂主貼文；每隊最多 5 則 |
| `mark_chat_read` | 標記自己讀到哪裡 |
| `notify_discord()`（觸發器） | 新主貼文（非回覆）插入後，如果球隊設定了 Webhook，用 `pg_net` 推到 Discord；送不出去不會擋住發文；`allowed_mentions` 清空避免真的 tag 到全頻道 |
| `export_my_data` / `delete_my_account`（更新） | 下載資料多了自己發的聊天訊息；刪帳號把自己的訊息清空成「已刪除」 |

只新增東西，不會動到現有資料。

## 2. 本機測試

在 VS Code 終端機（PowerShell 擋 `npm` 的話，改打 `npm.cmd`）：

```
git fetch origin
git switch v2.6
py -m pytest
cd web
npm.cmd run typecheck
npm.cmd test
npm.cmd run dev
```

沙盒這邊已經跑過（node 內建的 TS 型別剝除，不需要 `node_modules`）：

- [x] `pytest`（含新的 `tests/test_v26.py`，22 項靜態檢查）全部通過
- [x] `node --test tests/*.test.ts`（含新的 `tests/v26.test.ts`，9 項 `lib/chat.ts` 的測試）全部通過，共 54 項
- [ ] **`npm run typecheck` 和完整的 `npm test` 要在你自己的電腦上跑一次**——沙盒這次雖然能 `npm install --dry-run`，但實際安裝套件被 403 擋掉，沒有 `node_modules`，`tsc` 看不到 React／Next.js 的型別定義，報的錯大多是環境缺套件、不是程式本身的問題

用 Chrome 打開 http://localhost:3000，登入一般球員帳號、再登入球隊管理員帳號各測一次。

### 桌機 —— 聊天室頁

- [ ] 一般球員：只能發「一般」貼文（沒有筆記／戰術的選項），看不到附陣容的選項
- [ ] 球隊管理員：可以選一般／筆記／戰術，戰術和筆記可以附上正式陣容（草稿不會出現在清單）
- [ ] 置頂（最多 5 則）：球隊管理員置頂一則後排到最上面；置頂滿 5 則時再置頂第 6 則會出現錯誤訊息
- [ ] 回覆：點「回覆」展開輸入框，送出後出現在那一串下面、照時間排
- [ ] 編輯：只有自己發的訊息才看得到「編輯」按鈕，改完顯示「已編輯」
- [ ] 刪除：自己可以刪自己的；球隊管理員可以刪任何人的；刪除後顯示「這則訊息已刪除」，底下的回覆還在
- [ ] 附的陣容連結點進去會開組隊頁、自動帶出那組陣容（`?open=` 參數）
- [ ] 未讀紅點：另一個帳號發新訊息後，側邊欄「聊天室」出現未讀數字；進入聊天室後紅點消失
- [ ] 首頁待辦：有新的置頂訊息時，「我的待辦」出現「有新的置頂訊息」

### 兩分頁即時更新（SPEC 完成標準：新訊息 2 秒內出現）

- [ ] 用 Claude in Chrome 開兩個分頁，登入同一隊的兩個不同帳號，都打開聊天室頁；一邊發文，另一邊**不用重新整理**在 2 秒內看到新訊息（Realtime）
- [ ] 如果 Realtime 一時沒有觸發，30 秒輪詢備援應該還是會補上——可以觀察久一點確認

### 管理專區 —— Discord 通知

- [ ] 球隊管理員在「管理專區 → 球隊設定」看到「聊天室的 Discord 通知」區塊，預設顯示「尚未設定」
- [ ] 貼上真的 Discord Webhook 網址（Discord 頻道設定 → 整合 → Webhook → 複製網址）、按「設定」，顯示「已設定」
- [ ] 貼錯格式的網址（例如漏了 `https://` 或不是 discord.com 開頭）會出現錯誤訊息，不會送出
- [ ] 設定後在聊天室發一則主貼文（不是回覆），Discord 頻道收到訊息；發一則回覆，Discord 不會收到
- [ ] 按「關閉通知」後變回「尚未設定」，之後發文 Discord 不會再收到
- [ ] 一般球員進管理專區看不到這個區塊（本來就被最上面的權限檢查擋住）
- [ ] 「能力表進度」頁：還有人沒填能力表時，「在聊天室提醒還沒填的人」按鈕會在聊天室發一則置頂的筆記

### 手機（360 / 390 寬）

- [ ] 用 Claude in Chrome 的 `resize_window` 縮到 360×780 和 390×844 測聊天室頁：沒有左右捲動、訊息卡片的類型標籤和時間不會擠到換行很醜、輸入框和按鈕夠大好點
- [ ] 管理專區的 Discord 設定表單在手機寬度下排版正常
- [ ] 最好再用真的手機看一次（手機連不到 localhost，要等合併上線後用正式網址看）

### 隱私權政策

- [ ] 第一次用任何帳號登入時，因為 `POLICY_VERSION` 換了日期，會被要求重新同意政策——確認彈出的畫面正常、同意後不會再跳出來
- [ ] `/privacy` 頁面看得到新增的聊天室相關說明（蒐集的資料、誰看得到、Discord、刪帳號後的處理）

## 3. 合併到 main（正式上線）

確定手機版和兩分頁即時更新都沒問題後：

```
git switch main
git pull
git merge v2.6
py -m pytest
git push
```

push 到 main 後 Vercel 會自動重新部署。上線後：

- 打開 https://football-analysis-potato.vercel.app，側邊欄「聊天室」可以正常打開（不會再是「即將推出」）。
- 跟球隊管理員說明：Discord 通知是選用的，要自己去 Discord 頻道開一個 Webhook 貼進來；沒設定也完全不影響聊天室本身。
- 提醒大家：這一版之後**重新登入要再同意一次隱私權政策**（內容加了聊天室和 Discord 的說明）。

## 4. 打標籤

GitHub → Releases → Draft a new release → Tag 輸入 `v2.6`、Target 選 `main` → 寫幾行更新內容 → Publish。

如果合併前又多修了其他 bug，照 v2.4.1 的慣例改成 `v2.6.1`。
