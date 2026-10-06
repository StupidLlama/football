"""v2.3：球員生涯（0006 migration）、雷達圖切換、同位置比較、圖表動畫的檢查（不用連資料庫、不用 npm）。

真正的權限測試在 supabase/tests/rls_test.sql（py -m backend.scripts.rls_check）；
網站的計算測試在 web/tests/v23.test.ts（cd web 後 npm test）。
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
MIG6 = (ROOT / "supabase" / "migrations" / "0006_career.sql").read_text(encoding="utf-8")
RLS = (ROOT / "supabase" / "tests" / "rls_test.sql").read_text(encoding="utf-8")


def read(rel: str) -> str:
    return (WEB / rel).read_text(encoding="utf-8")


def test_0006_functions_are_safe():
    heads = {m.group(1): m.group(0) for m in
             re.finditer(r"create or replace function public\.(\w+)\(.*?\bas \$\$", MIG6, re.S)}
    assert {"set_career_shared", "get_career", "export_my_data"} <= set(heads)
    for name, head in heads.items():
        assert "security definer" in head and "set search_path = public" in head, name
        assert re.search(rf"revoke all on function public\.{name}\([^)]*\) from public, anon;", MIG6), name
        assert re.search(rf"grant execute on function public\.{name}\([^)]*\) to authenticated;", MIG6), name


def test_career_is_off_by_default_and_not_writable_directly():
    assert re.search(r"add column career_shared boolean not null default false", MIG6)
    assert not re.search(r"grant update[^;]*on public\.memberships", MIG6), "生涯開關只能走 set_career_shared"


def test_get_career_only_returns_shared_or_own_teams():
    body = MIG6[MIG6.index("function public.get_career"):]
    assert "(is_self or m.team_id = team or m.career_shared)" in body
    assert "'not_member'" in body and "'not_found'" in body


def test_rls_test_covers_v23():
    for label in ("還沒放進生涯時只看得到這一隊", "本人看得到自己所有隊伍", "直接改生涯開關", "沒打開的 E 隊看不到",
                  "生涯裡沒有別人的能力表", "生涯不會打開別隊的資料表", "非隊友看生涯", "用自己隊查別隊球員",
                  "拿掉之後隊友只看到這一隊", "沒登入看生涯"):
        assert label in RLS, label


def test_privacy_policy_mentions_career_and_version_bumped():
    assert "生涯" in read("app/privacy/page.tsx")
    version = re.search(r'POLICY_VERSION = "(\d{4}-\d{2}-\d{2})"', read("lib/policies.ts")).group(1)
    assert version >= "2026-10-06", "政策內容改了，要更新 POLICY_VERSION"


def test_report_has_radar_modes_and_career_tab():
    page = read("app/t/[teamId]/players/[playerId]/page.tsx")
    for text in ("自評", "比賽表現", "兩者疊圖", "尚無比賽數據", "生涯", "CareerPanel"):
        assert text in page, text


def test_compare_has_position_average():
    page = read("app/t/[teamId]/players/page.tsx")
    assert "同位置平均" in page and "groupAverage" in page


def test_animations_respect_reduced_motion():
    anim = read("components/anim.tsx")
    assert "prefers-reduced-motion: reduce" in anim
    css = read("app/globals.css")
    tail = css[css.index("/* v2.3 圖表 */"):]
    assert "@media (prefers-reduced-motion: reduce)" in tail
    for cls in (".line-draw", ".pop-in", ".fade-up"):
        assert cls in tail.split("@media (prefers-reduced-motion: reduce)")[1], f"{cls} 在減少動態效果時要關掉"
