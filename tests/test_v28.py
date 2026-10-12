"""v2.8 賽季進步追蹤：0012 migration 的靜態檢查（不用連資料庫）。

真正的權限測試在 supabase/tests/rls_test.sql 最後的「v2.8」那一段（py -m backend.scripts.rls_check）：
開新賽季、舊賽季唯讀、用舊 Team ID 加入、進步資料誰看得到、刪帳號。
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIG12 = (ROOT / "supabase" / "migrations" / "0012_seasons.sql").read_text(encoding="utf-8")
RLS_TEST = (ROOT / "supabase" / "tests" / "rls_test.sql").read_text(encoding="utf-8")

ACTIONS = {"join_team", "start_new_season", "get_progress", "get_team_progress", "season_archived",
           "export_my_data", "delete_my_account"}
HELPERS = {"season_guard", "players_prev_guard", "progress_chain"}

# 每張屬於球隊的表都要有守門員（memberships 只擋加入；chat_reads 刻意不擋：看舊聊天室要記讀到哪裡）
GUARDED = {"teams", "memberships", "players", "ability_ratings", "fixtures", "duties", "coach_codes", "lineups",
           "matches", "attendance", "practices", "practice_attendance", "messages", "chat_discord"}


def _functions(sql: str) -> dict[str, str]:
    return {m.group(1): m.group(0) for m in
            re.finditer(r"create or replace function public\.(\w+)\(.*?\bas \$\$", sql, re.S)}


def _body(name: str) -> str:
    start = MIG12.index(f"function public.{name}(")
    end = min(i for i in (MIG12.find("end $$;", start), MIG12.find("\n$$;", start)) if i > 0)
    return MIG12[start:end]


def test_0012_defines_expected_functions_with_search_path():
    fns = _functions(MIG12)
    assert ACTIONS | HELPERS <= set(fns)
    for name, head in fns.items():
        assert "set search_path = public" in head, name


def test_0012_permissions():
    revoked = re.search(r"revoke all on function(.*?)from public, anon;", MIG12, re.S).group(1)
    for name in ACTIONS | HELPERS:
        assert f"public.{name}(" in revoked, name
    internal = re.search(r"revoke all on function(.*?)from authenticated;", MIG12, re.S).group(1)
    for name in HELPERS:
        assert f"public.{name}(" in internal, name
    granted = re.search(r"grant execute on function(.*?)to authenticated;", MIG12, re.S).group(1)
    for name in ACTIONS:
        assert f"public.{name}(" in granted, name
    for name in HELPERS:
        assert f"public.{name}(" not in granted, name
    assert "to anon" not in MIG12


def test_every_team_table_has_season_guard():
    guarded = set(re.findall(r"create trigger \w+_season_guard before .*? on public\.(\w+)", MIG12))
    assert guarded == GUARDED
    assert re.search(r"memberships_season_guard before insert on", MIG12), "memberships 只擋加入"
    assert "chat_reads" not in guarded


def test_guard_exceptions_are_narrow():
    """守門員只放行兩種：外鍵連帶的改動、這次交易設了 app.allow_archived（只有刪帳號會設）。"""
    guard = _body("season_guard")
    assert "pg_trigger_depth() > 1" in guard and "app.allow_archived" in guard
    setters = [m.start() for m in re.finditer(r"set_config\('app\.allow_archived', 'on'", MIG12)]
    assert len(setters) == 1 and setters[0] > MIG12.index("function public.delete_my_account(")


def test_prev_link_only_from_new_season():
    assert "set_config('app.new_season', 'on', true)" in _body("start_new_season")
    assert "app.new_season" in _body("players_prev_guard")
    # 連按兩次只開一季：鎖住這一季、prev_team_id 唯一
    assert "for update" in _body("start_new_season")
    assert "teams_prev_unique" in MIG12


def test_new_season_archives_old_after_revoking_codes():
    body = _body("start_new_season")
    assert body.index("update public.coach_codes set revoked_at") < body.index("update public.teams set archived_at")
    # 能力表不複製（新賽季重填）
    assert "insert into public.ability_ratings" not in body


def test_join_team_refuses_archived_season():
    body = _body("join_team")
    assert "'archived'" in body
    assert body.index("archived_at is not null") < body.index("insert into public.memberships")


def test_progress_stays_inside_lineage_and_orders_by_chain():
    chain = _body("progress_chain")
    assert "lineage_id" in chain and "order by c.pos" in chain
    assert "can_manage(team)" in _body("get_team_progress")


def test_rls_test_covers_v28():
    for label in ("球隊管理員開新賽季", "舊賽季填能力表", "舊賽季新增練習", "用舊賽季的 Team ID 加入",
                  "隊友看進步", "球員看全隊進步", "外人看進步", "直接改上一季的連結", "有舊賽季資料的人刪帳號"):
        assert label in RLS_TEST, label
