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


# ---------- B. 資料庫 0007 ----------
import re  # noqa: E402

MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
MIG7 = (ROOT / "supabase" / "migrations" / "0007_lineups.sql").read_text(encoding="utf-8")
ALL_SQL = "\n".join(f.read_text(encoding="utf-8") for f in MIGRATIONS)
RLS_TEST = (ROOT / "supabase" / "tests" / "rls_test.sql").read_text(encoding="utf-8")
SHARED_FN = "get_shared_lineup"


def _functions(sql: str) -> dict[str, str]:
    return {m.group(1): m.group(0) for m in
            re.finditer(r"create or replace function public\.(\w+)\(.*?\bas \$\$", sql, re.S)}


def test_0007_security_definer_functions_pin_search_path():
    for name, head in _functions(MIG7).items():
        if "security definer" in head:
            assert "set search_path = public" in head, name


def test_0007_every_function_revoked_from_anon_first():
    revoked = re.search(r"revoke all on function(.*?)from public, anon;", MIG7, re.S).group(1)
    for name in _functions(MIG7):
        assert f"public.{name}(" in revoked, f"{name} 沒有先從 public、anon 收回"


def test_only_the_share_function_is_granted_to_anon():
    """全部 migration 裡，只有分享頁的函式開放給沒登入的人；資料表一律不給 anon。"""
    grants = re.findall(r"grant execute on function(.*?)to ([^;]+);", ALL_SQL, re.S)
    to_anon = [fns for fns, who in grants if re.search(r"\banon\b", who)]
    assert len(to_anon) == 1 and re.findall(r"public\.(\w+)\(", to_anon[0]) == [SHARED_FN]
    assert not re.search(r"grant [^;]* on (table )?public\.\w+[^;]* to [^;]*\banon\b", ALL_SQL, re.I)
    assert not re.search(r"create policy[^;]*\bto anon\b", ALL_SQL)


def test_shared_lineup_returns_only_drawing_fields():
    """分享頁只回傳畫圖需要的欄位：不帶球員 id、能力分數、草稿主人；名字要勾選才給。"""
    body = re.search(rf"function public\.{SHARED_FN}\(.*?\nend \$\$;", MIG7, re.S).group(0)
    keys = set(re.findall(r"'(\w+)', ", body.split("jsonb_build_object(", 1)[1]))
    assert keys <= {"status", "team_name", "season", "name", "size", "formation", "show_names", "updated_at",
                    "slots", "number"}, keys
    for bad in ("ability_ratings", "scores", "owner_id", "attending", "'id'", "p.id,"):
        assert bad not in body.split("returns jsonb", 1)[1].split("select * into t")[1], bad
    assert "case when l.share_names then p.name end" in body


def test_lineups_table_written_only_through_functions():
    assert re.search(r"revoke all on public\.lineups from anon, authenticated;", MIG7)
    grants = re.findall(r"grant ([^;]*) on public\.lineups to authenticated;", MIG7)
    assert grants == ["select"]


def test_share_token_is_long_and_random():
    assert "share_token ~ '^[A-Za-z0-9_-]{32}$'" in MIG7
    assert "gen_random_uuid()" in re.search(r"function public\.new_share_token.*?\$\$;", MIG7, re.S).group(0)


def test_rls_test_covers_v24():
    for label in ("球員存正式陣容", "管理員只看到正式陣容（看不到別人的草稿）", "別隊看 A 隊的陣容",
                  "沒登入用分享碼看陣容", "預設不顯示名字", "分享頁不帶球員 id", "分享頁不帶能力分數",
                  "重發後舊連結失效", "關掉分享後連結失效", "草稿主人離隊後連結失效", "沒登入讀陣容表",
                  "刪帳號後沒有留下無主草稿"):
        assert label in RLS_TEST, label


def test_new_statuses_have_messages():
    for st in set(re.findall(r"'status', '(\w+)'", MIG7)):
        assert st in (WEB / "lib" / "status.ts").read_text(encoding="utf-8"), st
