"""Tools shell（最外層）：所有「工具」都在這裡，隨時可以換。

- config.py    讀 config/settings.toml
- db.py        SQLite 連線與資料表升級
- sources.py   資料來源：Google 試算表 / 本機 xlsx
- pipeline.py  把各層接起來：來源 → 翻譯 → 資料庫
- charts/      Plotly、matplotlib 圖表
- ui/          Streamlit 畫面
- （之後）video/  OpenCV、YOLO、ByteTrack
"""
