"""v2.10 資安檢查：0014 migration 和網站的靜態檢查（不用連資料庫）。

真正的權限測試在 supabase/tests/rls_test.sql 最後的「v2.10」那一段（py -m backend.scripts.rls_check）：
能力表不能直接寫、資料表有字數上限、下載資料涵蓋全部個人資料，以及整個資料庫的總檢查
（每張表有 RLS、沒登入的人沒有任何資料表權限、security definer 函式都固定 search_path、
只有 get_shared_lineup 給沒登入的人呼叫）。報告在 docs/SECURITY_REVIEW.md。
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("0*.sql"))
MIG14 = (ROOT / "supabase" / "migrations" / "0014_security.sql").read_text(encoding="utf-8")
RLS_TEST = (ROOT / "supabase" / "tests" / "rls_test.sql").read_text(encoding="utf-8")


def _number(p: Path) -> int:
    return int(p.name[:4])


def test_ratings_only_through_function():
    """能力表只能經過 submit_self_rating（直接 insert 會跳過 1–5 分、日期的檢查）。"""
    assert "revoke insert, delete on public.ability_ratings from authenticated" in MIG14
    assert "drop policy if exists ratings_insert" in MIG14 and "drop policy if exists ratings_delete" in MIG14
    # 0014 之後的 migration 不能把直接寫入加回去
    for p in MIGRATIONS:
        if _number(p) > 14:
            sql = p.read_text(encoding="utf-8").lower()
            assert not re.search(r"grant[^;]*(insert|delete|all)[^;]*on public\.ability_ratings", sql), p.name
            assert "for insert" not in sql or "ability_ratings" not in sql, p.name


def test_web_never_writes_ratings_directly():
    api = (WEB / "lib" / "api.ts").read_text(encoding="utf-8")
    assert not re.search(r'from\("ability_ratings"\)\s*\.(insert|upsert|update|delete)', api)
    assert 'rpc("submit_self_rating"' in api


def test_table_limits_are_not_valid_constraints():
    """字數上限用 NOT VALID：舊資料不檢查，新增和修改才檢查（不然 migration 可能因為舊資料失敗）。"""
    for name in ("players_name_len", "players_nickname_len", "players_message_len", "players_jersey_len",
                 "players_positions_ok", "teams_name_len", "teams_season_len", "teams_league_name_len",
                 "fixtures_text_len"):
        m = re.search(rf"add constraint {name}\s+check \((.*?)\) not valid", MIG14, re.S)
        assert m, name


def test_table_limits_are_looser_than_the_website():
    """資料表的上限不能比網站／資料庫函式嚴，不然正常操作會撞到資料庫錯誤。"""
    assert int(re.search(r"players_nickname_len\s+check \(char_length\(nickname\) <= (\d+)", MIG14).group(1)) >= 20
    assert int(re.search(r"players_message_len\s+check \(char_length\(message\) <= (\d+)", MIG14).group(1)) >= 300
    assert int(re.search(r"teams_season_len\s+check \(char_length\(season\) <= (\d+)", MIG14).group(1)) >= 20


# 每張有「某個人的資料」的表都要出現在下載我的資料裡（個資法：當事人可以要求查閱）
PERSONAL_TABLES = {
    "profiles", "memberships", "players", "ability_ratings", "attendance", "practice_attendance",
    "lineups", "messages", "contact_messages", "chat_reads", "duties", "join_attempts", "coach_code_guard",
}
# 不放進下載資料的表和原因
NOT_PERSONAL = {
    "teams": "球隊資料（下載資料裡有隊名、賽季）",
    "coach_codes": "管理員碼只有雜湊值，不是本人的資料",
    "fixtures": "系際聯賽賽程，公開資訊（裁判任務會帶出日期和對手）",
    "matches": "球隊的比賽（出席紀錄會帶出對手和時間）",
    "practices": "球隊的練習（練習出席會帶出時間地點）",
    "chat_discord": "球隊的 Discord 設定",
}


def _latest_export() -> str:
    body = ""
    for p in MIGRATIONS:
        sql = p.read_text(encoding="utf-8")
        i = sql.find("function public.export_my_data()")
        if i >= 0 and "returns jsonb" in sql[i:i + 200]:
            body = sql[i:sql.index("end $$;", i)]
    return body


def test_export_covers_every_personal_table():
    body = _latest_export()
    for t in PERSONAL_TABLES:
        assert f"public.{t} " in body or f"public.{t}\n" in body, t


def test_every_table_is_classified():
    """新增資料表時要決定：要不要放進下載我的資料？（放進 PERSONAL_TABLES 或 NOT_PERSONAL）"""
    tables = set()
    for p in MIGRATIONS:
        tables |= set(re.findall(r"create table (?:if not exists )?public\.(\w+)", p.read_text(encoding="utf-8")))
    tables.discard("team_secrets")   # 0002 建、之後刪掉的表
    assert tables <= PERSONAL_TABLES | set(NOT_PERSONAL), tables - PERSONAL_TABLES - set(NOT_PERSONAL)


def test_0014_function_permissions():
    assert "security definer" in MIG14 and "set search_path = public" in MIG14
    assert "revoke all on function public.export_my_data() from public, anon;" in MIG14
    assert "grant execute on function public.export_my_data() to authenticated;" in MIG14


def test_rls_test_has_database_wide_checks():
    for label in ("沒開 RLS 的表", "給沒登入的人的資料表權限", "security definer 函式沒固定 search_path",
                  "沒登入的人能呼叫的 security definer 函式", "球員直接塞 999 分、未來日期的自評",
                  "暱稱塞爆", "位置亂填", "球隊管理員直接刪自評", "下載資料有裁判任務和已讀時間"):
        assert label in RLS_TEST, label


def test_security_headers_v210():
    cfg = (WEB / "next.config.mjs").read_text(encoding="utf-8")
    assert '"Cross-Origin-Opener-Policy", value: "same-origin"' in cfg
    assert "frame-ancestors 'none'" in cfg and "object-src 'none'" in cfg


def test_consent_uses_safe_next():
    page = (WEB / "app" / "consent" / "page.tsx").read_text(encoding="utf-8")
    assert "safeNext(" in page
    nav = (WEB / "lib" / "nav.ts").read_text(encoding="utf-8")
    assert "new URL(path" in nav and "\\u0000-\\u001f" in nav
