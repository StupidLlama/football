# v2.0 上線步驟（照順序做）

v2.0 = Supabase 資料庫 + 權限規則（RLS）+ FastAPI 後端 + 匯入 v1 的資料。
v1 網站（Streamlit）完全不受影響，隊友照常使用。

所有指令都在 `football-team-site` 資料夾的終端機執行。

## 0. 事前準備（已完成）

- Supabase 專案已建立，`.env` 已填好（`.env` 不會上傳到 GitHub）

## 1. 安裝套件

```
py -m pip install -r backend/requirements.txt
```

## 2. 跑測試（不用連資料庫）

```
py -m pytest
```

全部通過才繼續。`test_v20.py` 裡的 API 測試在你電腦上會真的跑（雲端那邊沒裝 FastAPI 所以跳過）。

## 3. 建立資料表

先預覽（不會動資料庫）：

```
py -m backend.scripts.migrate
```

應該列出 `0001_core_tables.sql`、`0002_row_level_security.sql`。確認後真的執行：

```
py -m backend.scripts.migrate --apply
```

到 Supabase 左邊的 **Table Editor**，應該看到 7 張表（teams、players…），每張表旁邊都標示 RLS 已開啟。

> 連不上的話：確認 `.env` 的 `DATABASE_URL` 用的是 **Session pooler**（port 5432），密碼沒有中括號。

## 4. 權限測試（最重要：證明 A 隊讀不到 B 隊）

```
py -m backend.scripts.rls_check
```

看到 `RLS OK` 就是通過。測試會建立假的隊伍和帳號，最後全部還原，資料庫不會留下東西。

## 5. 匯入 v1 的資料

Team ID 可以自己取（英文、數字、`-`、`_`，3–40 字），之後隊友用它加入。先試跑：

```
py -m backend.importer --code CSIE-2026 --name 資訊系足 --season 2026-27 --dry-run
```

會印出讀到幾位球員、幾場比賽，但不寫入。沒問題就拿掉 `--dry-run` 再跑一次。
重複執行不會產生重複資料（已存在的會更新）。

## 6. 啟動後端

```
py -m uvicorn backend.main:app --reload
```

- http://127.0.0.1:8000/health → 應該看到 `{"ok":true,"database":true}`
- http://127.0.0.1:8000/docs → 自動產生的 API 文件

其他 API 需要登入（帳號系統是 v2.1），現在打開會得到 401，這是正常的。

## 7. 上傳

```
git add -A -- . ":!run.bat"
git commit -m "v2.0：Supabase 資料表與權限規則、FastAPI 後端骨架、v1 資料匯入工具"
git push
git tag v2.0
git push origin v2.0
```

`.env`、`data/`、`secrets.toml` 都被 `.gitignore` 擋住，不會上傳。

## 本機驗證紀錄（雲端，2026-10-01）

在一個本機 PostgreSQL 16（模擬 Supabase 的 auth 與角色，`supabase/tests/local_shim.sql`）上：
- 兩個 migration 都能建立成功
- `rls_test.sql` 全部通過；故意把規則改壞（讓球員看到別隊、讓球員改裁判任務）測試都會抓到
- 匯入工具寫入 40 場比賽、8 個裁判任務，重跑第二次不會重複
- 每個 API 的查詢都在 RLS 生效下執行過：同隊看得到，不同隊和陌生人一律 404
