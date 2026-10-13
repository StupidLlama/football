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
# contact_messages（v2.9 意見回饋）也刻意不擋：回饋屬於使用者、不屬於任何球隊（tests/test_v29.py 有檢查）
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


# ---------------------------------------------------------------- 網站 ↔ 資料庫對得起來
WEB = ROOT / "web"


def _w(rel: str) -> str:
    return (WEB / rel).read_text(encoding="utf-8")


def test_web_rpc_names_and_args_match_0012():
    api = _w("lib/api.ts")
    for name in ("get_progress", "get_team_progress", "start_new_season"):
        assert f'rpc("{name}"' in api, name
    # 參數名稱要跟函式簽名一樣
    sig = re.search(r"function public\.start_new_season\((.*?)\)\s*returns", MIG12, re.S).group(1)
    for arg in ("team", "season", "team_name", "keep_jersey", "keep_badge", "notice", "to_discord"):
        assert re.search(rf"\b{arg}\b", sig), arg
        assert f"{arg}:" in api[api.index('rpc("start_new_season"'):][:400], arg


def test_web_team_columns_exist_in_migration():
    api = _w("lib/api.ts")
    cols = re.search(r'team: "([^"]+)"', api).group(1)
    for c in ("lineage_id", "prev_team_id", "archived_at", "created_at"):
        assert c in cols and (c in MIG12 or c == "created_at"), c


def test_archived_status_message_in_both_places():
    assert '"archived"' in _w("lib/status.ts") or "archived:" in _w("lib/status.ts")
    assert '"archived"' in (ROOT / "backend" / "accounts.py").read_text(encoding="utf-8")


def test_archived_is_read_only_in_ui():
    # 舊賽季：出席按鈕、發文框、能力表、我的頁的編輯區都不能用
    assert "archived" in _w("components/attendance-buttons.tsx")
    assert "archived" in _w("components/chat-composer.tsx")
    assert "v.archived" in _w("app/t/[teamId]/form/page.tsx")
    assert "!v.archived" in _w("app/t/[teamId]/page.tsx")
    # 資料庫擋下來的錯誤要翻成中文，不是「連線或權限錯誤」
    assert "season_archived" in _w("lib/api.ts") and "season_archived" in MIG12


def test_attendance_rate_only_for_self_and_managers():
    page = _w("app/t/[teamId]/players/[playerId]/page.tsx")
    assert "R.id === v.me.player_id || v.isCoach" in page
    panel = _w("components/season-panel.tsx")
    assert "getTeamProgress" in panel and "teamRates" in panel
    assert "if (!v.isCoach) return null" in panel      # 開新賽季只有球隊管理員


def test_policy_version_bumped_for_v28():
    assert 'POLICY_VERSION = "2026-10-13"' in _w("lib/policies.ts")
    assert "賽季進步" in _w("app/privacy/page.tsx")


def test_v28_update_entry():
    updates = _w("lib/updates.ts")
    assert 'version: "v2.8"' in updates and updates.index('version: "v2.8"') < updates.index('version: "v2.7.1"')
    assert re.search(r'version: "v2\.8".*?big: true', updates, re.S)


def test_archived_hides_management_controls():
    """舊賽季：新增比賽、新增練習、排陣容、管理專區工具都收起來（資料庫也會擋，這裡只是不讓人點）。"""
    assert "const manage = v.isCoach && !v.archived" in _w("app/t/[teamId]/matches/page.tsx")
    assert "!v.archived" in _w("app/t/[teamId]/matches/[matchId]/page.tsx")
    assert "&& !v.archived" in _w("app/t/[teamId]/practice/page.tsx")
    lineup = _w("app/t/[teamId]/lineup/page.tsx")
    assert "v.isCoach && !v.archived" in lineup and "!v.archived && (" in lineup
    coach = _w("app/t/[teamId]/coach/page.tsx")
    assert 'v.archived ? TABS.filter(([k]) => k === "season")' in coach
