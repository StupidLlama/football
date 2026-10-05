# v2.2.1 上線步驟（照順序做）

v2.2.1 = 隱私權政策、服務條款、第一次登入要同意、下載我的資料、刪除帳號、聯絡我們（通知到 Discord）、安全標頭。
畫面上的「教練」全部改叫「球隊管理員」（資料庫裡的值還是 `coach`，不用改資料）。

## 1. 拿到最新的程式、跑測試

```
git pull
py -m pytest
cd web
npm run typecheck
npm test
cd ..
```

全部通過才繼續。

## 2. 建立 v2.2.1 的資料庫函式

```
py -m backend.scripts.migrate
```

應該只列出 `0005_privacy.sql`。確認後執行：

```
py -m backend.scripts.migrate --apply
py -m backend.scripts.rls_check
```

看到 `RLS OK` 就是通過。`0005` 新增了：

| 東西 | 做什麼 |
|---|---|
| `profiles.policy_version` | 記錄你同意的是哪一版政策（只留最新一版） |
| `accept_policies` | 按「同意並繼續」 |
| `export_my_data` | 設定 → 下載我的資料（JSON） |
| `delete_my_account` | 刪除帳號：能力表、自我介紹一起刪；名單上的名字留著，變成「未認領」 |
| `delete_unlinked_player` | 球隊管理員刪掉沒人認領的名字 |
| `contact_messages` + `send_contact_message` | 聯絡我們（每人每小時最多 5 則） |

> 已經登入的人下次打開網站會先看到同意頁，同意後才能繼續用（包括你自己）。

## 3. 建立 Discord 伺服器和 Webhook（通知用）

「聯絡我們」的訊息一定會存在資料庫（設定 →「網站管理員：聯絡訊息」看得到）；Webhook 只是讓你在 Discord 收到通知。

1. Discord 左邊 **＋** → **自己建立** → 取名（例如 `Football Analysis Potato`）。
2. 建一個文字頻道，例如 `#網站訊息`。
3. 頻道名稱旁的齒輪 → **整合** → **Webhook** → **新 Webhook** → 取名 → **複製 Webhook 網址**。
4. ⚠️ 這個網址等於密碼：拿到的人都能在頻道裡發訊息。不要貼在 GitHub、聊天、截圖裡。

## 4. 在 Vercel 加環境變數

Vercel → 專案 → **Settings → Environment Variables**：

| 名稱 | 值 | 備註 |
|---|---|---|
| `DISCORD_WEBHOOK_URL` | 剛剛複製的網址 | **不要**加 `NEXT_PUBLIC_`，它只在伺服器用 |
| `NEXT_PUBLIC_CONTACT_EMAIL` | 之後新開的聯絡信箱 | 可以先不填 |

加完到 **Deployments** → 最新一筆的 `⋯` → **Redeploy**（環境變數要重新部署才生效）。

本機想測的話，把同樣兩行加進 `web/.env.local`。

## 5. 驗收（手機和電腦都試）

1. 登入 → 出現同意頁；兩個都勾才按得下去 → 進到選球隊。
2. 頁尾有隱私權政策、服務條款、聯絡我們、GitHub 原始碼連結，沒登入也打得開前兩個。
3. 設定 → 隱私與帳號：看得到同意的版本和日期、資料存放地區；按「下載」會下載 JSON。
4. 聯絡我們送一則測試訊息 → Discord 頻道收到通知；設定 → 網站管理員：聯絡訊息看得到，按「標記已處理」。
5. 管理專區 → 填表進度：沒認領的名字旁邊有「刪除」。
6. （用測試帳號）設定 → 刪除帳號 → 輸入「刪除」→ 回到首頁並顯示已刪除；名單上那個名字變回未認領。
7. 順便做 v2.2 剩下的：手機 3 分鐘內填完能力表。

## 6. Google 登入改成正式版

Google Cloud Console → **Google Auth Platform**（舊名 OAuth 同意畫面）：

1. **品牌**：
   - 應用程式首頁：`https://football-analysis-potato.vercel.app`
   - 隱私權政策：`https://football-analysis-potato.vercel.app/privacy`
   - 服務條款：`https://football-analysis-potato.vercel.app/terms`
   - 授權網域：`vercel.app` 不能當授權網域的話，先維持測試模式，等有自己的網域再改（見下面）。
2. **目標對象** → **發布應用程式**（測試中 → 正式版）。只用 email、profile、openid，不需要 Google 審核。
3. 正式版之後不用再一個一個加測試使用者。

> 如果 Google 要求驗證網域而 `vercel.app` 過不了：先維持「測試中」，把隊友加進測試使用者（上限 100 人）；之後買網域（每年約 NT$400）再發布。

## 7. 打標籤

GitHub → Releases → **Draft a new release** → 標籤 `v2.2.1`、目標 `main` → 發布。
