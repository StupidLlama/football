# 交接說明：v2.3 → v2.4

> 給下一個工作階段（新的 Claude 對話，或 VS Code 裡的 Claude Code）看的。每完成一個小版本（v2.3 → v2.4）或大一點的修補版就整份覆蓋；舊版本留在 git 歷史（`git log -p docs/HANDOFF.md`）。
> 寫於 2026-10-07，對應 commit：main 上的 v2.3 標籤。

## 0. 開場怎麼用

新對話第一句貼：

```
讀 StupidLlama/football 的 docs/HANDOFF.md、CLAUDE.md 和 docs/SPEC.md，接著做 v2.4。先列計畫（大分類＋細項），等我確認再動手。
```

**建議模型**：開場（讀資料、列計畫）用 **Opus**，v2.4 有拖曳互動和分享連結的權限設計，規劃要仔細；計畫確認後，照計畫寫畫面、補測試可以切 **Sonnet**。切換要使用者在 App 裡手動做，助手要在開工前提醒（見 CLAUDE.md「版本交接規則」）。

## 1. 專案目標（大方向）

- **Football Analysis Potato**：給業餘足球隊用的免費、開源（AGPL-3.0）網站。現在只有作者自己的球隊（NCKU 資工系隊）在用，之後要開放其他隊。
- 同時是軟體工程課的專題：最終目標是**從比賽影片自動分析**（YOLO 辨識 → 追蹤 → 事件 → 依位置的表現評分）。
- 開發分四個階段（`docs/SPEC.md`「版本規劃」）：
  1. v1.x Streamlit 舊網站（已完成，v2.8 退役）
  2. **v2.x 全隊可用的基本功能（不需要影片）← 現在在這裡，v2.3 已完成**
  3. v3.x 影片分析
  4. v4.x 依位置評分、PR 值、開放其他隊
- 原則：跟影片無關的功能全部在 v2.8 前做完，就算影片分析來不及，全隊也有完整可用的網站。

## 2. 目前線上狀態

| 東西 | 狀態 |
|---|---|
| 正式網站 | https://football-analysis-potato.vercel.app（Next.js，Vercel，push 到 main 自動部署）— **v2.3 已上線** |
| 舊網站 | https://football-analysis-potato.streamlit.app（並存到 v2.8） |
| 資料庫 | Supabase（東京），migration 0001–0006 都已執行；`rls_test.sql` 在正式資料庫通過 |
| GitHub | StupidLlama/football，main = v2.3。標籤 v1.4.2、v2.0、v2.1、v2.2、v2.2.1、v2.3 |
| 隱私權政策 | POLICY_VERSION = 2026-10-06（v2.3 改版，大家下次登入要重新同意） |
| 測試資料 | v2.3 測試用的帳號在「測試隊」（2026-27）：隊上只有作者一人、填過 1 次能力表，生涯開關是關的 |

## 3. v2.3 做了什麼

### 功能
- **雷達圖切換**：球員報告 → 能力分析，「自評／比賽表現／兩者疊圖」。比賽表現在 v3–v4 前顯示「尚無比賽數據」，不顯示 0 分。
- **比較頁**：「另一位球員／全隊平均／同位置平均」（同位置 = 自評擅長該位置的隊友平均，不含自己，`LB` 算在 `LB/RB` 裡）。
- **球員生涯**：一個帳號在每個賽季的球隊各有一個身分。
  - 設定 → 我的生涯：每隊一個開關（預設關、只有本人能改）。按下去馬上切換（樂觀更新）、顯示「儲存中…」。
  - 球員報告 → 生涯分頁：說明列（依開關狀態寫）、4 張數字卡（本人看到「放進生涯的球隊」，隊友看到「生涯球隊」）、每一隊清單（「已放進生涯／沒放進生涯 · 只有這一隊看得到／只有你看得到」）、生涯趨勢折線圖（每隊取第一次和最新一次能力表）、兩個時間點雷達比較＋進步／退步前 5 項。
  - 誰看得到：隊友只看得到他放進生涯的隊伍＋這一隊；本人看全部。只回傳隊名、賽季、背號、隊長標記、擅長位置、能力表歷史，不會帶出別隊其他人的資料。
- **圖表動畫**：雷達圖從中心長出、換資料時平滑變形；折線從左畫到右、點依序出現；長條和數字從 0 長到最終值。系統開「減少動態效果」就不跑。
- **提示框**：滑鼠移到（手機點）雷達圖某項能力、趨勢圖某個時間點會顯示數值。點擊一律「顯示」不切換（曾經因為切換造成第一次點擊沒反應）。
- **手機版**：雷達圖能力名稱在 360／390 寬不重疊（錨點隨角度平滑移動、手機縮小字並外推）、生涯清單手機換行、趨勢圖手機版座標、頁尾連結加高到 40px。

