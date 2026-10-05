# v2.2 上線步驟（照順序做）

v2.2 = 新網站（Next.js）第一版：登入、加入球隊、找到自己、選球隊、我的、球隊首頁、球員列表（排行榜合併）、球員報告、比較、能力表（F9）、教練專區、設定。組隊、比賽、練習先標「即將推出」。
畫面照 v2.1.1 的設計稿。v1 網站（Streamlit）完全不受影響，隊友照常使用。

網站在瀏覽器裡**直接連 Supabase**（不經過 FastAPI）：讀資料靠 RLS 把關，加入、認領、送出能力表這類動作呼叫資料庫函式。所以只要部署網站本身（Vercel），不用部署後端。

指令都在專案資料夾執行（Windows 用 `py`；`npm` 用 cmd 比較不會遇到 PowerShell 的權限問題）。

## 0. 事前準備

- v2.1 的步驟做完（`V2_1_SETUP.md`），Google / Email 登入可以用。
- 電腦有 Node.js（cmd 輸入 `node -v` 有版本號，要 22.18 以上；建議裝 nodejs.org 的 LTS 版）。

## 1. 拿到最新的程式、跑測試

```
git pull
py -m pytest
```

全部通過才繼續。

## 2. 建立 v2.2 的資料庫權限和函式

```
py -m backend.scripts.migrate
```

應該只列出 `0004_web.sql`。確認後真的執行：

```
py -m backend.scripts.migrate --apply
py -m backend.scripts.rls_check
```

看到 `RLS OK` 就是通過。這次多測了：

- 能力表的格式檢查（1–5 分、位置格式、連按兩次只算一次）
- 還沒認領不能填
- 不能清空整張表
- 教練不能直接改 Team ID

> `0004` 做了兩件事：
> 1. Supabase 預設把資料表的「全部權限」給登入的人（連 TRUNCATE 清空整張表都有，而且 TRUNCATE 不受 RLS 管），這裡先全部收回，再只給網站用得到的。
> 2. 新增 `submit_self_rating` 函式（送出能力表）。

## 3. Supabase 設定（網站要直接連資料庫）

1. **Project Settings → Data API**：**Exposed schemas** 裡要有 `public`。
2. **Authentication → URL Configuration → Redirect URLs**：加上 `http://localhost:3000/**`（本機測試用）。
3. **Project Settings → API Keys**：記下 **Project URL** 和 **publishable key**（舊介面叫 `anon` `public`）。

   ⚠️ **`secret` / `service_role` 那把絕對不要放進網站**：它會跳過所有權限規則。

## 4. 設定網站的環境變數

```
cd web
copy .env.example .env.local
notepad .env.local
```

把兩行換成第 3 步記下的值，存檔：

