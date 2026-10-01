"""Translate shell（翻譯層）：把外面的資料翻成核心看得懂的格式，或反過來。

- form.py        Google 表單 / 試算表的原始資料 → 球員資料
- repository.py  資料庫的讀寫（Database reader）
- （之後）video.py  影片座標 → 足球事件（Video translate）

可以 import domain、stats、pandas；不能 import infra、streamlit、cv2。
"""
