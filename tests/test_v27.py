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


# ---------------------------------------------------------------- 網站（v2.7 D、C）
WEB = ROOT / "web"


def _web(rel: str) -> str:
    return (WEB / rel).read_text(encoding="utf-8")


def test_import_limits_match_database():
    """網站解析器的字數、時數上限要跟 0011 的 practice_problem 一樣（不然預覽通過、建立時才被擋）。"""
    ts = _web("lib/practice-import.ts")
    limits = dict(re.findall(r"(location|title|content|note): (\d+)", re.search(r"export const LIMITS = \{(.*?)\}", ts, re.S).group(1)))
    body = _body("practice_problem")
    for name, n in limits.items():
        assert f"coalesce({name}, ''))) > {n}" in body, f"{name} 上限 {n} 跟資料庫不一樣"
    assert re.search(r"MAX_HOURS = 8;", ts) and "interval '8 hours'" in body
    assert re.search(r"MAX_MEET_BEFORE_HOURS = 6;", ts) and "interval '6 hours'" in body
    assert re.search(r"MAX_ROWS = 60;", ts) and "n > 60" in _body("save_practices")


def test_save_practices_row_keys_match_web_rows():
    """toRpcRows 送出去的欄位，就是 save_practices 讀的欄位。"""
    ts = _web("lib/practice-import.ts")
    sent = set(re.findall(r"^\s+(\w+):", re.search(r"export type PracticeRow = \{(.*?)\n\};", ts, re.S).group(1), re.M))
    sent |= set(re.findall(r"(\w+): string", re.search(r"export type PracticeRow = \{(.*?)\n\};", ts, re.S).group(1)))
    read = set(re.findall(r"r ->> '(\w+)'", _body("save_practices")))
    assert read == {"starts_at", "ends_at", "meet_at", "location", "title", "content", "note"}
    assert read <= sent


def test_practice_nav_is_live_and_page_is_not_coming_soon():
    shell = _web("components/shell.tsx")
    assert re.search(r'label: "練習", icon: "◆" \}', shell) and "ComingSoon" not in _web("app/t/[teamId]/practice/page.tsx")


def test_page_allows_site_admin_like_coach_page():
    """網站管理員在任何一隊都看得到管理工具（v2.6.2 的教訓）：練習頁也要算進去。"""
    page = _web("app/t/[teamId]/practice/page.tsx")
    assert "v.isCoach || !!auth.profile?.is_admin" in page


def test_discord_option_only_when_webhook_configured():
    boxes = _web("components/notify-boxes.tsx")
    assert "{discordOn && (" in boxes and "getChatDiscord" in boxes
    assert "useState(false)" in boxes   # 查不到、查失敗都當作沒設定
    for f in ("practice-form.tsx", "practice-series.tsx", "practice-import-panel.tsx"):
        assert "NotifyBoxes" in _web(f"components/{f}"), f


def test_notify_text_required_when_a_box_is_checked():
    for f in ("practice-form.tsx", "practice-series.tsx", "practice-import-panel.tsx"):
        assert "勾了通知，請寫要通知的內容" in _web(f"components/{f}"), f


def test_delete_actions_need_two_clicks():
    day = _web("components/practice-day-panel.tsx")
    assert day.count("<ConfirmButton") == 2 and "deletePractice(p.id, restOfSeries)" in day


def test_calendar_hover_card_not_on_touch_devices():
    css = _web("app/globals.css")
    assert "@media (hover: none) { .cal-tip { display: none !important; } }" in css
    assert ".cal-cell:hover .cal-tip" in css and ".cal-dots { display: none;" in css


def test_todo_links_to_practice_page_with_day():
    todos = _web("lib/todos.ts")
    assert "practice_attendance" in todos and "/practice?day=" in todos


def test_privacy_policy_mentions_practices_without_new_version():
    privacy = _web("app/privacy/page.tsx")
    assert "比賽和練習" in privacy and "出席／請假回覆" in privacy
    # 使用者決定（2026-10-12）：只改文字，不更新 POLICY_VERSION，大家不用重新同意
    assert 'POLICY_VERSION = "2026-10-08"' in _web("lib/policies.ts")
