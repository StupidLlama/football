"""v2.1：帳號系統（加入球隊、教練碼、認領、教練管理）。

規則寫在資料庫函式裡（0003_accounts.sql），真正的權限測試在 supabase/tests/rls_test.sql：
    py -m backend.scripts.rls_check
這裡是不用連資料庫的檢查：SQL 的寫法、API 的狀態碼對照、API 有沒有要求登入。
"""
import ast
import re
import uuid
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MIG = (ROOT / "supabase" / "migrations" / "0003_accounts.sql").read_text(encoding="utf-8")
RLS_TEST = (ROOT / "supabase" / "tests" / "rls_test.sql").read_text(encoding="utf-8")


def functions(sql: str) -> dict[str, str]:
    """函式名稱 → 函式的定義（到 $$ 開始為止的標頭）。"""
    return {m.group(1): m.group(0) for m in
            re.finditer(r"create or replace function public\.(\w+)\(.*?\bas \$\$", sql, re.S)}


def status_map() -> dict:
    """直接讀 backend/accounts.py 的 STATUS（不 import，雲端沒裝 fastapi 也能測）。"""
    tree = ast.parse((ROOT / "backend" / "accounts.py").read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "STATUS":
            return ast.literal_eval(node.value)
    raise AssertionError("找不到 STATUS")


# ---------- 資料庫函式 ----------
def test_security_definer_functions_pin_search_path():
    """security definer 函式一定要固定 search_path，否則別人可以用同名函式「偷換」。"""
    for name, head in functions(MIG).items():
        if "security definer" in head:
            assert "set search_path = public" in head, name


def test_actions_are_not_callable_without_login():
    revoked = re.search(r"revoke all on function(.*?)from public, anon;", MIG, re.S).group(1)
    granted = re.search(r"grant execute on function(.*?)to authenticated;", MIG, re.S).group(1)
    for name, head in functions(MIG).items():
        if "security definer" in head:
            assert f"public.{name}(" in revoked, f"{name} 沒有從 anon 收回"
    # 給登入的人的每個函式，都先從 anon 收回過
    for name in re.findall(r"public\.(\w+)\(", granted):
        assert f"public.{name}(" in revoked, name


def test_every_status_has_a_message():
    """資料庫函式回傳的每一種 status，API 都知道要回什麼狀態碼和訊息。"""
    statuses = set(re.findall(r"'status',\s*'(\w+)'", MIG))
    for pair in re.findall(r"then '(\w+)' else '(\w+)'", MIG):
        statuses |= set(pair)
    known = status_map()
    assert statuses and statuses <= set(known), statuses - set(known)
    for code, message in known.values():
        assert 200 <= code < 600 and message


def test_status_codes_for_attacks_are_not_200():
    known = status_map()
    for s in ("locked", "banned", "wrong_code", "forbidden", "not_found", "not_member", "unauthenticated"):
        assert known[s][0] >= 400, s
    assert known["locked"][0] == 429


def test_code_alphabet_has_no_lookalikes():
    alphabet = re.search(r"alphabet constant text := '(\w+)'", MIG).group(1)
    assert len(alphabet) == len(set(alphabet)) == 31
    assert not set("01OIL") & set(alphabet)
    # Team ID 格式檢查（轉換舊代碼用的）要跟字母表一致
    pattern = re.search(r"code !~ '\^(\[[^\]]+\])\{4\}", MIG).group(1)
    assert {c for c in "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ" if re.fullmatch(pattern, c)} == set(alphabet)


def test_limits_match_spec():
    assert "fails >= 5" in MIG and "interval '15 minutes'" in MIG        # Team ID：5 次、15 分鐘
    assert "g.failures >= 5" in MIG and "banned_at = now()" in MIG       # 教練碼：5 次封鎖
    assert "create_coach_code(uuid, int)" in MIG and "valid_days int default 7" in MIG
    assert "random_code(8)" in MIG and "random_code(10)" in MIG          # Team ID 8 碼、教練碼 10 碼


def test_coach_code_hash_is_never_readable():
    grant = re.search(r"grant select \((.*?)\)\s+on public\.coach_codes", MIG, re.S).group(1)
    assert "code_hash" not in grant and "salt" not in grant


def test_rls_test_covers_v21():
    for label in ("同一個帳號在 A 隊是教練、在 B 隊是球員", "錯 5 次後就算輸入正確也被鎖", "封鎖中輸入正確的教練碼",
                  "用重設前的舊 Team ID 加入", "教練確認前還沒連上", "教練移出另一位教練", "把自己設成管理者",
                  "球員把自己移到別隊", "沒登入加入球隊"):
        assert label in RLS_TEST, label


# ---------- 匯入工具 ----------
def test_importer_does_not_require_code():
    text = (ROOT / "backend" / "importer.py").read_text(encoding="utf-8")
    assert '"--code", required=True' not in text and "normalize_code" in text


# ---------- API（有裝 fastapi 才跑）----------
NEW_ROUTES = {
    ("GET", "/me"), ("PATCH", "/me"), ("POST", "/teams/join"), ("POST", "/teams/{team_id}/leave"),
    ("POST", "/teams/{team_id}/coach-code/redeem"), ("GET", "/teams/{team_id}/claimable"),
    ("POST", "/teams/{team_id}/claim"), ("GET", "/teams/{team_id}/members"), ("GET", "/teams/{team_id}/coach-codes"),
    ("POST", "/teams/{team_id}/coach-codes"), ("DELETE", "/coach-codes/{code_id}"),
    ("POST", "/teams/{team_id}/code/reset"), ("POST", "/teams/{team_id}/members/{member_id}/unban"),
    ("DELETE", "/teams/{team_id}/members/{member_id}"), ("POST", "/teams/{team_id}/members/{member_id}/claim"),
    ("POST", "/admin/teams"), ("POST", "/admin/teams/{team_id}/members/{member_id}/demote"),
}


def test_api_routes_exist():
    pytest.importorskip("fastapi")
    from backend.main import app
    have = {(m, r.path) for r in app.routes for m in getattr(r, "methods", ())}
    assert NEW_ROUTES <= have, NEW_ROUTES - have


def test_new_api_requires_login():
    pytest.importorskip("fastapi")
    pytest.importorskip("httpx")
    from fastapi.testclient import TestClient

    from backend import main
    client = TestClient(main.app)
    some = str(uuid.uuid4())
    for method, path in NEW_ROUTES:
        url = path.replace("{team_id}", some).replace("{member_id}", some).replace("{code_id}", some)
        r = client.request(method, url, json={"code": "X", "approve": True, "display_name": "x", "name": "x"})
        assert r.status_code == 401, (method, path, r.status_code)


def test_result_maps_status_to_http():
    pytest.importorskip("fastapi")
    from fastapi import HTTPException

    from backend.accounts import result
    assert result({"status": "joined", "team_id": "t"})["message"] == "已加入球隊"
    with pytest.raises(HTTPException) as e:
        result({"status": "not_found", "attempts_left": 3}, "找不到這個 Team ID")
    assert e.value.status_code == 404 and e.value.detail["attempts_left"] == 3
    assert e.value.detail["message"] == "找不到這個 Team ID"
    with pytest.raises(HTTPException) as e:
        result({"status": "locked", "until": "2026-10-04T22:00:00+08:00"})
    assert e.value.status_code == 429
    with pytest.raises(HTTPException) as e:
        result({"status": "invalid", "detail": "名字最多 40 字"})
    assert (e.value.status_code, e.value.detail["message"]) == (400, "名字最多 40 字")
    with pytest.raises(HTTPException) as e:
        result({"status": "something_new"})
    assert e.value.status_code == 500


def test_dev_page_is_local_only():
    pytest.importorskip("fastapi")
    from types import SimpleNamespace

    from fastapi import HTTPException

    from backend.main import _local_only
    for host in ("127.0.0.1", "::1", "localhost"):
        _local_only(SimpleNamespace(client=SimpleNamespace(host=host)))
    for req in (SimpleNamespace(client=SimpleNamespace(host="203.0.113.5")), SimpleNamespace(client=None)):
        with pytest.raises(HTTPException):
            _local_only(req)


def test_dev_page_has_no_secrets():
    html = (ROOT / "backend" / "dev_page.html").read_text(encoding="utf-8")
    assert "SUPABASE_SECRET" not in html and "service_role" not in html and "secret_key" not in html
    assert "/dev/config" in html