### 檔案

| 檔案 | 內容 |
|---|---|
| `supabase/migrations/0006_career.sql` | `memberships.career_shared`、`set_career_shared(team, shared)`、`get_career(team, player)`、更新 `export_my_data` |
| `supabase/tests/rls_test.sql` | 生涯 10 條權限測試；另外修了 v2.2.1 的聯絡訊息測試（正式資料庫已有真的訊息，改成只算 `created_at = now()` 的） |
| `web/lib/career.ts` `compare.ts` `anim.ts` | 純計算：生涯時間線、同位置平均／差距／進退步、緩動與插值 |
| `web/components/anim.tsx` | `useReducedMotion`、`useTween`、`AnimatedNumber` |
| `web/components/line-chart.tsx` | 趨勢折線圖（寬窄兩種座標，`ResizeObserver` 判斷） |
| `web/components/career.tsx` | 生涯分頁 |
| `web/components/ui.tsx` | `Radar` 加提示框、動畫、手機標籤排版；`Bar` 動畫 |
| `web/app/t/[teamId]/players/[playerId]/page.tsx` | 雷達切換、生涯分頁 |
| `web/app/t/[teamId]/players/page.tsx` | 比較頁三種對象 |
| `web/app/settings/page.tsx` | 「我的生涯」區塊、`#s-career` 自動捲動 |
| `web/app/privacy/page.tsx`、`web/lib/policies.ts` | 政策加生涯說明、版本 2026-10-06 |
| `web/app/globals.css` | `.seg` `.switch` `.radar-tip` `.career-row` 動畫 class，全部有 reduced-motion 版本 |
| `tests/test_v23.py`、`web/tests/v23.test.ts` | 靜態檢查、計算測試 |
| `docs/V2_3_SETUP.md` | 上線步驟和驗收清單 |

### 測試結果
- Python 201 個通過（7 個跳過是需要 streamlit／資料庫的）、網站計算測試 22 個、型別檢查 0 錯誤、`rls_test.sql` 在本機和正式資料庫都通過。
- 桌機、手機（Chrome 開發者工具 390 寬）都用 Chrome 擴充功能實測通過。

### 還沒驗收（資料不夠）
- 兩位球員比較時雷達圖的變形動畫（隊上要有第二個人填能力表）
- 隊友看別人的生涯（只看得到放進生涯的隊伍）
- 兩個時間點比較（要填第二次能力表）
- 用真的手機看正式網站

## 4. 下一版：v2.4 組隊（F3）

**SPEC**：組隊（F3）：拖曳、鎖定、分享連結和陣容圖片。完成條件：分享的陣容只能看。F3 詳細規格在 `docs/SPEC.md` 的「F3 組隊」。

**已經有的東西**
- Python 版（v1.2–v1.3，Streamlit）：`stats/assignment.py`（匈牙利演算法，純 Python，同輸入同結果）、`stats/lineup.py`（自動排人、替補、`manual_lineup`）、`domain/formations.py`、`config/formations.toml`（11 人制 6 種、8 人制 4 種陣型和座標）、`infra/charts/lineup.py`（陣容圖、下載 PNG）。
- 新網站 `web/app/t/[teamId]/lineup/page.tsx` 現在是「即將推出」。
- v2.1.1 設計稿（Design 畫布「Potato 首頁 Demo」，https://claude.ai/artifact/MB8UpZJBaGNsdpXDFFmbZf）有可拖曳的陣容畫面，11 人和 8 人制所有陣型放在同一個清單。

**計畫草稿（給下一個工作階段參考，要先給使用者確認）**
1. 把陣型設定和匈牙利演算法搬到 `web/lib/`（純 TS，`node --test` 和 Python 版比對結果一致，同 `rating.ts` 的做法；陣型由 `web/scripts/sync_config.py` 從 toml 產生）
2. 組隊頁：選賽制和陣型、自動排、拖曳換人（手機要能用：點選兩個位置互換比拖曳可靠）、鎖定後重排、替補清單、「為什麼是他」
3. 存陣容：新 migration `0007`（陣容表，球隊管理員才能存；球員能不能存自己的草稿要問使用者）
4. 分享：只能看的連結（不用登入能不能看？要問使用者，牽涉隱私和 RLS）、陣容圖片下載
5. v2.5 才有出賽登記，所以 v2.4 先從全隊名單選人，接口留給 v2.5

