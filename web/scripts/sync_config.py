"""把 config/settings.toml 的能力清單和位置權重轉成網站用的 web/lib/config.json。

能力、類別、位置權重只在 settings.toml 改一次，跑這個指令網站就會同步：

    py web/scripts/sync_config.py

tests/test_v22.py 會檢查 config.json 和 settings.toml 一致，忘記同步測試會失敗。
"""
import json
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SETTINGS = ROOT / "config" / "settings.toml"
OUT = ROOT / "web" / "lib" / "config.json"
MAX_SCORE = 5   # 跟 domain/models.py 的 RatingRules.max_score 一樣


def build(settings_path: Path = SETTINGS) -> dict:
    with open(settings_path, "rb") as f:
        raw = tomllib.load(f)
    return {
        "_note": "自動產生，不要手改：改 config/settings.toml 後執行 py web/scripts/sync_config.py",
        "maxScore": MAX_SCORE,
        "topN": raw.get("recommend", {}).get("top_n", 3),
        "categories": [
            {"name": c["name"], "color": c["color"],
             "abilities": [{"key": a["key"], "label": a["label"]} for a in c["abilities"]]}
            for c in raw["categories"]
        ],
        "positions": raw["positions"],
    }


def render(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def main() -> None:
    text = render(build())
    if "--check" in sys.argv:
        ok = OUT.exists() and OUT.read_text(encoding="utf-8") == text
        print("config.json 已同步" if ok else "config.json 跟 settings.toml 不一樣，請執行 py web/scripts/sync_config.py")
        raise SystemExit(0 if ok else 1)
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"已更新 {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
