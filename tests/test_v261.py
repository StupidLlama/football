"""v2.6.1 名單管理：0010 migration 和網站的靜態檢查（不用連資料庫）。

真正的權限測試在 supabase/tests/rls_test.sql（py -m backend.scripts.rls_check）。
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
MIG10 = (ROOT / "supabase" / "migrations" / "0010_roster.sql").read_text(encoding="utf-8")
RLS_TEST = (ROOT / "supabase" / "tests" / "rls_test.sql").read_text(encoding="utf-8")
COACH_PAGE = (WEB / "app" / "t" / "[teamId]" / "coach" / "page.tsx").read_text(encoding="utf-8")
SHELL = (WEB / "components" / "shell.tsx").read_text(encoding="utf-8")


def _functions(sql: str) -> dict[str, str]:
    return {m.group(1): m.group(0) for m in
            re.finditer(r"create or replace function public\.(\w+)\(.*?\bas \$\$", sql, re.S)}


def test_0010_security_definer_functions_pin_search_path():
    fns = _functions(MIG10)
    assert {"add_player", "edit_player", "roster_problem", "clean_jersey"} <= set(fns)
    for name, head in fns.items():
        assert "set search_path = public" in head, name


def test_0010_functions_revoked_from_anon_first():
    revoked = re.search(r"revoke all on function(.*?)from public, anon;", MIG10, re.S).group(1)
    for name in _functions(MIG10):
        assert f"public.{name}(" in revoked, f"{name} 沒有先從 public、anon 收回"


def test_helpers_are_not_callable_and_actions_only_for_authenticated():
    grants = " ".join(re.findall(r"grant execute on function(.*?)to authenticated;", MIG10, re.S))
    assert "add_player" in grants and "edit_player" in grants
    assert "roster_problem" not in grants and "clean_jersey" not in grants
    assert "to anon" not in MIG10


def test_actions_never_raise():
    """動作回傳 {"status": ...}，不要 raise（輸錯的紀錄才不會被 ROLLBACK）。"""
    assert "raise exception" not in MIG10


def test_only_managers_can_change_roster():
    fns = _functions(MIG10)
    body = MIG10
    for name in ("add_player", "edit_player"):
        start = body.index(f"function public.{name}(")
        end = body.index("end $$;", start)
        assert "public.can_manage(" in body[start:end], f"{name} 沒有檢查球隊管理員"
    assert "security definer" in fns["add_player"] and "security definer" in fns["edit_player"]


def test_roster_rules_match_spec():
    """背號 0–999 的數字、同隊不重複；隊長、副隊長各一位；姓名 1–40 字；名單最多 80 人。"""
    assert "'^[0-9]{1,3}$'" in MIG10
    assert "p.jersey_number = new_jersey" in MIG10 and "p.badge = new_badge" in MIG10
    assert "char_length(new_name) > 40" in MIG10
    assert ">= 80" in MIG10
    roster_ts = (WEB / "lib" / "roster.ts").read_text(encoding="utf-8")
    assert "/^[0-9]{1,3}$/" in roster_ts and "> 40" in roster_ts


def test_rls_test_covers_v261():
    for label in ("球員新增球員", "管理員新增球員", "新增重複的背號", "新增第二位隊長", "交接隊長",
                  "副隊長同時是球隊管理員", "舊資料背號重複、只改名字", "別隊改 A 隊球員", "沒登入新增球員"):
        assert label in RLS_TEST, label


def test_management_page_open_to_everyone_with_redeem():
    """一般球員也看得到「管理專區」，進去只有輸入管理員碼；球隊管理員才有管理工具。"""
    assert re.search(r"items\.push\(\{ href: `\$\{base\}/coach`", SHELL)
    assert "if (v.isCoach || isAdmin) items.push" not in SHELL
    assert "if (!v.isCoach && !isAdmin) return <Redeem />;" in COACH_PAGE
    assert "actions.redeem(" in COACH_PAGE
    assert '["roster", "球員名單"]' in COACH_PAGE
