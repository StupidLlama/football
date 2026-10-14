# v2.10 上線步驟（照順序做）

v2.10 = **完整資安檢查（v2 最後一版的前半；視覺改版是 v2.11）**。畫面上看不出差別，改的是「誰能寫什麼、能寫多長」：

- 能力表只能用「送出能力表」那個按鈕存（資料庫會檢查 1–5 分、送出時間）；不能再繞過網站直接寫進資料表。
- 球員、球隊、賽程的文字欄位在資料庫加上字數和格式上限（比網站的限制寬一點，正常使用不會碰到）。
- 「下載我的資料」多了裁判任務、聊天室已讀時間、加入球隊和兌換管理員碼的嘗試紀錄。
- 同意政策後的跳轉網址檢查更嚴（只能留在網站裡）。
- 多一個安全標頭 `Cross-Origin-Opener-Policy`。
- `rls_test.sql` 最後多了整個資料庫的總檢查：每張表都有 RLS、沒登入的人沒有任何資料表權限、security definer 函式都固定 `search_path`、只有分享陣容那一個函式開放給沒登入的人。

完整的檢查結果寫在 `docs/SECURITY_REVIEW.md`（**上線之後**才放進 repo）。

## 0. 順序：先檢查舊資料 → 跑資料庫 → 再開網站

網站本身不需要新的資料庫欄位，順序反過來也不會壞；但 `0014` 要先確認舊資料沒有超過新的上限（第 2 步）。

## 1. 拉新分支

```powershell
cd "$env:USERPROFILE\Desktop\軟工\football-team-site"
git fetch origin
git switch v2.10
git pull origin v2.10
```

## 2. 先檢查舊資料（只讀，不會改東西）

- [ ] Supabase → SQL Editor → 貼上 `supabase/tests/v210_precheck.sql` → Run
- [ ] 每一列的 `bad` 都是 **0** → 繼續第 3 步。**有不是 0 的：先停下來，把結果貼給助手**

## 3. 資料庫

- [ ] SQL Editor → 貼上 `supabase/migrations/0014_security.sql` → Run
- [ ] 再貼 `supabase/tests/rls_test.sql` → Run，最後要出現 `RLS OK`

`0014` 改了：

| 東西 | 做什麼 |
|---|---|
| `ability_ratings` | 收回登入的人直接 insert / delete 的權限，刪掉 `ratings_insert`、`ratings_delete` 規則；只能用 `submit_self_rating` |
| `players` | 名字 1–40 字、暱稱 ≤ 40、給球隊的話 ≤ 1000、背號 ≤ 3 碼、位置格式像 `CB` 或 `LB/RB`（各最多 10 個、不能同時擅長又不擅長） |
| `teams` | 隊名 1–40、賽季 ≤ 20、聯賽隊名 ≤ 40 |
| `fixtures` | 隊名、主審 ≤ 40、備註 ≤ 500、邊審最多 4 個 |
| `export_my_data`（更新） | 多了裁判任務、聊天室已讀時間、加入球隊和兌換管理員碼的嘗試紀錄 |

上限都是 `NOT VALID`：舊資料不檢查，新增和修改才檢查。

## 4. 本機測試

```powershell
cd "$env:USERPROFILE\Desktop\軟工\football-team-site"
py -m pytest
```

```powershell
cd "$env:USERPROFILE\Desktop\軟工\football-team-site\web"
npm.cmd test
npm.cmd run typecheck
```

助手的沙盒結果：`node --test` 130 項全過；`pytest` 166 passed、3 skipped（6 個 collection error 是沙盒沒有 pandas）；PostgreSQL 跑 0001–0014 + `rls_test.sql` → `RLS OK`。

## 5. 瀏覽器驗收（localhost:3000，只用「測試隊」）

```powershell
cd "$env:USERPROFILE\Desktop\軟工\football-team-site\web"
npm.cmd run dev
```

- [ ] 用 `evan` 送一次能力表 → 成功，球員報告看得到新的分數
- [ ] 設定 → 改暱稱、給球隊的話、擅長位置 → 存得起來
- [ ] 管理專區 → 改隊名、改球員名字和背號 → 存得起來
- [ ] 設定 → 下載我的資料 → 打開 JSON，看得到 `referee_duties`、`join_attempts`
- [ ] 瀏覽器 Console（F12）沒有紅色的 CSP 錯誤

## 6. 舊網站的金鑰（建議做，不影響新網站）

舊的 Streamlit 網站已經只剩搬家公告，但 Streamlit Cloud 上可能還存著 **Google 服務帳號金鑰**（讀「資訊系足」試算表用的），以及有隊員名字的 `[jersey_numbers]`、`[roles]`。用不到的金鑰和個資留著，就是多一個會外洩的地方：

- [ ] Streamlit Cloud → 那個 App → Settings → Secrets：**整個清空**。搬家公告在 `app.py` 最前面就 `st.stop()`，設定在 `config/settings.toml` 的 `[site] moved_to`（不在 secrets），清空後公告照樣顯示
- [ ] Google Cloud Console → IAM 與管理 → 服務帳戶 → 那個帳戶 → 金鑰：把金鑰**停用或刪除**

## 7. 合併、上線

- [ ] 問助手「測試是不是全部通過」→ 合併到 main（Vercel 自動部署）
- [ ] 正式網站打開幾頁、登入、送一次回饋：Console 沒有 CSP 錯誤
- [ ] 助手把 `docs/SECURITY_REVIEW.md`、`updates.ts`（`big: false`）、CLAUDE.md 一起 push
- [ ] GitHub 打標籤 `v2.10`（Target 選 `main`）
