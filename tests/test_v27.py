"""v2.7 練習行事曆與出席：0011 migration 的靜態檢查（不用連資料庫）。

真正的權限測試在 supabase/tests/rls_test.sql 最後的「v2.7」那一段（py -m backend.scripts.rls_check）。
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIG11 = (ROOT / "supabase" / "migrations" / "0011_practices.sql").read_text(encoding="utf-8")
RLS_TEST = (ROOT / "supabase" / "tests" / "rls_test.sql").read_text(encoding="utf-8")

ACTIONS = {"save_practice", "save_practices", "delete_practice", "set_practice_attendance", "set_attendance",
           "export_my_data", "delete_my_account"}
HELPERS = {"practice_problem", "attendance_who", "practice_announce", "notify_discord"}


def _functions(sql: str) -> dict[str, str]:
    return {m.group(1): m.group(0) for m in
            re.finditer(r"create or replace function public\.(\w+)\(.*?\bas \$\$", sql, re.S)}


def _body(name: str) -> str:
    start = MIG11.index(f"function public.{name}(")
    return MIG11[start:MIG11.index("end $$;", start)]


def test_0011_defines_expected_functions_with_search_path():
    fns = _functions(MIG11)
    assert ACTIONS | HELPERS <= set(fns)
    for name, head in fns.items():
        assert "set search_path = public" in head, name


def test_0011_functions_revoked_from_anon_first():
    revoked = re.search(r"revoke all on function(.*?)from public, anon;", MIG11, re.S).group(1)
    for name in _functions(MIG11):
        assert f"public.{name}(" in revoked, f"{name} 沒有先從 public、anon 收回"


def test_helpers_are_internal_and_actions_only_for_authenticated():
    internal = re.search(r"revoke all on function(.*?)from authenticated;", MIG11, re.S).group(1)
    grants = re.search(r"grant execute on function(.*?)to authenticated;", MIG11, re.S).group(1)
    for name in HELPERS:
        assert f"public.{name}(" in internal and f"public.{name}(" not in grants, name
    for name in ACTIONS:
        assert f"public.{name}(" in grants, name
    assert "to anon" not in MIG11


def test_actions_never_raise():
    """動作回傳 {"status": ...}，不要 raise（輸錯的紀錄才不會被 ROLLBACK）。"""
    assert "raise exception" not in MIG11


def test_new_tables_have_rls_select_only():
    for t in ("practices", "practice_attendance"):
        assert f"alter table public.{t} enable row level security;" in MIG11
        assert f"revoke all on public.{t} from anon, authenticated;" in MIG11
        assert f"grant select on public.{t} to authenticated;" in MIG11
        assert re.search(rf"create policy \w+ on public\.{t}\s+for select to authenticated using \(public\.is_member\(team_id\)\)", MIG11)
    assert "truncate" not in MIG11.lower()


def test_only_managers_write_practices():
    for name in ("save_practice", "save_practices", "delete_practice"):
        assert "public.can_manage(" in _body(name), f"{name} 沒有檢查球隊管理員"
        assert "security definer" in _functions(MIG11)[name]


def test_matches_and_practices_share_one_attendance_rule():
    """兩本點名簿、一本規則手冊：比賽和練習的出席都走 attendance_who。"""
    assert "public.attendance_who(" in _body("set_attendance")
    assert "public.attendance_who(" in _body("set_practice_attendance")
    rule = _body("attendance_who")
    assert "answer not in ('in', 'out')" in rule and "> 40" in rule
    assert "now() >= starts" in rule and "not manager" in rule


def test_practice_limits_match_spec():
    rule = _body("practice_problem")
    assert "interval '8 hours'" in rule and "ends_at <= starts_at" in rule
    assert "> 60" in rule and "> 20" in rule and "> 500" in rule and "> 200" in rule
    batch = _body("save_practices")
    assert "n > 60" in batch and "> 500" in batch
    # 整批先檢查完才建立：第一個 insert 在第二輪
    assert batch.index("第一輪") < batch.index("insert into public.practices")


def test_skip_discord_switch_only_in_announce():
    """只勾聊天室時暫時關掉自動推 Discord；開關只在同一個交易有效、用完關回去。"""
    assert "current_setting('app.skip_discord', true)" in _body("notify_discord")
    announce = _body("practice_announce")
    assert "set_config('app.skip_discord', 'on', true)" in announce
    assert "set_config('app.skip_discord', 'off', true)" in announce
    assert "allowed_mentions" in announce
    others = MIG11.replace(announce, "")
    assert "set_config('app.skip_discord', 'on'" not in others


def test_my_data_and_account_deletion_cover_practice_attendance():
    assert "'practice_attendance'" in _body("export_my_data")
    assert "delete from public.practice_attendance where player_id = any(pids)" in _body("delete_my_account")


def test_rls_test_covers_v27():
    for label in ("球員建立練習", "練習開始後球員改登記", "別隊看 A 隊的練習", "只發聊天室：沒有推 Discord",
                  "失敗的批次一筆都沒有建立", "刪帳號後練習出席不見"):
        assert label in RLS_TEST, label
