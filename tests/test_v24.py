"""v2.4 組隊（F3）：網站版和 Python 版排人一致、設定檔同步。"""
import subprocess
import sys
from pathlib import Path

from domain.positions import has_position, same_position
from infra import config
from stats.lineup import auto_lineup

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
sys.path.insert(0, str(WEB / "scripts"))

R = config.rules()


# ---------- A. 演算法和設定 ----------
def test_bonus_and_penalty_come_from_settings():
    assert (R.good_bonus, R.bad_penalty) == (10, 15)
    src = (ROOT / "stats" / "lineup.py").read_text(encoding="utf-8")
    assert "GOOD_BONUS" not in src and "BAD_PENALTY" not in src, "加分扣分要讀 config/settings.toml 的 [lineup]"


def test_same_position_matches_web_rule():
    assert same_position("LB", "LB/RB") and same_position("LB/RB", "RB") and same_position("CB", "CB")
    assert not same_position("CB", "CDM") and not same_position("LW/RW", "LB/RB")
    assert has_position("LB， ST", "LB/RB") and has_position(["RW"], "LW/RW") and not has_position("", "GK")


def test_self_rated_lb_counts_for_lb_rb_slot():
    f = next(x for x in config.formations() if x.size == 8 and x.name == "3-3-1")
    base = {k: 3 for k in R.ability_keys}
    a = {**base, "name": "A", "good_positions": "LB", "bad_positions": ""}
    b = {**base, "name": "B", "good_positions": "", "bad_positions": ""}
    lu = auto_lineup([a, b], f, R)
    assert next(o for o in lu.starters if o.name == "A").slot in ("LB", "RB")


def test_web_config_has_lineup_and_formations():
    import sync_config
    data = sync_config.build()
    assert data["lineup"] == {"goodBonus": R.good_bonus, "badPenalty": R.bad_penalty}
    assert [(f["name"], f["size"]) for f in data["formations"]] == [(f.name, f.size) for f in config.formations()]
    assert (WEB / "lib" / "config.json").read_text(encoding="utf-8") == sync_config.render(data), \
        "改了 settings.toml 或 formations.toml 之後要執行 py web/scripts/sync_config.py"


def test_lineup_fixture_is_up_to_date():
    """web/tests/v24.test.ts 用這份 Python 算的答案比對網站版；規則改了要重新產生。"""
    import lineup_fixture
    expected = lineup_fixture.render(lineup_fixture.build())
    assert lineup_fixture.OUT.read_text(encoding="utf-8") == expected, "請執行 py web/scripts/lineup_fixture.py"


def test_lineup_ts_is_pure():
    for name in ("lineup.ts", "assignment.ts"):
        src = (WEB / "lib" / name).read_text(encoding="utf-8")
        assert "react" not in src.lower() and "supabase" not in src.lower(), name
        for line in src.splitlines():
            if line.startswith("import") and "from \"./" in line:
                assert ".ts\"" in line, f"{name} 的 import 要加 .ts 副檔名才能用 node --test：{line}"


def test_node_lineup_tests_pass_if_node_available():
    """有 node 的話直接跑網站的對照測試（使用者電腦和雲端都有 node 22）。"""
    import shutil
    node = shutil.which("node")
    if not node:
        return
    r = subprocess.run([node, "--test", "tests/v24.test.ts"], cwd=WEB, capture_output=True, text=True,
                       encoding="utf-8")
    assert r.returncode == 0, r.stdout[-2000:] + r.stderr[-2000:]
