# 足球比賽影片分析 — 專案規劃

> 來源：軟體工程課（李信杰老師，Fall 2026）的專案規劃作業，2026-09-29 報告版本。
> 簡報：https://claude.ai/artifact/1NxjvQnrDDykdJKcibeSBi
> 這份文件把規劃帶進程式碼，之後開發以這裡為準；規劃有改就更新這份。

## 1. 要做什麼

把**比賽影片**變成教練用得到的**數據**，分成三個層級顯示：**比賽、球隊、球員**。

第一階段只做 3 個數據（做完、測完再加）：

| # | 數據 | 算法 | 需要看得到球？ |
|---|---|---|---|
| 01 | 傳球成功率 | 成功傳球 ÷ 所有傳球 | 要（最難） |
| 02 | 控球率 | 各隊持球時間佔比 | 要 |
| 03 | 跑動距離 | 每位球員跑了幾公尺 | 不用（最簡單，建議先做） |

**怎麼知道算得對**：挑一場比賽，自己手動數一次，和程式結果比對。

## 2. 架構：四層，規則在中間（Clean Architecture）

```
┌─────────────── Tools shell（最外層，工具，隨時可換）──────────────┐
│  Video input (OpenCV) · 辨識 (YOLO + ByteTrack) · Database (SQLite) · UI (Streamlit) │
│  ┌──────────── Translate shell（翻譯層，自己寫的轉換）────────────┐  │
│  │  Video translate（座標 → 足球事件）· Database reader · Result showing │  │
│  │  ┌──────────── Inner shell（統計）────────────┐                 │  │
│  │  │  Match stats · Team stats · Player stats   │                 │  │
│  │  │  ┌──────── Core（核心）────────┐           │                 │  │
│  │  │  │  Basic game rules           │           │                 │  │
│  │  │  │  Basic rating rules         │           │                 │  │
│  │  │  └─────────────────────────────┘           │                 │  │
│  │  └────────────────────────────────────────────┘                 │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

**依賴規則**：外層可以用內層，內層**絕對不能** import 外層。
- Core、Inner shell 只用純 Python。檔案最上面出現 `import cv2`、`import streamlit`、`import sqlite3`，就代表放錯層。
- 好處：換辨識工具、資料庫或 UI，核心都不用改；**不跑影片也能測試核心**。

## 3. 資料流程

```
比賽影片 → [品質檢查] → OpenCV 拆畫面 → YOLO 找人和球 → ByteTrack 固定每人編號
        → Video translate（畫面座標 → 球場公尺 → 足球事件）
        → SQLite（每場只翻譯一次，存起來）
        → Inner shell 統計（套用 Core 規則）
        → Streamlit 圖表
```

每場影片**只翻譯一次**並存進資料庫；之後所有分析都讀資料庫，不再讀影片。

## 4. 工具與選擇理由

| 工具 | 工作 | 層 | 選它的理由 |
|---|---|---|---|
| Python | 主要語言 | 全部 | 影像辨識、數據分析工具最完整；重運算交給 GPU 上的 YOLO，所以 Python 慢不影響 |
| OpenCV | 影片拆畫面、透視轉換（畫面 → 球場俯視） | Tools / Translate | 免費、最多人用 |
| YOLO（Ultralytics） | 找出球員和球的位置 | Tools | 現成模型，不用自己訓練 |
| ByteTrack | 讓同一個球員每格都同一個編號 | Tools | 內建在 YOLO 套件 |
| Google Colab | 跑辨識用的免費 GPU | Tools | 免費 |
| SQLite | 存翻譯後的比賽資料 | Tools | Python 內建，一個檔案就好 |
| Streamlit | 上傳影片、顯示圖表 | Tools | 只寫 Python 就能做網頁 |
| pandas / mplsoccer | 整理數據、畫球場圖 | Translate / Tools | |
| pytest | 測試（特別是核心） | 全部 | |

## 5. 資料來源與影片規格

- **網路比賽影片**：主要用來測試（轉播鏡頭會移動、切重播，較難處理；有版權，不公開散布）
- **自己拍的現場比賽**：正式分析用，固定鏡頭

影片規格：至少 1080p、25–30 fps、從高處拍、腳架固定、看得到場上白線（透視轉換要用）。

## 6. 風險與備案

| 風險 | 影響 | 備案 |
|---|---|---|
| 影片畫質低 | 認不出背號、球 | 辨識前做品質檢查，標記「可信度低」；背號由人手動對應（A = 7 號） |
| 跟丟 / 認錯球員 | 數據算到錯的人頭上 | 每隔幾秒用球衣顏色和位置重新比對；不確定就標記給人確認 |
| 算得對不對 | 無法驗證 | 手動數一場比賽比對 |
| 做太多 | 每樣都做一半 | 先做 3 個數據 |
| 運算太慢 / Colab 斷線 | 一場要跑好幾小時 | 每場只處理一次；每秒只取幾格 |
| 「動作」比「位置」難 | 傳球判斷不準 | 先做只需要位置的數據（跑動距離、熱區） |
| 影片檔太大 | 空間不夠 | 翻譯完只留數據 |
| 隱私 | 拍別人比賽 | 先取得同意，不公開可辨識的個資 |

## 7. 開發順序：核心先做，影片最後

1. **Core rules + 測試**，用手打的假資料
2. **Match / Team / Player stats**
3. **Video translate** 寫進資料庫
4. **UI** 顯示分析圖表

## 8. 程式碼怎麼對應這四層（2026-10-01 起）

資料夾直接照四層分，`tests/test_architecture.py` 會自動檢查「內層不能 import 外層」。

| 層 | 資料夾 | 目前內容 | 可以 import |
|---|---|---|---|
| **Core** | `domain/` | `models.py` 能力與評分規則的型別、`rating.py` 平均／類別分數／位置適合度／推薦位置、`positions.py` | 只有標準函式庫 |
| **Inner shell** | `stats/` | `player.py` 隊內排名、強弱項、兩人差距；`team.py` 全隊平均、位置人數；`match.py` 比賽數據加總 | + domain |
| **Translate shell** | `adapters/` | `form.py` 表單 → 球員資料；`repository.py` 資料庫讀寫（Database reader）；之後加 `video.py`（Video translate） | + stats、pandas |
| **Tools shell** | `infra/` | `config.py` 設定檔、`db.py` SQLite、`sources.py` Google 試算表、`pipeline.py` 組裝、`charts/` Plotly 與 matplotlib、`ui/` Streamlit 畫面；之後加 `video/`（OpenCV、YOLO、ByteTrack） | 全部 |

規則資料（能力、權重、表單欄位）放在 `config/settings.toml`，由 `infra/config.py` 讀進來，再交給 Core 使用。
影片分析做好後，資料流程會是：`infra/video` 辨識 → `adapters/video.py` 翻譯成事件 → `adapters/repository.py` 存進 SQLite → `stats/` 統計 → `infra/ui` 顯示。