**要先問使用者的決定**
- 分享連結：不用登入就能看，還是只有隊友能看？（前者要做公開的唯讀查詢，要寫進隱私權政策）
- 陣容誰能存：只有球隊管理員，還是每個人都能存自己的版本？
- 陣容圖片要不要顯示真名（貼到 IG 會公開）？

## 5. 使用者的習慣（一定要照做）

- 用**繁體中文**回覆；使用者是 NCKU 資工大一，Python 有基礎、還在學；用白話，能用足球比喻更好。
- **大改動先列待辦清單（大分類＋細項），等使用者確認再動手**；小事直接做。給選項時用編號，附上建議。
- **用圖片之前先問**。
- 做完要**在瀏覽器實際測過**，不要只說做完了。
- 進度要邊做邊回報（task 清單＋重點訊息）。
- 開工前如果這項工作適合換模型，**先提醒使用者在 App 切換**，再開始（見 CLAUDE.md「版本交接規則」）。

## 6. 環境注意事項（踩過的坑）

**使用者的電腦**
- Windows，專案在 `C:\Users\user\Desktop\軟工\football-team-site`，VS Code 繁中版。
- PowerShell 擋 `npm.ps1`：一律打 **`npm.cmd`**（例如 `npm.cmd run dev`）。Python 用 `py`。
- 本機網站：`cd web` → `npm.cmd run dev` → http://localhost:3000。開發模式第一次開每頁要編譯幾秒。

**雲端工作環境（助手自己的）**
- 連不到 npm（403）、pip 也大多裝不了：型別檢查、build、`npm test` 要在使用者電腦上跑（透過連結電腦的 shell：`node node_modules/typescript/bin/tsc --noEmit -p .`、`node --test "tests/*.test.ts"`）。
- 沒有 pytest：用 scratchpad 裡自己寫的小型 pytest 替代品跑 `tests/`，或在使用者電腦跑。
- 有本機 PostgreSQL 16：`service postgresql start`，套 `supabase/tests/local_shim.sql` + 全部 migration，再跑 `rls_test.sql`。
- 有 Playwright Chromium（`/opt/pw-browsers`）：可以無頭量版面（v2.3 用它量雷達圖標籤重疊）。
- **不能建 GitHub Release、不能 push 標籤**（403）：標籤請使用者在 VS Code 打 `git tag -a vX -m "..."` + `git push origin vX`。

**把程式同步到使用者電腦**
- 用 `git bundle` 傳過去再 `git fetch` + `merge --ff-only`／`reset --hard`，**同步完一定要在使用者電腦上 grep 新內容確認**。v2.3 曾經直接覆蓋單一檔案，結果使用者電腦拿到舊版，擴充功能測了半天的舊畫面。
- 刪除權限要先跟使用者要（`device_request_delete_permission`），不然 git 會留下 `.git/index.lock` 擋住使用者自己的 git。
- 在使用者電腦用 `git -c core.autocrlf=true`，跑 status 用 `GIT_OPTIONAL_LOCKS=0`。

**測試網站**
- 最好用的方式：請使用者在自己的 Chrome 登入，再把測試指令貼給 **Chrome 擴充功能**（Claude in Chrome）的對話，它回報結果後貼回來。助手自己開的 Chrome 分頁不會共用使用者的登入狀態；內建瀏覽器的 Google 登入會卡在選帳號頁。
- 手機版：Chrome 最大化時擴充功能縮不了視窗 → 請使用者 F12 → Ctrl+Shift+M 選 390 寬裝置。**開發者工具開著時擴充功能點不到東西**，點擊類測試要關掉開發者工具再測。
- 登入一律由使用者自己做；助手不輸入密碼、不填金鑰。

**上線流程**
- 新功能先放在 `vX.Y` 分支，**不要直接 push main**（push main = Vercel 立刻上線；資料庫 migration 還沒跑的話網站會壞）。
- 順序：寫程式 → migration 給使用者在 Supabase SQL Editor 執行 → rls_test → 本機實測 → 合併 main（fast-forward）→ 使用者打標籤 → 寫新的 HANDOFF.md。

## 7. 待辦（不屬於 v2.4，但別忘了）

- v2.2.1 剩：Google 登入從「測試」切成「正式」（`docs/V2_2_1_SETUP.md`）。
- 使用者之後會建專用聯絡信箱（`NEXT_PUBLIC_CONTACT_EMAIL`）。
- 之後：語言設定（多語系）；使用者會裝插畫風格外掛，加入手繪元素。
- SPEC 最後還有沒決定的事項（例如 v2.5 要不要手動輸入進球、助攻、出場分鐘）。
