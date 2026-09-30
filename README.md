# ⚽ 球隊球員卡網站

用 Streamlit 做的球員資料網站：全隊列表、個人能力雷達圖、適合位置球場圖、兩人比較。
之後會和影片分析專案合併（「比賽數據」頁先預留好了）。

## 本機執行（Windows）

第一次先安裝套件：

```
pip install -r requirements.txt
```

之後每次執行：

```
python -m streamlit run app.py
```

或直接雙擊 `run.bat`。瀏覽器會自動打開 http://localhost:8501

## 資料夾結構

```
app.py              網站主程式（頁面）
core/data.py        資料層：xlsx → SQLite、能力分類、位置適合度權重
core/charts.py      圖表：雷達圖、球場位置圖
data/team.xlsx      Google 表單匯出的球員資料
data/team.db        自動產生的 SQLite 資料庫（不用手動改）
```

## 更新資料

把新的表單回覆匯出成 xlsx，覆蓋 `data/team.xlsx` 就好，網站會自動重建資料庫。

## 調整

- 能力分類與顏色：`core/data.py` 的 `CATEGORIES`
- 位置適合度的權重：`core/data.py` 的 `POSITION_WEIGHTS`
- 推薦位置取前幾名：`core/data.py` 的 `recommended(top=3)`

## 隊伍密碼（部署前再設定）

把 `.streamlit/secrets.toml.example` 複製成 `.streamlit/secrets.toml` 並改密碼，網站就會要求輸入密碼。
沒有這個檔案時不需要密碼（方便本機測試）。

⚠️ `.gitignore` 已經排除 `data/team.xlsx` 和 `secrets.toml`，隊員個資不會被上傳到 GitHub。
