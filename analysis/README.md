# analysis/ — 影片分析

之後的比賽影片分析（OpenCV / YOLO / ByteTrack）放在這個資料夾。

分析結果要進網站，有兩種方式：

1. **輸出 CSV 再匯入**（最簡單）
   ```
   py analysis/import_match_csv.py 2026-10-05 電機系 stats.csv --gf 2 --ga 1
   ```
   CSV 格式：`player_name,stat,value`，一列一個數據（例如 `林宥成,distance_m,8200`）。

2. **在程式裡直接寫進資料庫**
   ```python
   from infra.db import connect
   from adapters.repository import add_match, save_match_stats
   con = connect()
   mid = add_match(con, "2026-10-05", "電機系", goals_for=2, goals_against=1)
   save_match_stats(con, mid, {"林宥成": {"distance_m": 8200, "passes": 31}})
   ```

`player_name` 要跟表單填的「姓名」一樣，網站才對得起來。
