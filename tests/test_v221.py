"""v2.2.1：隱私權政策、服務條款、同意紀錄、刪除帳號、下載資料、聯絡我們（不用連資料庫）。

真正的權限測試在 supabase/tests/rls_test.sql 的「v2.2.1」段落（py -m backend.scripts.rls_check）。
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
MIG = (ROOT / "supabase" / "migrations" / "0005_privacy.sql").read_text(encoding="utf-8")


def read(rel: str) -> str:
    return (WEB / rel).read_text(encoding="utf-8")


def test_0005_functions_are_safe():
    heads = {m.group(1): m.group(0) for m in
             re.finditer(r"create or replace function public\.(\w+)\(.*?\bas \$\$", MIG, re.S)}
    assert {"accept_policies", "delete_my_account", "delete_unlinked_player", "export_my_data", "send_contact_message"} <= set(heads)
    revoked = re.search(r"revoke all on function(.*?)from public, anon;", MIG, re.S).group(1)
    granted = re.search(r"grant execute on function(.*?)to authenticated;", MIG, re.S).group(1)
    for name, head in heads.items():
        assert "security definer" in head and "set search_path = public" in head, name
        assert f"public.{name}(" in revoked and f"public.{name}(" in granted, name


def test_contact_messages_only_through_function():
    """不能直接新增（要經過次數限制）；只有網站管理員能改狀態。"""
    assert "revoke all on public.contact_messages from anon, authenticated" in MIG
    assert not re.search(r"grant[^;]*insert[^;]*on public\.contact_messages", MIG)
    assert "grant update (status) on public.contact_messages" in MIG
    assert "enable row level security" in MIG


def test_policy_version_matches_pages():
    policies = read("lib/policies.ts")
    version = re.search(r'POLICY_VERSION = "(\d{4}-\d{2}-\d{2})"', policies).group(1)
    assert version
    # 同意頁、兩份政策都用同一個版本常數，不能各寫各的
    for rel in ("app/privacy/page.tsx", "app/terms/page.tsx", "app/consent/page.tsx"):
        text = read(rel)
        assert "POLICY_VERSION" in text and version not in text, rel


def test_privacy_policy_covers_pdpa_notice():
    """個資法第 8 條：蒐集者、目的、類別、期間地區對象方式、當事人權利、不提供的影響。"""
    text = read("app/privacy/page.tsx")
    for must in ("網站管理員", "球隊管理員", "為什麼蒐集", "蒐集哪些資料", "保存多久", "存在哪裡", "你的權利",
                 "製給複製本", "刪除", "不提供", "Cookie", "未成年", "外洩"):
        assert must in text, must


def test_policy_does_not_hardcode_operator_real_name():
    """repo 是公開的：政策裡只寫「網站管理員」。"""
    for rel in ("lib/policies.ts", "app/privacy/page.tsx", "app/terms/page.tsx"):
        assert "林" not in read(rel), rel


def test_every_logged_in_page_requires_consent():
    """RequireLogin 會檢查同意版本；只有同意頁本身可以跳過。"""
    guard = read("components/guard.tsx")
    assert "needsConsent" in guard and "/consent" in guard
    skips = [p for p in (WEB / "app").rglob("page.tsx") if "skipConsent" in p.read_text(encoding="utf-8")]
    assert [p.parent.name for p in skips] == ["consent"]


def test_public_pages_do_not_require_login():
    for rel in ("app/privacy/page.tsx", "app/terms/page.tsx"):
        assert "RequireLogin" not in read(rel), rel


def test_footer_links_policies():
    ui = read("components/ui.tsx")
    for href in ('"/privacy"', '"/terms"', '"/contact"'):
        assert href in ui


def test_discord_webhook_stays_on_server():
    route = read("app/api/contact/route.ts")
    assert "process.env.DISCORD_WEBHOOK_URL" in route
    assert "allowed_mentions" in route          # 訊息裡的 @everyone 不會真的通知所有人
    for p in WEB.rglob("*.ts*"):
        if "node_modules" in p.parts or p.name == "route.ts":
            continue
        assert "DISCORD_WEBHOOK" not in p.read_text(encoding="utf-8"), p


def test_security_headers():
    cfg = read("next.config.mjs")
    for h in ("Content-Security-Policy", "Strict-Transport-Security", "X-Frame-Options", "frame-ancestors 'none'", "object-src 'none'"):
        assert h in cfg, h
    # 字體自己提供，不再連 Google Fonts
    layout = read("app/layout.tsx")
    assert "next/font/google" in layout and "fonts.googleapis.com" not in layout


def test_ui_says_team_manager_not_coach():
    """畫面上的「教練」都改成「球隊管理員」，「系統管理者」改成「網站管理員」（資料庫裡的值還是 coach）。"""
    for p in list((WEB / "app").rglob("*.tsx")) + list((WEB / "components").rglob("*.tsx")) + [WEB / "lib" / "status.ts"]:
        text = p.read_text(encoding="utf-8")
        assert "教練" not in text and "系統管理者" not in text, p.relative_to(WEB)


def test_csp_trims_supabase_url():
    """環境變數貼上時常多換行（2026-10-05 上線時就發生過：CSP 壞掉、登入不了），要先去空白再取 origin。"""
    cfg = read("next.config.mjs")
    assert ".trim()" in cfg and ".origin" in cfg
    assert ".trim()" in read("lib/supabase.ts")
