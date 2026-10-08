"""v2.5 比賽列表＋出賽登記（F7）：0008 migration 的靜態檢查（不用連資料庫）。

真正的權限測試在 supabase/tests/rls_test.sql（py -m backend.scripts.rls_check）。
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("0*.sql"))
ALL_SQL = "\n".join(p.read_text(encoding="utf-8") for p in MIGRATIONS)
MIG8 = (ROOT / "supabase" / "migrations" / "0008_matches.sql").read_text(encoding="utf-8")
RLS_TEST = (ROOT / "supabase" / "tests" / "rls_test.sql").read_text(encoding="utf-8")
SHARED_FN = "get_shared_lineup"


def _functions(sql: str) -> dict[str, str]:
    return {m.group(1): m.group(0) for m in
            re.finditer(r"create or replace function public\.(\w+)\(.*?\bas \$\$", sql, re.S)}


# ---------- 函式的安全規則 ----------
def test_0008_security_definer_functions_pin_search_path():
    for name, head in _functions(MIG8).items():
        if "security definer" in head:
            assert "set search_path = public" in head, name


def test_0008_functions_revoked_from_anon_first():
    """每個新函式都先從 public、anon 收回；只有分享頁例外（收回的話沒登入就看不到分享的陣容）。"""
    revoked = re.search(r"revoke all on function(.*?)from public, anon;", MIG8, re.S).group(1)
    for name in _functions(MIG8):
        if name == SHARED_FN:
            assert f"public.{name}(" not in revoked, "分享頁不能從 anon 收回"
        else:
            assert f"public.{name}(" in revoked, f"{name} 沒有先從 public、anon 收回"


def test_0008_internal_check_is_not_callable():
    assert re.search(r"revoke all on function public\.match_problem\([^)]*\)\s*from authenticated;", MIG8)
    grants = " ".join(re.findall(r"grant execute on function(.*?)to authenticated;", MIG8, re.S))
    assert "match_problem" not in grants


def test_old_save_lineup_is_dropped_before_redefining():
    """參數變了 = 新函式；舊的 9 個參數版本要刪掉，不然會留下兩個 save_lineup。"""
    drop = MIG8.index("drop function public.save_lineup(uuid, uuid, text, text, int, text, jsonb, text[], uuid[]);")
    assert drop < MIG8.index("create or replace function public.save_lineup(")


# ---------- 資料表 ----------
def test_new_tables_written_only_through_functions():
    for t in ("matches", "attendance"):
        assert re.search(rf"alter table public\.{t}\s+enable row level security", MIG8), t
        assert re.search(rf"revoke all on public\.{t} from anon, authenticated;", MIG8), t
        assert re.findall(rf"grant ([^;]*) on public\.{t} to authenticated;", MIG8) == ["select"], t
        policies = re.findall(rf"create policy \w+ on public\.{t}\s+for (\w+) to (\w+) using \(([^;]*)\);", MIG8)
        assert policies == [("select", "authenticated", "public.is_member(team_id)")], t


def test_match_status_is_computed_not_stored():
    """狀態（即將進行／已結束）用開賽時間和比分算，不存欄位，免得忘記更新。"""
    table = re.search(r"create table public\.matches \((.*?)\n\);", MIG8, re.S).group(1)
    assert not re.search(r"^\s*status\b", table, re.M)
    assert "kickoff     timestamptz not null" in table


def test_attendance_has_only_two_answers():
    """決定：只有出席／請假；沒資料 = 還沒回覆（不做「待定」）。"""
    assert "check (status in ('in', 'out'))" in MIG8


def test_deleting_a_match_keeps_lineups():
    assert "match_id uuid references public.matches(id) on delete set null" in MIG8
    assert "match_id   uuid not null references public.matches(id) on delete cascade" in MIG8


# ---------- 規則寫在函式裡 ----------
def _body(name: str) -> str:
    return re.search(rf"function public\.{name}\(.*?\nend \$\$;", MIG8, re.S).group(0)


def test_only_managers_create_matches():
    for fn in ("save_match", "delete_match", "match_from_fixture"):
        assert "public.can_manage(" in _body(fn), fn


def test_players_locked_after_kickoff_but_managers_can_fix():
    body = _body("set_attendance")
    assert "if not manager and (now() >= m.kickoff" in body
    assert "'closed'" in body
    # 球員只能登記自己
    assert "if not manager and not public.is_own_player(pid)" in body


def test_bound_lineup_only_uses_attending_players():
    body = _body("save_lineup")
    assert "a.status = 'in'" in body and "m.size <> save_lineup.size" in body


def test_shared_lineup_adds_only_match_opponent_and_kickoff():
    body = _body(SHARED_FN)
    keys = set(re.findall(r"'(\w+)', ", body.split("jsonb_build_object(", 1)[1]))
    assert keys <= {"status", "team_name", "season", "name", "size", "formation", "show_names", "updated_at",
                    "match", "opponent", "kickoff", "slots", "number"}, keys
    after = body.split("select * into m")[1]
    for bad in ("ability_ratings", "scores", "owner_id", "attending", "attendance", "'id'", "p.id,", "note"):
        assert bad not in after, bad
    assert "case when l.share_names then p.name end" in body


def test_still_only_one_function_for_anon():
    grants = re.findall(r"grant execute on function(.*?)to ([^;]+);", ALL_SQL, re.S)
    to_anon = [fns for fns, who in grants if re.search(r"\banon\b", who)]
    assert len(to_anon) == 1 and re.findall(r"public\.(\w+)\(", to_anon[0]) == [SHARED_FN]


def test_privacy_functions_cover_attendance():
    assert "'attendance', coalesce((" in _body("export_my_data")
    assert "delete from public.attendance where player_id = any(pids);" in _body("delete_my_account")


def test_new_statuses_have_messages():
    status_ts = (WEB / "lib" / "status.ts").read_text(encoding="utf-8")
    accounts = (ROOT / "backend" / "accounts.py").read_text(encoding="utf-8")
    for st in set(re.findall(r"'status', '(\w+)'", MIG8)):
        assert st in status_ts, st
        assert f'"{st}"' in accounts, st


def test_rls_test_covers_v25():
    for label in ("球員建立比賽", "球員直接寫比賽表", "球員幫隊友登記", "開賽後球員改登記", "球員直接寫出席表",
                  "還沒認領的隊員登記出席", "管理員幫隊友登記請假", "管理員開賽後更正登記", "隊友看得到全隊的出席登記",
                  "別隊看 A 隊的比賽", "別隊看 A 隊的出席", "別隊登記 A 隊的比賽", "從聯賽建立的對手和時間",
                  "同一場聯賽只建一次", "綁定比賽的陣容排了請假的人", "綁定比賽的陣容賽制不一樣",
                  "分享頁帶綁定比賽的對手", "沒登入讀比賽表", "沒登入讀出席表", "下載資料包含自己的出席紀錄",
                  "刪帳號後出席紀錄一起刪", "刪比賽後陣容變回不綁定"):
        assert label in RLS_TEST, label
