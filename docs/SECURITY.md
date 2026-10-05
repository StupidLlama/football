# 資安與個資事件處理

給網站管理員看的：平常怎麼保管金鑰、出事時照什麼順序處理。
有人發現漏洞請不要開公開的 GitHub Issue，從網站的「聯絡我們」選「個資、帳號」回報。

## 金鑰放在哪裡

| 金鑰 | 放哪裡 | 外洩會怎樣 |
|---|---|---|
| Supabase publishable key | 網站（`NEXT_PUBLIC_…`），本來就公開 | 沒關係，權限由 RLS 把關 |
| Supabase secret / service_role key、資料庫密碼 | 只在自己電腦的 `.env` | **最嚴重**：可以跳過所有權限讀寫全部資料 |
| Discord Webhook 網址 | Vercel 環境變數 `DISCORD_WEBHOOK_URL` | 別人能在頻道發訊息（看不到資料） |
| Google 服務帳號 JSON | 自己電腦、Streamlit secrets | 能讀 v1 的 Google 試算表（隊員個資） |
| Google OAuth Client Secret | 只在 Supabase 後台 | 別人能假冒我們的登入畫面 |

規則：這些檔案都不 commit（`.gitignore` 已排除）；不貼在聊天、截圖、Issue 裡；不用的電腦登出 Supabase / Vercel / GitHub，並開兩步驟驗證。

## 換金鑰（覺得可能外洩就換，不用等確定）

- **Supabase secret key**：Project Settings → API Keys → 建新的 secret key → 改自己電腦 `.env` → 刪掉舊的。
- **資料庫密碼**：Project Settings → Database → Reset database password → 改 `.env` 的連線字串。
- **Discord Webhook**：頻道設定 → 整合 → Webhook → 刪掉舊的、建新的 → 改 Vercel 環境變數 → Redeploy。
- **Google 服務帳號**：Google Cloud → IAM → 服務帳號 → 金鑰 → 刪掉舊的、建新的 → 改 secrets。
- **OAuth Client Secret**：Google Cloud → 用戶端 → 新增密鑰 → 貼到 Supabase Authentication → Providers → Google → 刪掉舊的。

如果金鑰曾經被 push 到 GitHub：**先換金鑰**（git 歷史裡的刪不乾淨，換掉才安全），再處理歷史紀錄。

## 個資外洩時的處理順序

個資法要求發現外洩後通知當事人（`/privacy` 的「我們怎麼保護資料」段落也這樣承諾）。

1. **止血**（當天）：換掉可能外洩的金鑰；必要時 Supabase 暫停專案或 Vercel 暫停部署。
2. **記錄**：什麼時候發現、怎麼發現、哪些人哪些資料（帳號 Email、能力自評、自我介紹…）、可能多久前開始。截圖存起來。
3. **查原因**：Supabase → Logs（API、Auth、Postgres）；GitHub 有沒有 commit 到秘密；RLS 有沒有被改（跑 `py -m backend.scripts.rls_check`）。
4. **通知**（查明後儘快）：用球隊群組和 Email 通知受影響的人：發生什麼、哪些資料、我們做了什麼、他們可以做什麼（例如改 Google 密碼、刪帳號）、聯絡方式。
5. **修好再上線**：補測試（`supabase/tests/rls_test.sql` 或 `tests/`）擋住同樣的問題。
6. **事後檢討**：在這個檔案最下面記一筆（不寫個資）。

## 平常的檢查

- 改權限、加資料表、加函式：跑 `py -m pytest` 和 `py -m backend.scripts.rls_check`。
- 每學期看一次：Supabase 的成員和 API Keys、Vercel 的成員和環境變數、Google Cloud 的金鑰、Discord 的 Webhook，用不到的刪掉。
- GitHub → Settings → Code security：開 Secret scanning 和 Dependabot alerts。

## 事件紀錄

（目前沒有）
