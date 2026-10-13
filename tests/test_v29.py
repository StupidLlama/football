"""v2.9 意見回饋（SPEC F10）＋加到日曆：0013 migration 和網站的靜態檢查（不用連資料庫）。

真正的權限測試在 supabase/tests/rls_test.sql 最後的「v2.9」那一段（py -m backend.scripts.rls_check）：
只有網站管理員能改狀態、回覆；本人只能標記已讀；別人看不到；刪帳號時回饋跟著刪。
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
MIG13 = (ROOT / "supabase" / "migrations" / "0013_feedback.sql").read_text(encoding="utf-8")
MIG12 = (ROOT / "supabase" / "migrations" / "0012_seasons.sql").read_text(encoding="utf-8")
RLS_TEST = (ROOT / "supabase" / "tests" / "rls_test.sql").read_text(encoding="utf-8")

ACTIONS = {"send_contact_message", "set_feedback_status", "reply_feedback", "mark_feedback_read", "export_my_data"}
ADMIN_ONLY = {"set_feedback_status", "reply_feedback"}


def read(rel: str) -> str:
    return (WEB / rel).read_text(encoding="utf-8")


def _functions(sql: str) -> dict[str, str]:
    return {m.group(1): m.group(0) for m in
            re.finditer(r"create or replace function public\.(\w+)\(.*?\bas \$\$", sql, re.S)}


def _body(name: str) -> str:
    start = MIG13.index(f"function public.{name}(")
    return MIG13[start:MIG13.index("end $$;", start)]


def test_0013_functions_are_safe():
    fns = _functions(MIG13)
    assert ACTIONS <= set(fns)
    revoked = re.search(r"revoke all on function(.*?)from public, anon;", MIG13, re.S).group(1)
    granted = re.search(r"grant execute on function(.*?)to authenticated;", MIG13, re.S).group(1)
    for name, head in fns.items():
        assert "security definer" in head and "set search_path = public" in head, name
        assert f"public.{name}(" in revoked and f"public.{name}(" in granted, name
    assert "to anon" not in MIG13


def test_admin_only_functions_check_is_admin():
    for name in ADMIN_ONLY:
        body = _body(name)
        assert "if not public.is_admin() then return jsonb_build_object('status', 'forbidden')" in body, name


def test_mark_read_only_touches_my_rows():
    assert "c.user_id = auth.uid()" in _body("mark_feedback_read")


def test_old_three_argument_function_is_dropped():
    """舊的 (text, text, text) 要先刪掉，不然只給三個參數呼叫時資料庫不知道要用哪一個。"""
    assert "drop function if exists public.send_contact_message(text, text, text);" in MIG13
    head = _functions(MIG13)["send_contact_message"]
    assert "version text default ''" in head and "device text default ''" in head


def test_no_direct_update_on_feedback():
    """改狀態、回覆一律走函式：收回直接 update 的權限、刪掉 0005 的 update 規則。"""
    assert "revoke update on public.contact_messages from authenticated;" in MIG13
    assert "drop policy if exists contact_messages_update on public.contact_messages;" in MIG13
    assert not re.search(r"grant[^;]*(insert|update)[^;]*on public\.contact_messages", MIG13)


def test_status_values_match_web():
    allowed = set(re.search(r"contact_messages_status_check check \(status in \(([^)]*)\)\)", MIG13).group(1)
                  .replace("'", "").replace(" ", "").split(","))
    assert allowed == {"new", "doing", "done"}
    web = set(re.findall(r'\["(\w+)", "[^"]+"\]', re.search(r"FEEDBACK_STATUS[^=]*= \[(.*?)\];", read("lib/feedback.ts"), re.S).group(1)))
    assert web == allowed


def test_feedback_is_not_a_team_table():
    """回饋屬於使用者、不屬於球隊：不掛 season_guard（舊賽季唯讀跟它無關）。"""
    assert "season_guard" not in MIG13.split("-- ============================================================")[-1]
    assert not re.search(r"contact_messages_season_guard", MIG12 + MIG13)


def test_export_includes_reply():
    body = _body("export_my_data")
    for col in ("'reply', c.reply", "'status', c.status", "'device', c.device", "'version', c.version"):
        assert col in body, col


def test_rls_test_covers_v29():
    section = RLS_TEST[RLS_TEST.index("v2.9 意見回饋"):]
    for label in ("本人改回饋狀態", "別人看得到我的回饋", "網站管理員回覆並標成已解決", "本人標記已讀", "刪帳號後回饋不見", "沒登入回覆"):
        assert label in section, label


def test_web_sends_version_and_device():
    route = read("app/api/contact/route.ts")
    assert 'db.rpc("send_contact_message", { category, body, page, version, device })' in route
    assert "allowed_mentions" in route
    fb = read("components/feedback.tsx")
    assert "deviceLabel(navigator.userAgent" in fb and "LATEST" in fb
    # 浮動按鈕在全站，正在打字時藏起來（不擋住聊天室的送出鍵）
    assert "<FeedbackFab />" in read("app/providers.tsx")
    assert "focusin" in fb and "!typing" in fb


def test_feedback_page_admin_tab_needs_admin():
    page = read("app/feedback/page.tsx")
    assert 'tab === "admin" && isAdmin' in page
    assert "RequireLogin" in page


def test_privacy_mentions_device_and_version():
    privacy = read("app/privacy/page.tsx")
    assert "裝置種類" in privacy and "網站版本" in privacy


def test_calendar_is_client_only():
    """加到日曆在瀏覽器裡產生檔案：不連外、不需要日曆權限、不放提醒（等 LINE 機器人）。"""
    ics = read("lib/ics.ts")
    imports = re.findall(r'^import .*? from "([^"]+)";', ics, re.M)
    assert imports and all(i.startswith("./") and i.endswith(".ts") for i in imports), imports
    assert "BEGIN:VALARM" not in ics
    assert "AddToCalendar" in read("app/t/[teamId]/practice/page.tsx")
    assert "AddToCalendar" in read("app/t/[teamId]/matches/[matchId]/page.tsx")
    assert "AddToCalendar" in read("components/practice-day-panel.tsx")


def test_old_streamlit_site_shows_moved_notice():
    """v2.9 舊網站退役：Streamlit 只顯示搬家公告；程式碼留在 repo（課程的 Clean Architecture 範例）。"""
    import tomllib
    settings = tomllib.loads((ROOT / "config" / "settings.toml").read_text(encoding="utf-8"))
    assert settings["site"]["moved_to"].startswith("https://")
    assert 'get("site", {}).get("moved_to"' in (ROOT / "infra" / "config.py").read_text(encoding="utf-8")
    app = (ROOT / "app.py").read_text(encoding="utf-8")
    notice = app.index("if config.moved_to():")
    assert notice < app.index("st.navigation(")          # 在顯示任何資料之前就停下來
    assert "st.stop()" in app[notice:app.index("PAGES = [")]
    for layer in ("domain", "stats", "adapters", "infra"):
        assert (ROOT / layer).is_dir(), layer
