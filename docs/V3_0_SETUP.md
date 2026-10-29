# v3.0 上線步驟（照順序做）

v3.0 = **比賽影片分析的第一步：分析排隊 ＋ 品質檢查 ＋ Colab**（SPEC 版本表 v3.0）：

- 比賽踢完後，球隊管理員在比賽頁按「**建立影片分析**」（填影片檔名）→ 網站給一組**連線碼**（只顯示一次）。
- 管理員打開 Colab 筆記本 `analysis/potato_v3.ipynb`，掛自己的 Google Drive、填影片路徑、貼上連線碼 → 筆記本用 OpenCV 做品質檢查，邊跑邊回報進度。
- 比賽列表和比賽頁顯示「**已結束 · 分析中 35%**」（Realtime 自動更新，另外每 20 秒重讀一次），完成後顯示品質等級和白話原因。
- 新頁面 `/video-guide`「怎麼拍比賽影片」。
- 隱私權政策補「比賽影片分析」和「Google Colab、Drive」兩列；**不升 `POLICY_VERSION`**（影片不經過我們的伺服器）。
- **影片本身完全不經過網站和資料庫**（Supabase 免費方案單檔 50 MB）。YOLO 辨識是 v3.1。

品質規則（`domain/video.py`，門檻在 `config/settings.toml` 的 `[video]`）：

| 結果 | 條件 |
|---|---|
| 拒絕 | 解析度不到 1080p、幀率不在 25–60、長度不在 1–120 分鐘、讀不到畫面 |
| 可信度低 | 畫面糊、太暗／太亮、晃、看不到場地線（取樣畫面的中位數） |
| 合格 | 上面都沒有 |

> 糊、暗、晃、場地線的門檻是先猜的數字，**要用真的影片校正**（第 4 節）。

## 0. 順序很重要：先跑資料庫，再開網站

v3.0 的網站一進球隊就會讀 `match_videos`。**沒執行 `0015` 就打開 v3.0 的網站，整個球隊頁會讀取失敗。**

## 1. 資料庫

- [ ] Supabase → SQL Editor → 貼上 `supabase/migrations/0015_video.sql` → Run
- [ ] 再貼 `supabase/tests/rls_test.sql` → Run，最後要出現 `RLS OK`

| 東西 | 做什麼 |
|---|---|
| `match_videos` | 一場比賽的一次影片分析：檔名、狀態（排隊中／處理中／完成／失敗／取消）、進度、品質等級和原因、長度／幀率／解析度。本隊看得到；掛 `season_guard`；加進 Realtime |
| `video_tokens` | 分析權杖的 sha256、到期時間（7 天）、回報次數；**誰都不能直接讀** |
| `create_video_job`、`cancel_video_job` | 只有球隊管理員；比賽開始後才能建、同一場一次只能跑一個、一隊一天最多 20 次 |
| `report_video_job` | Colab 拿權杖回報（**不用登入**，第二個開放給 anon 的函式，理由在 `docs/SECURITY_REVIEW.md` 最後） |

## 2. 本機測試

```powershell
cd "$env:USERPROFILE\Desktop\軟工\football-team-site"
git fetch origin
git switch v3.0
git pull origin v3.0
py -m pytest
cd "$env:USERPROFILE\Desktop\軟工\football-team-site\web"
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

想在本機也跑 OpenCV 的測試（不裝會跳過 2 項）：

```powershell
cd "$env:USERPROFILE\Desktop\軟工\football-team-site"
py -m pip install -r requirements-video.txt
py -m pytest tests/test_v30.py
```

## 3. 瀏覽器驗收（localhost:3000，只用「測試隊」）

- [ ] 已結束的比賽 → 比賽頁有「影片分析」；球員帳號（`evan`）看不到建立表單
- [ ] 球隊管理員填檔名 → 建立 → 看到連線碼、「複製連線碼」「打開 Colab 筆記本」
- [ ] 同一場再建一次 → 「這場比賽的影片還在分析」
- [ ] 「取消分析」→ 可以重新建立
- [ ] 還沒踢的比賽沒有「影片分析」
- [ ] `/video-guide` 沒登入也看得到
- [ ] 手機寬 360／390：連線碼會換行，不會左右捲動

## 4. Colab 驗收（筆記本要先在 main 上才打得開；合併前可以手動上傳 `analysis/potato_v3.ipynb` 到 Colab）

- [ ] 挑一場網路上的比賽影片（1080p）放進自己的 Drive（**有版權，不要分享**）
- [ ] 筆記本「全部執行」→ 授權 Drive → 填路徑 → 貼連線碼
- [ ] 網站比賽頁：等待分析 → 分析中 xx%（不用重新整理）→ 完成，有品質結果
- [ ] 用一支 720p 或很暗的影片再跑一次 → 「影片不合格：解析度不到 1080p」或「畫面太暗」
- [ ] 跑到一半在網站按取消 → 筆記本停下來，說「已經取消或權杖失效」
- [ ] 記下每支影片的結果，門檻不合理的告訴我（例如明明很清楚卻說太糊），改 `[video]` 的數字

## 5. 上線

- [ ] 第 1–4 節都過了 → 告訴助手「測試全部通過」→ 合併 `v3.0` 到 main → 等 Vercel 部署成功
- [ ] 正式網站確認比賽頁、`/updates` 顯示 v3.0
- [ ] GitHub 打標籤 `v3.0`（Target：main）
