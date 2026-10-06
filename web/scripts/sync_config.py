"""把 config/settings.toml（能力、位置權重、組隊加分扣分）和 config/formations.toml（陣型）
轉成網站用的 web/lib/config.json。

只在 toml 改一次，跑這個指令網站就會同步：

    py web/scripts/sync_config.py

tests/test_v22.py 會檢查 config.json 和 settings.toml 一致，忘記同步測試會失敗。
"""
import json
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SETTINGS = ROOT / "config" / "settings.toml"
FORMATIONS = ROOT / "config" / "formations.toml"
OUT = ROOT / "web" / "lib" / "config.json"
MAX_SCORE = 5   # 跟 domain/models.py 的 RatingRules.max_score 一樣


def build(settings_path: Path = SETTINGS, formations_path: Path = FORMATIONS) -> dict:
    with open(settings_path, "rb") as f:
        raw = tomllib.load(f)
    with open(formations_path, "rb") as f:
        formations = tomllib.load(f)["formations"]
    lineup = raw.get("lineup", {})
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
        "lineup": {"goodBonus": lineup.get("good_bonus", 10), "badPenalty": lineup.get("bad_penalty", 15)},
        "formations": [
            {"name": f["name"], "size": int(f["size"]),
             "slots": [{"code": s["code"], "role": s["role"], "x": s["x"], "y": s["y"]} for s in f["slots"]]}
            for f in formations
        ],
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
