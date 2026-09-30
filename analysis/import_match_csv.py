"""把一場比賽的球員數據（CSV）匯入資料庫，網站「比賽數據」頁就會顯示。

之後影片分析（OpenCV / YOLO / ByteTrack）只要輸出同樣格式的 CSV，
或直接呼叫 core.db.add_match() + save_match_stats()，就能接上網站。

CSV 格式（每列一個數據）：
    player_name,stat,value
    林宥成,distance_m,8200
    林宥成,passes,31

用法：
    py analysis/import_match_csv.py 2026-10-05 電機系 stats.csv --gf 2 --ga 1
"""
import argparse
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from core.db import add_match, connect, save_match_stats  # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser(description="匯入一場比賽的球員數據")
    ap.add_argument("played_on", help="比賽日期 YYYY-MM-DD")
    ap.add_argument("opponent", help="對手")
    ap.add_argument("csv", type=Path, help="player_name,stat,value 格式的 CSV")
    ap.add_argument("--gf", type=int, help="我方進球")
    ap.add_argument("--ga", type=int, help="對方進球")
    ap.add_argument("--video", help="影片路徑")
    ap.add_argument("--db", type=Path, help="資料庫路徑（預設 data/team.db）")
    args = ap.parse_args(argv)

    df = pd.read_csv(args.csv)
    stats: dict[str, dict[str, float]] = {}
    for r in df.itertuples():
        stats.setdefault(r.player_name, {})[r.stat] = r.value

    con = connect(args.db) if args.db else connect()
    try:
        mid = add_match(con, args.played_on, args.opponent, args.gf, args.ga, args.video)
        save_match_stats(con, mid, stats)
    finally:
        con.close()
    print(f"已匯入比賽 #{mid}：{len(stats)} 位球員、{len(df)} 筆數據")


if __name__ == "__main__":
    main()