```
NEXT_PUBLIC_SUPABASE_URL=https://你的專案代號.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

`.env.local` 已經在 `.gitignore` 裡，不會上傳。這兩個值本來就會出現在使用者的瀏覽器裡，是公開的；真正擋住別人的是 RLS。

## 5. 安裝、檢查、在本機打開

還在 `web` 資料夾：

```
npm install
npm test
npm run typecheck
npm run dev
```

- `npm install` 第一次要幾分鐘，會產生 `node_modules/`（不上傳）和 `package-lock.json`（**要上傳**，見第 8 步）。
- `npm test`：評分計算的測試（跟 Python 版算出一樣的結果）。
- `npm run typecheck`：TypeScript 型別檢查，有錯誤就把訊息貼給 Claude。
- `npm run dev` 之後用瀏覽器打開 http://localhost:3000 。要停止就在 cmd 按 `Ctrl + C`。
- 網址用 `localhost`，不要用 `127.0.0.1`（要跟第 3 步的 Redirect URLs 一樣，不然登入後跳不回來）。

## 6. 本機試用（驗收）

1. 首頁按「開始使用」→ 用 Google 登入。你在兩支球隊，會看到「今天看哪一隊？」和每一隊的提醒。
2. 進資訊系足 → 預設是「我的」：球員卡、雷達圖、待辦、裁判任務。
3. 「能力表」：照 5 個類別點 21 項分數，最後選位置和弱腳 → 送出。中途重新整理頁面，填過的會留著。
4. 「球員」：
   - 切換顯示（五大類別 / 各類別）、排序、高低、格子顯示「分數 / 隊內名次」。
   - 點任何一列打開球員報告。
   - 「比較」分頁選兩個人。
5. 「教練專區」：
   - 能力表進度：誰還沒填、誰還沒有帳號。
   - 成員：確認認領、移出。
   - Team ID 與教練碼。
   - 球隊設定：聯賽隊名要填「資訊」，首頁的下一場和裁判任務才對得起來。
6. 縮小瀏覽器寬度（或按 F12 切換成手機模式）：左上角的選單按鈕會打開側邊選單。

## 7. 部署到 Vercel

1. 到 https://vercel.com/new → **Import** `StupidLlama/football`。
2. 設定：
   - **Project Name**：`football-analysis-potato`（網址會是 `football-analysis-potato.vercel.app`，被用走的話 Vercel 會加尾碼）
   - **Root Directory**：按 Edit，選 **`web`**（很重要，不然會找不到網站）
   - **Framework Preset**：Next.js（會自動選好）
   - **Environment Variables**：加兩個，名稱和值跟 `.env.local` 一樣：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. 按 **Deploy**，等 1–2 分鐘。網址在專案首頁的 **Domains**（正式網址：https://football-analysis-potato.vercel.app ）。不要用很長、中間有亂碼的那種，那是單次部署的預覽網址。
4. 回到 Supabase **Authentication → URL Configuration**：
   - **Site URL** 改成 Vercel 的網址（Email 確認信會連到這裡）
   - **Redirect URLs** 加上 `https://football-analysis-potato.vercel.app/**`（換成你的網址）
   - 原本的 `http://127.0.0.1:8000/**`、`http://localhost:3000/**` 留著，本機測試還要用
5. 之後每次 push 到 `main`，Vercel 會自動重新部署（只改 Python 也會重新部署一次，沒關係）。

> Google 登入還在「測試」狀態：只有加進 Google Cloud「測試使用者」的帳號能用 Google 登入，其他隊友先用 Email 註冊。改成正式版需要隱私權政策網址（v2.2.1）。

## 8. 上傳 package-lock.json

`package-lock.json` 記錄每個套件的確切版本，Vercel 和其他電腦裝出來才會一模一樣：

```
cd ..
git add web/package-lock.json
git commit -m "web：package-lock.json"
git push
```

## 9. 手機驗收

用手機打開 Vercel 的網址：

1. 登入 → 能力表從頭填一次，計時：**3 分鐘內填完**就達到 v2.2 的完成條件。
2. 填到一半關掉瀏覽器再打開，會接著填。
3. 球員列表不用左右滑就看得到全部欄位。

## 10. 打標籤

```
git tag v2.2
git push origin v2.2
```

## v2.2 的規則整理

| 項目 | 規則 |
| --- | --- |
| 網站 → 資料庫 | 網站用 publishable key 直接連 Supabase；每一列能不能看、能不能改由 RLS 決定；動作走資料庫函式 |
| 資料表權限 | 先全部收回再只給需要的（`0004_web.sql`）；任何人都不能清空資料表；Team ID 只能用「重設」改 |
| 能力表 | 21 項 1–5 分（能力清單來自 `config/settings.toml`）；每次送出新增一筆、保留歷史，網站顯示最新一筆；10 秒內重複送出只算一次 |
| 能力表草稿 | 存在使用者自己的瀏覽器，送出後清掉 |
| 誰能填 | 只有連到名單的本人（還沒認領、等教練確認中都不能填） |
| 能力清單同步 | 改 `config/settings.toml` 的能力或權重後，執行 `py web/scripts/sync_config.py`；忘記的話 `py -m pytest` 會失敗 |
| 文字大小 | 設定頁選，只存在這台裝置 |
