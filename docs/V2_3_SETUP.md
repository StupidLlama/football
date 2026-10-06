# v2.3 上線步驟（照順序做）

v2.3 = 雷達圖「自評／比賽表現／兩者疊圖」切換、和同位置平均比較、**球員生涯**、圖表動畫、雷達圖顯示分數、手機版調整。
程式在 GitHub 的 `v2.3` 分支，**還沒合併到 main**，所以正式網站還是 v2.2.1。

## 1. 資料庫（已完成 2026-10-06）

- [x] Supabase → SQL Editor 執行 `supabase/migrations/0006_career.sql`
- [x] 執行 `supabase/tests/rls_test.sql`，最後出現 `RLS OK`

`0006` 新增了：

| 東西 | 做什麼 |
|---|---|
| `memberships.career_shared` | 這一隊有沒有放進生涯，預設「沒有」 |
| `set_career_shared` | 設定 → 我的生涯的開關，只能改自己的 |
| `get_career` | 讀某位球員的生涯：隊友只拿得到他放進生涯的隊伍＋這一隊，本人拿得到全部 |
| `export_my_data`（更新） | 下載我的資料多了生涯開關 |

只新增東西，不會動到現有的球員和能力表。

## 2. 本機測試

在 VS Code 終端機（PowerShell 擋 `npm` 的話，改打 `npm.cmd`）：

```
git switch v2.3
py -m pytest
cd web
npm.cmd run typecheck
npm.cmd test
npm.cmd run dev
```

用 Chrome 打開 http://localhost:3000，登入一般球員帳號。

### 桌機（已測過，通過）

- [x] 球員報告 → 能力分析：自評／比賽表現（顯示「尚無比賽數據」）／兩者疊圖
- [x] 位置分頁：長條和數字動畫
- [x] 比較：全隊平均、同位置平均
- [x] 設定 → 我的生涯：開關、重新整理後維持、直接打開 `/settings#s-career` 會捲過去
- [x] 生涯分頁：每一隊的「已放進生涯／沒放進生涯」標籤
- [x] 隱私權政策「誰看得到」有生涯的說明

### 手機（要再測一次）

F12 → Ctrl+Shift+M → 選一台寬 390 的手機 → F5。

- [ ] 雷達圖外圍的能力名稱不重疊（能力分析、比較頁都看）
- [ ] 生涯分頁「每一隊」：隊名一行、標籤會換行、長條在下一行，不和標籤疊在一起
- [ ] 生涯趨勢圖：字看得清楚，圖大約 230 像素高
- [ ] 設定 → 我的生涯：按開關馬上切換、顯示「儲存中…」
- [ ] 生涯分頁最上面的說明和「放進生涯的球隊」數字，開關開／關時會跟著變
- [ ] 頁尾連結好點
- [ ] 最好用真的手機再看一次（手機連不到 localhost，要等合併上線後用正式網址看）

### 有真實資料後再看

- [ ] 兩位球員比較：換人時雷達圖平滑變形（隊上要有第二個人填能力表）
- [ ] 隊友看你的生涯：你沒放進生涯的隊伍，隊友看不到
- [ ] 兩個時間點比較：要填第二次能力表

## 3. 合併到 main（正式上線）

確定手機版沒問題後：

```
git switch main
git pull
git merge v2.3
py -m pytest
git push
```

push 到 main 後 Vercel 會自動重新部署。上線後：

- 因為隱私權政策改版（`POLICY_VERSION = 2026-10-06`），大家下次登入會先看到同意頁，按同意才進得去。可以先在隊上群組說一聲。
- 打開 https://football-analysis-potato.vercel.app 用手機實際看一次。

## 4. 打標籤

GitHub → Releases → Draft a new release → Tag 輸入 `v2.3`、Target 選 `main` → 寫幾行更新內容 → Publish。
