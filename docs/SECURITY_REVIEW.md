# Football Analysis Potato 資安檢查報告（v2.10）

> 檢查日期：2026-10-14 · 範圍：main @ `0360f06`（v2.9）＋ migration 0001–0013 · 修補：v2.10（main @ `0cfbf1f`，`0014_security.sql`，2026-10-14 上線）
> 照 OWASP Top 10（2021）分類。分級：🔴 高（可以讀到或改到別隊／別人的資料、拿到金鑰）、🟠 中（可以破壞自己隊的資料完整性、可以被拿來釣魚）、🟢 低（影響小或需要很難的條件）、ℹ️ 資訊（不是問題，記錄理由）。

## 結論

- **沒有高風險問題。** 跨隊隔離（A 隊讀不到、改不到 B 隊）在每張表、每個函式都成立，`rls_test.sql` 有自動測試。
- **2 個中風險，都已修好**（M1、M2）。
- 低風險 11 個：7 個已修、1 個需要使用者在網頁上處理（L4 舊網站金鑰）、3 個接受（記錄理由）。
- 第二輪用 [Trail of Bits](https://github.com/trailofbits/skills) 的三個檢查清單（differential-review、insecure-defaults、sharp-edges）再審一次，多找到 2 個低風險，已修。
- 金鑰：程式碼和**整個 git 歷史**都沒有真的金鑰、Webhook、私鑰或個資。

## 怎麼檢查的

| 項目 | 方法 |
|---|---|
| 資料表權限（RLS） | 沙盒 PostgreSQL 16 跑 0001–0013，**直接查最終狀態**（`pg_policies`、`information_schema.role_table_grants`、欄位權限），不是只讀 SQL 檔：後面的 migration 會蓋掉前面的 |
| security definer 函式 | 從資料庫匯出全部 60 個 security definer 函式的最終定義，逐一看：`search_path`、誰能呼叫、有沒有檢查呼叫的人、回傳有沒有多給、輸入長度和次數限制 |
| 實際攻擊測試 | 在沙盒用球員、球隊管理員身分試著繞過（`set role authenticated` ＋ 假的登入憑證），確認問題真的存在、修好後真的擋下 |
| 網站 | `web/` 全部搜尋 XSS 寫法（`dangerouslySetInnerHTML`、`innerHTML`、`eval`）、跳轉網址、localStorage、伺服器路由、安全標頭 |
| 金鑰 | 抓完整歷史（88 個 commit、12 個分支、618 個檔案版本），每個版本搜 Supabase 金鑰、JWT、Discord Webhook、私鑰、Google API key、GitHub token、資料庫連線字串、Email、手機號碼、隊長真名 |
| 套件漏洞 | 使用者電腦跑 `npm audit`、`pip-audit`（結果見下面 A06） |
| Supabase 設定 | 使用者在網頁上看 Security Advisor、Auth 設定（結果見下面 A05、A07） |

## 發現的問題

### 🟠 M1｜球員可以繞過檢查直接寫資料表（A04 不安全的設計、A08 資料完整性）— 已修

**問題**：能力表照設計要經過 `submit_self_rating`（檢查 1–5 分、能力數量、10 秒內不能重送）。但 `ability_ratings` 也開放登入的人直接 `insert`（規則只檢查「是不是自己的球員」），`players` 開放本人直接 `update`（`players_guard` 只擋名字、背號、隊長）。所以球員可以用瀏覽器的開發者工具直接呼叫 Supabase：

- 能力分數塞 `999`、文字、幾千項 → 全隊平均、排行榜、雷達圖壞掉
- `submitted_at` 寫 2099 年 → 這份永遠是「最新」，而且自己再也送不出新的（10 秒檢查）
- 暱稱、給球隊的話塞 10 萬字；擅長位置填任意字串

只影響**自己這一隊**（不能寫別隊），所以是中風險。沙盒實際試過，四種都做得到。

**修法**（`0014`）：
- 收回 `ability_ratings` 的直接 `insert`、`delete`（網站本來就只用 `submit_self_rating`；匯入工具用管理者身分不受影響）
- `players`、`teams`、`fixtures` 在**資料表本身**加字數和格式上限（`NOT VALID`：舊資料不檢查）。上限比網站寬一點，正常使用碰不到
- `rls_test.sql` 補測試：直接 insert、塞爆、亂填位置都要失敗；正常修改要成功

### 🟠 M2｜同意頁的跳轉網址可以導到別的網站（A01 存取控制：開放重新導向）— 已修

**問題**：`/consent?next=...` 用 `safeNext` 檢查只能是站內路徑（`/` 開頭、不是 `//`）。但瀏覽器解析網址時會把 Tab、換行刪掉：`/%09/evil.example` 通過檢查，實際跳到 `https://evil.example`。壞人可以傳「加入我們球隊」的連結，新隊友登入、同意政策後被帶到假的登入頁（釣魚）。

**修法**：`web/lib/nav.ts` 的 `safeNext` 拒絕所有控制字元和空白，最後用 `new URL()` 解析一次確認還在同一個網站。`web/tests/v210.test.ts` 測 14 種跳走的寫法。

### 🟢 低風險

| # | 問題 | 處理 |
|---|---|---|
| L1 | `teams`、`fixtures` 球隊管理員直接改時沒有字數上限 | 已修（併在 M1 的資料表上限） |
| L2 | 「下載我的資料」少了裁判任務、聊天室已讀時間、加入球隊／兌換管理員碼的嘗試紀錄（個資法：當事人查閱權） | 已修（`export_my_data` 補上）；`tests/test_v210.py` 規定每張新表都要分類「放不放進下載資料」 |
| L3 | 別的網站 `window.open` 我們的網站時能拿到視窗參照 | 已修：加 `Cross-Origin-Opener-Policy: same-origin`（Google 登入是整頁跳轉，不受影響） |
| L4 | 舊 Streamlit 網站退役了，但 Streamlit Cloud 可能還存著 Google 服務帳號金鑰和有隊員名字的設定 | **使用者處理**：清空 Streamlit secrets、停用服務帳號金鑰（`V2_10_SETUP.md` 第 6 節） |
| L5 | 隊友讀得到彼此 `profiles` 的 `is_admin`、`policy_version`（知道誰是網站管理員） | 接受：網站管理員本來就會出現在回饋回覆裡；收回要改欄位權限和網站讀法，好處很小 |
| L6 | `join_team`、`redeem_coach_code` 的次數限制是「先數再寫」，同時送很多個請求可以多猜幾次 | 接受：Team ID 有 31⁸ ≈ 8.5×10¹¹ 種、管理員碼 31¹⁰ ≈ 8×10¹⁴ 種，多猜幾次沒有意義 |
| L7 | 球隊管理員發練習通知、開新賽季通知到 Discord 沒有次數限制 | 接受：只有球隊管理員能發、只發到自己隊的 Discord |
| L8 | 觸發器函式 `handle_new_user` 可以被登入的人呼叫（Supabase 預設把 public 新函式的執行權限給 anon、authenticated，0003 沒收回）。直接呼叫觸發器函式本來就會失敗，沒有實際影響 | 已修：0014 收回；本機測試環境改成也模擬這個預設，`rls_test.sql` 總檢查會抓「觸發器函式可以被呼叫」 |
| L9 | 沒開「擋外洩密碼」（Leaked password protection，用 HaveIBeenPwned 檢查）。只影響用 Email＋密碼註冊的人，大部分隊友用 Google 登入 | 已修（2026-10-14 使用者在 Supabase 打開；同時把密碼最短長度設成 8，Email 確認本來就有開） |
| L10 | 讀不到 `NEXT_PUBLIC_SUPABASE_URL` 時，CSP 會悄悄放寬成允許所有 `*.supabase.co`（insecure-defaults／sharp-edges：設定壞掉時變成比較不安全） | 已修：正式版直接建置失敗（Vercel 建置失敗時舊版網站照常運作），只有本機開發才用萬用字元 |
| L11 | 管理專區「隊伍名稱」輸入框上限 60 字，但 0014 的資料表上限是 40，輸入 41–60 字會看到資料庫錯誤（differential-review 審 v2.10 自己的改動時找到） | 已修：輸入框改成 40；`tests/test_v210.py` 檢查網站上限不能比資料表寬 |

### ℹ️ 檢查過、沒有問題的（記錄理由）

- **跨隊隔離**：19 張表全部開 RLS；每條讀取規則都是 `is_member(team_id)` 或「本人」；`profiles` 只看得到同隊的人。
- **沒登入的人**：沒有任何資料表權限；60 個 security definer 函式只有 `get_shared_lineup` 能被呼叫（分享陣容，設計如此）。現在 `rls_test.sql` 最後會自動檢查整個資料庫，以後新增的表或函式忘了收權限也會被抓到。
- **security definer 函式**：全部固定 `search_path = public`；每個寫入的函式都先檢查 `auth.uid()`，再檢查是不是成員／球隊管理員／網站管理員；查不到或沒權限時回 `not_found`，不透露別隊有沒有那筆資料。
- **分享陣容** `get_shared_lineup`：分享碼 32 字元、由兩個隨機 UUID 組成（約 180 位元的亂數，猜不到）；回傳白名單（隊名、賽季、陣型、背號、比賽對手和時間）；**球員名字只有分享的人勾「顯示名字」才會出現**（v2.4 之後加的選項，CLAUDE.md 的說明已更新）；草稿的主人離隊或刪帳號，連結自動失效。
- **Discord Webhook**：網站管理員的 Webhook 只在伺服器環境變數；球隊的 Webhook 存在 `chat_discord`，**沒有任何讀取權限**（只有資料庫函式在送通知時讀），網址格式限定 discord.com；所有訊息 `allowed_mentions: { parse: [] }`（@everyone 不會真的通知）。
- **管理員碼**：只存加鹽的 SHA-256；`code_hash`、`salt` 欄位沒有讀取權限；7 天過期、可作廢、輸錯 5 次封鎖。
- **刪帳號** `delete_my_account`：刪 `auth.users` 後，profiles、memberships、回饋、聊天室已讀、嘗試紀錄用外鍵一起刪；能力表、出席、草稿陣容直接刪；聊天訊息清空內容；名單上的名字留著變未認領（政策寫明）。
- **舊賽季唯讀**：`season_guard` 用觸發器在資料庫擋，網站繞不過；`app.*` 這幾個「暫時放行」的開關只能由資料庫函式在交易裡設定，Supabase 的 API 沒有辦法讓使用者自己設。
- **XSS**：整個網站沒有 `dangerouslySetInnerHTML`、`innerHTML`、`eval`；使用者輸入一律當文字顯示（React 自動跳脫）；沒有把使用者輸入放進 `href`／`src`。
- **登入**：交給 Supabase Auth（PKCE）；伺服器路由 `/api/contact` 用使用者自己的憑證呼叫資料庫，沒有 cookie，不會有 CSRF。
- **localStorage**：存登入權杖（supabase-js 管理）、文字大小、看過哪一版更新和瀏覽器提醒，以及還沒送出的能力表草稿（只在自己的裝置上；網站沒有 XSS 寫法，別人的程式讀不到）。
- **金鑰**：git 歷史找到的 Discord 網址都是測試用的假網址（`123456…/rls-test…`、`AbCdEf…`），私鑰都是範例檔裡的 `...`。`.gitignore` 有排除 `.env*`、`secrets.toml`、`*service_account*.json`、`data/`。

## 對照 OWASP Top 10（2021）

| 類別 | 結果 |
|---|---|
| A01 存取控制失效 | M2（已修）；跨隊隔離 OK |
| A02 加密機制失效 | OK：全站 HTTPS＋HSTS 兩年；管理員碼雜湊；密碼由 Supabase 保管 |
| A03 注入 | OK：資料庫函式都用參數，沒有動態 SQL；網站沒有 XSS 寫法 |
| A04 不安全的設計 | M1（已修） |
| A05 安全設定錯誤 | L3、L8（已修）；Security Advisor 沒有 ERROR，WARN 逐條說明在下面 |
| A06 有漏洞的元件 | `npm audit`、`pip-audit` 都是 0 個漏洞（2026-10-14）；網站只有 4 個正式套件（next、react、react-dom、supabase-js） |
| A07 身分驗證失效 | 交給 Supabase Auth（PKCE）；Email 確認有開、密碼最短 8 字、擋外洩密碼已開（L9）；大部分隊友用 Google 登入 |
| A08 軟體與資料完整性 | M1（已修）；Vercel 只從 main 自動部署 |
| A09 記錄與監控不足 | 回饋有 Discord 通知；Supabase 有登入和 API 記錄（免費方案保留時間短）。小專案先這樣，v4 開放其他隊前再加強 |
| A10 SSRF | OK：伺服器只連 Supabase 和固定的 Discord 網址；球隊 Webhook 限定 discord.com 格式 |

## Supabase Security Advisor（2026-10-14）

沒有 ERROR，58 個 WARN：

| Advisor 項目 | 數量 | 結論 |
|---|---|---|
| `anon_security_definer_function_executable` | 1 | `get_shared_lineup`：分享陣容給沒登入的人看，**設計如此**（回傳白名單見上面） |
| `authenticated_security_definer_function_executable` | 55 | 54 個是網站要呼叫的動作或 RLS 規則要用的判斷函式（`is_member`、`can_manage`…：RLS 規則用呼叫者的身分執行，收回會讓所有讀取失敗），每個都在函式裡檢查身分，**設計如此**。1 個是 `handle_new_user`：L8，已修 |
| `extension_in_public` | 1 | `pg_net` 登記在 public。pg_net 的函式和表都在自己的 `net` schema，不會從 API 露出；要搬只能刪掉重裝，可能讓 Discord 通知中斷。**接受**，記成資訊 |
| `auth_leaked_password_protection` | 1 | L9 |

## CSP 的 `'unsafe-inline'`（第 9 題的評估）

現在的 CSP 允許網頁裡的內嵌程式（`script-src 'self' 'unsafe-inline'`），因為 Next.js 會在頁面裡放內嵌程式碼來啟動 React。CSP 是「就算有 XSS，壞程式也跑不起來」的第二道防線；`'unsafe-inline'` 讓這道防線變薄。

**改成 nonce 的做法**：Next.js 16 要加 `proxy.ts`（以前叫 middleware），每個請求產生一個隨機 nonce 放進 CSP 標頭，Next.js 把它加到自己的內嵌程式上。

**代價**：
- 每一頁都要在伺服器即時產生（不能再用 Vercel CDN 快取的靜態頁）：每次開頁多一趟伺服器運算，冷啟動時大約多 0.2–1 秒，Vercel 免費方案的函式用量也會變多。
- 要多維護一個檔案，出錯會讓整個網站打不開。

**風險有多大**：這道防線只在「已經有 XSS」時才有用。這次檢查整個網站沒有任何 XSS 寫法（沒有 `dangerouslySetInnerHTML`、`innerHTML`、`eval`，使用者輸入不會放進網址），React 會自動跳脫文字；而且 `connect-src` 只允許連 Supabase 和自己，就算有壞程式也很難把資料送出去。

**決定（2026-10-14，使用者選 9b）**：維持現狀，記成 🟢 低風險；v4 開放其他隊、使用者變多時再評估改成 nonce。

## 評估：回饋截圖、可訂閱日曆網址（第 3 題 b：只寫結論，另外排版本）

### 回饋截圖（Supabase Storage）

會開的新權限面：
- **上傳檔案**：要限制種類（只收 PNG／JPEG／WebP，不收 SVG，因為 SVG 裡可以藏程式）和大小（建議 ≤ 2 MB）。Supabase 免費方案總共 1 GB。
- **截圖裡可能有別人的個資**（例如聊天室畫面上隊友的名字），也可能有照片的 EXIF 位置資訊 → 上傳前在瀏覽器重新壓成 WebP（順便去掉 EXIF）；**隱私權政策要改、要升 `POLICY_VERSION`**（v2.9 決定過「要加截圖先改政策」）。
- **權限**：私人 bucket，路徑 `回饋者的 user_id/隨機檔名`，Storage 的 RLS 只讓本人上傳、本人和網站管理員讀；網站管理員看圖用有時效的簽名網址。
- **刪帳號**：Storage 的檔案不會跟著資料庫外鍵一起刪，`delete_my_account` 刪不到，要另外處理（例如刪帳號前網站先呼叫 Storage API 刪自己的資料夾）；下載我的資料也要列出截圖。
- CSP 的 `img-src` 要加 Supabase 網址。

結論：可以做，規模 S～M。要一起改政策和刪帳號流程，建議排在 v2.11 之後的小版本，不要跟視覺改版混在一起。

### 可訂閱的日曆網址（自動更新的 .ics）

會開的新權限面：
- 日曆 App（Google 日曆、iPhone 行事曆）**不會登入**，所以要一個**沒登入也能讀**的網址，網址裡帶一組秘密權杖。這等於第二個開放給 anon 的函式（現在只有 `get_shared_lineup`）。
- 權杖會被複製、轉傳，也可能留在日曆服務的記錄裡 → 要能**重發**（舊的立刻失效）、資料庫**只存雜湊**、回傳的內容只有時間、地點、對手和練習內容，**不放任何球員名字或出席**。
- 每個人一組權杖（不是每隊一組）：離隊或刪帳號時自動失效；`rls_test.sql` 的總檢查要把新函式加進「可以給 anon 的白名單」。
- 做法：`get_calendar_feed(token)`（security definer、只給 anon 和 authenticated）＋ `app/api/calendar/[token]/route.ts` 產生 `.ics`（沿用 `lib/ics.ts`）。

結論：可以做，規模 S。風險可以控制在「別人拿到網址，只看得到練習和比賽時間地點」。建議跟「Android 加到 Google 日曆」按鈕一起排一個小版本。

## 第二輪：Trail of Bits 檢查清單（2026-10-14）

用資安公司 [Trail of Bits 公開的 skills](https://github.com/trailofbits/skills)（約 7 千星，先讀過內容確認沒有外傳資料的指令）再審一次。它們原本是 Claude Code 外掛，這次照它們的流程和規則在沙盒手動跑：

| 檢查清單 | 做了什麼 | 結果 |
|---|---|---|
| differential-review | 審 v2.10 的 11 個改動檔案：拿掉的 `ratings_insert`／`ratings_delete` 規則有沒有別的地方還在用（後端只有匯入工具，用管理者身分）、新上限會不會擋到正常流程（`submit_self_rating`、`start_new_season`、`edit_player`、所有位置代碼都符合）、`safeNext` 的兩個呼叫點 | L11 |
| insecure-defaults | 用它的 37 條搜尋規則掃整個 repo（預設密碼、讀不到設定就放行、弱亂數、開放權限、除錯功能）。517 個候選，逐一確認：505 個是測試裡的 UUID（`00000000-…`）誤判 | L10；舊網站讀不到隊伍密碼時不要求密碼（ℹ️，見下） |
| sharp-edges | 在沙盒對每個動作函式丟空字串、`null`、0：加入球隊、兌換管理員碼、分享連結、生涯、進步、回饋、能力表都是「失敗就擋下」 | L10；`accept_policies` 接受任何日期格式的版本號（ℹ️：網站要求完全相同才算同意過，填未來日期也跳不過同意頁） |

ℹ️ **舊 Streamlit 網站**：讀不到 `team_password` 時直接讓人進去（本機開發方便）。網站已經只剩搬家公告（`st.stop()` 在讀密碼之前），而且 L4 清空 secrets 後也沒有資料來源，接受。球隊管理員密碼則是讀不到就關閉，用 `hmac.compare_digest` 比對，沒問題。

## 以後每一版要做的

- 新資料表：開 RLS、在 migration 收回 anon、明確 grant 給 authenticated；屬於球隊的掛 `season_guard`；決定要不要放進 `export_my_data`（`tests/test_v210.py` 會擋）。
- 新的寫入：寫成 security definer 函式（檢查身分、長度、次數），**不要開放資料表直接寫**；如果一定要直接寫，資料表本身要有 check 上限。
- 跑 `rls_test.sql`：最後的總檢查會抓到沒開 RLS、權限給太多、函式沒固定 `search_path`。
