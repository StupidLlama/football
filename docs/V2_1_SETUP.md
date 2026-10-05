# v2.1 上線步驟（照順序做）

v2.1 = 帳號系統：Google / Email 登入、用 Team ID 加入球隊、一個帳號加入多隊、教練碼升級身分、認領名單上的自己。
v1 網站（Streamlit）完全不受影響，隊友照常使用。

所有指令都在專案資料夾的終端機執行（Windows 用 `py`）。

## 0. 事前準備

- `V2_SETUP.md` 的第 1–4 步做完（資料表建好、權限測試通過）。第 5 步匯入可以之後再做。

## 1. 拿到最新的程式

```
git pull
py -m pip install -r backend/requirements.txt
```

## 2. 跑測試（不用連資料庫）

```
py -m pytest
```

全部通過才繼續。

## 3. 建立 v2.1 的資料表和函式

先預覽：

```
py -m backend.scripts.migrate
```

應該只列出 `0003_accounts.sql`。確認後真的執行：

```
py -m backend.scripts.migrate --apply
```

> **Team ID 會換掉**：v2.0 匯入時自己取的 `CSIE-2026` 會自動換成隨機 8 碼（例如 `K7Q4-MZP9`）。
> 到 Supabase 的 **SQL Editor** 執行下面這行就看得到新的：
>
> ```sql
> select name, season, code from public.teams;
> ```
>
> 之後要重新匯入 v1 資料，用 `--code` 指定新的 Team ID：
> `py -m backend.importer --code K7Q4-MZP9 --name 資訊系足 --season 2026-27 --dry-run`

## 4. 權限測試

```
py -m backend.scripts.rls_check
```

看到 `RLS OK` 就是通過。這次多測了：同一個帳號在兩隊身分不同、Team ID 輸錯被鎖、教練碼輸錯被封鎖、認領要教練確認、球員不能把自己設成管理者或改名字。測試資料最後全部還原。

## 5. 開啟登入方式

### 5-1. Google 登入（約 15 分鐘）

1. 到 [Google Cloud Console](https://console.cloud.google.com/) 建一個新專案（例如 `football-potato`）。
2. 左邊選單「API 和服務」→「OAuth 同意畫面」：
   - 使用者類型選「外部」，填應用程式名稱（Football Analysis Potato）和你的 Email。
   - 範圍用預設的 email、profile、openid 就好。
   - 先維持「測試」狀態：只有加進「測試使用者」的 Google 帳號能登入。**把自己加進去**，要找隊友一起試也把他們加進去（最多 100 個）。
   - 改成「正式版」要先有隱私權政策網址，這是 v2.2.1 的工作。
3. 「憑證」→「建立憑證」→「OAuth 用戶端 ID」→ 類型選「網頁應用程式」：
   - 「已授權的重新導向 URI」填 `https://你的專案代號.supabase.co/auth/v1/callback`
     （專案代號就是 `.env` 裡 `SUPABASE_URL` 中間那一段）
4. 記下「用戶端 ID」和「用戶端密鑰」。**用戶端密鑰不要貼到任何檔案或 GitHub。**
5. 回到 Supabase：**Authentication → Sign In / Providers → Google**，打開，貼上用戶端 ID 和密鑰，儲存。

### 5-2. Email 登入

**Authentication → Sign In / Providers → Email**：確認是開啟的。

- 預設會開「Confirm email」：註冊後要到信箱點確認連結才能登入。建議保持開啟（確認 Email 真的是本人的）。
- Supabase 內建的寄信服務每小時只能寄很少封，測試時大量註冊會卡住；要給很多人用時再設定自己的寄信服務（SMTP）。

### 5-3. 登入後跳回哪裡

**Authentication → URL Configuration → Redirect URLs** 加上：

```
http://127.0.0.1:8000/**
```

## 6. 啟動後端，打開測試頁

```
py -m uvicorn backend.main:app --reload
```

用瀏覽器打開 http://127.0.0.1:8000/dev ，用 Google 登入。

- 這一頁只在你自己的電腦打得開（後端只讓 127.0.0.1 看到它）。v2.2 的正式網站做好後會刪掉。
- 網址一定要用 `127.0.0.1`，不要用 `localhost`，不然登入後會跳不回來（跟第 5-3 步填的要一樣）。

## 7. 把自己設成系統管理者

先在測試頁登入一次（帳號才會建立），再到 Supabase 的 **SQL Editor** 執行（換成你登入用的 Email）：

```sql
update public.profiles set is_admin = true
 where user_id = (select id from auth.users where email = '你的 Email');
```

回到測試頁重新整理，會出現「系統管理者」標籤和「建立隊伍」區塊。

## 8. 試用流程（驗收：同一個帳號在兩隊身分不同）

1. **加入自己的隊**：在「加入球隊」輸入第 3 步查到的 Team ID。
2. **升級成教練**：因為你是管理者，選到這一隊時會看到「教練專區」→ 產生教練碼 → 在上面的「升級成教練」輸入它。
3. **認領自己**：在「認領名單上的自己」選你的名字，再到教練專區的成員名單按「確認」。
4. **第二支隊**：在「系統管理者：建立隊伍」建一支測試隊，用它的 Team ID 加入，但**不要**兌換教練碼。
5. 切換上方的球隊選單：一隊顯示「教練」、另一隊顯示「球員」，教練專區只在第一隊出現 → 驗收通過。

找一位隊友一起試的話（記得先把他加進 Google 的測試使用者）：

- 他加入、認領，你在成員名單按確認
- 請他故意輸錯教練碼 5 次 → 你的成員名單會出現「教練碼封鎖中」和「解除封鎖」按鈕

## 9. 打標籤

程式已經由 Claude push 到 GitHub 的 `main`；雲端那邊不能 push 標籤，所以標籤由你打。上面的步驟都確認沒問題後：

```
git tag v2.1
git push origin v2.1
```

## v2.1 的規則整理

| 項目 | 規則 |
| --- | --- |
| Team ID | 隨機 8 碼（例如 `K7Q4-MZP9`），大小寫、空白、`-` 都不影響；教練可以重設，重設後舊的立刻失效，已加入的人不受影響 |
| Team ID 輸錯 | 同一個帳號 15 分鐘內錯 5 次 → 鎖 15 分鐘 |
| 教練碼 | 10 碼（例如 `ABCDE-FGHJK`），預設 7 天有效（1–30 天），有效期間可以給好幾位教練用，教練可以作廢；只存雜湊 |
| 教練碼輸錯 | 在某一隊錯 5 次 → 這個帳號在那一隊不能再兌換，直到該隊教練或管理者解除 |
| 認領 | 隊友選名單上的自己，或申請新增名字；教練確認才生效；一位球員只能連一個帳號 |
| 教練權限 | 產生 / 作廢教練碼、重設 Team ID、確認認領、解除封鎖、移出**球員** |
| 系統管理者 | 建立隊伍（附第一組教練碼）、取消教練身分、移出教練；也能做教練能做的事 |
| 離隊 | 誰都可以離開；最後一位教練不能離開 |
