"""產生組隊的對照題目 web/tests/fixtures/lineup_cases.json：用 Python 版（stats/lineup.py）算出答案，
網站版（web/lib/lineup.ts）的測試讀同一份檔案，比對兩邊排出一樣的陣容。

    py web/scripts/lineup_fixture.py           # 改了組隊規則或陣型後重新產生
    py web/scripts/lineup_fixture.py --check   # 只檢查（tests/test_v24.py 會跑）

球員全部是亂數做的假資料（P00、P01…），沒有任何真實姓名。
"""
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from infra import config  # noqa: E402
from stats.assignment import max_assignment  # noqa: E402
from stats.lineup import auto_lineup, manual_lineup, picks_of  # noqa: E402

OUT = ROOT / "web" / "tests" / "fixtures" / "lineup_cases.json"
# 自評位置故意混用「LB」和「LB/RB」，確認兩邊都把 LB 算在 LB/RB 裡
POSITION_WORDS = ["GK", "CB", "LB", "RB", "LB/RB", "LWB/RWB", "CDM", "CM", "CAM", "LM/RM", "LW", "LW/RW", "ST"]


def make_players(rnd: random.Random, n: int, rules, flat: bool = False) -> list[dict]:
    players = []
    for i in range(n):
        scores = {k: (3 if flat else rnd.randint(1, 5)) for k in rules.ability_keys}
        good = rnd.sample(POSITION_WORDS, rnd.randint(0, 2))
        bad = [p for p in rnd.sample(POSITION_WORDS, rnd.randint(0, 2)) if p not in good]
        players.append({"id": f"P{i:02d}", "name": f"P{i:02d}", "scores": scores, "good": good, "bad": bad})
    rnd.shuffle(players)   # 輸入順序打亂：結果不能跟著變
    return players


def as_py(p: dict) -> dict:
    return {**p["scores"], "name": p["name"], "nickname": p["name"], "message": "",
            "good_positions": ", ".join(p["good"]), "bad_positions": ", ".join(p["bad"])}


def dump(lu) -> dict:
    return {
        "starters": [[o.slot, o.name, o.score] for o in lu.starters],
        "empty": [s.code for s in lu.empty],
        "bench": [[o.slot, o.name, o.score] for o in lu.bench],
        "total": lu.total,
    }


def build() -> dict:
    rules = config.rules()
    formations = config.formations()
    rnd = random.Random(2024)
    cases = []
    plan = [(11, n) for n in (5, 9, 11, 14, 17, 22)] + [(8, n) for n in (4, 7, 8, 12, 15)]
    for k, (size, n) in enumerate(plan):
        f = rnd.choice([x for x in formations if x.size == size])
        players = make_players(rnd, n, rules, flat=(k % 5 == 3))   # 每幾題放一題「全部同分」測平手
        py = [as_py(p) for p in players]
        locked = {}
        if n >= 6 and k % 2 == 0:
            slots = rnd.sample([s.code for s in f.slots], 2)
            who = rnd.sample([p["name"] for p in players], 2)
            locked = dict(zip(slots, who))
        auto = auto_lineup(py, f, rules, locked=locked)
        picks = picks_of(auto)
        # 手動：把前兩個有人的位置互換、最後一個位置清空
        filled = [c for c, v in picks.items() if v]
        manual = dict(picks)
        if len(filled) >= 2:
            manual[filled[0]], manual[filled[1]] = picks[filled[1]], picks[filled[0]]
        manual[f.slots[-1].code] = None
        cases.append({
            "size": size, "formation": f.name, "players": players, "locked": locked,
            "auto": dump(auto), "manual_picks": manual, "manual": dump(manual_lineup(py, f, rules, manual)),
        })
    # 演算法本身：小矩陣，含平手和位置比人多
    arnd = random.Random(99)
    matrices = []
    for _ in range(30):
        n, m = arnd.randint(1, 6), arnd.randint(1, 6)
        s = [[arnd.randint(0, 6) for _ in range(m)] for _ in range(n)]
        matrices.append({"scores": s, "result": max_assignment(s)})
    return {"_note": "自動產生，不要手改：py web/scripts/lineup_fixture.py",
            "goodBonus": rules.good_bonus, "badPenalty": rules.bad_penalty,
            "matrices": matrices, "cases": cases}


def render(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"


def main() -> None:
    text = render(build())
    if "--check" in sys.argv:
        ok = OUT.exists() and OUT.read_text(encoding="utf-8") == text
        print("lineup_cases.json 已同步" if ok else "組隊規則改了，請執行 py web/scripts/lineup_fixture.py")
        raise SystemExit(0 if ok else 1)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"已更新 {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
