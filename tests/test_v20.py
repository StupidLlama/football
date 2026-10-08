"""v2.0：資料表、權限規則、後端、匯入工具。

不需要網路的測試都在這裡；要連真的資料庫的測試請跑：
    py -m backend.scripts.rls_check
"""
import re
import time
from datetime import date
from pathlib import Path

import pytest

from backend.importer import fixture_key, fixture_rows, player_rows, submitted_at
from backend.queries import fixture_json, match_status, row_to_fixture
from backend.scripts.migrate import migration_files, pending
from backend.scripts.rls_check import body
from backend.settings import Settings, load_settings, parse_env
from infra import config

ROOT = Path(__file__).resolve().parent.parent
MIG = ROOT / "supabase" / "migrations"
SQL = "\n".join(f.read_text(encoding="utf-8") for f in migration_files(MIG))


# ---------- 資料表與權限規則（靜態檢查）----------
def tables() -> list[str]:
    return re.findall(r"create table public\.(\w+)", SQL)


def test_every_table_has_rls():
    for t in tables():
        assert re.search(rf"alter table public\.{t}\s+enable row level security", SQL), f"{t} 沒有打開 RLS"


# 只有資料庫函式能讀寫的表：故意不給任何 RLS 規則（team_secrets 在 v2.1 已刪除）
SECRET_TABLES = {"team_secrets", "join_attempts", "chat_discord"}


def test_every_table_except_secrets_has_select_policy():
    for t in tables():
        has = re.search(rf"create policy \w+ on public\.{t}\s+for (select|all)", SQL)
        assert bool(has) == (t not in SECRET_TABLES), t


def test_no_policy_for_anon():
    assert not re.search(r"create policy[^;]*\bto anon\b", SQL)


def test_migration_files_are_numbered_and_ordered():
    names = [f.name for f in migration_files(MIG)]
    assert names == sorted(names) and names[0].startswith("0001_")
    assert [int(n[:4]) for n in names] == list(range(1, len(names) + 1))
    assert [f.name for f in pending({names[0]}, migration_files(MIG))] == names[1:]


def test_rls_test_body_strips_transaction():
    text = (ROOT / "supabase" / "tests" / "rls_test.sql").read_text(encoding="utf-8")
    assert "begin;" in text and "rollback;" in text
    b = body(text)
    assert "begin;" not in b.lower().split() and "RLS OK" in b


def test_no_real_names_in_v2_sql():
    """repo 是公開的：測試資料只能用假名字。"""
    team_csv = ROOT / "data" / "team.xlsx"
    if not team_csv.exists():
        pytest.skip("沒有本機球員資料")
    import pandas as pd
    names = set(pd.read_excel(team_csv)[config.form_spec().columns["name"]].dropna().astype(str))
    text = SQL + (ROOT / "supabase" / "tests" / "rls_test.sql").read_text(encoding="utf-8")
    assert not [n for n in names if len(n) >= 2 and n in text]


# ---------- 設定 ----------
def test_parse_env():
    env = parse_env('# 註解\nA=1\nB = "two"\nC=\'3\'\n\nD=x=y\n')
    assert env == {"A": "1", "B": "two", "C": "3", "D": "x=y"}


def test_load_settings_prefers_environment(tmp_path):
    f = tmp_path / ".env"
    f.write_text("SUPABASE_URL=https://abc.supabase.co\nDATABASE_URL=file\n", encoding="utf-8")
    s = load_settings(f, environ={"DATABASE_URL": "env", "OTHER": "x"})
    assert s.supabase_url == "https://abc.supabase.co" and s.database_url == "env"
    assert s.jwks_url == "https://abc.supabase.co/auth/v1/.well-known/jwks.json"
    assert s.missing() == ["SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"]
    assert load_settings(tmp_path / "none", environ={}).missing() == list(
        ("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "DATABASE_URL"))


def test_env_is_gitignored():
    lines = (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
    assert ".env" in lines and "!.env.example" in lines
    assert (ROOT / ".env.example").exists()


# ---------- 登入驗證 ----------
def test_jwt_verify_accepts_valid_and_rejects_bad():
    jwt = pytest.importorskip("jwt")
    pytest.importorskip("cryptography")
    from cryptography.hazmat.primitives.asymmetric import ec

    from backend.auth import AuthError, bearer_token, verify
    key, other = ec.generate_private_key(ec.SECP256R1()), ec.generate_private_key(ec.SECP256R1())
    iss = "https://abc.supabase.co/auth/v1"
    claims = {"sub": "u1", "aud": "authenticated", "iss": iss, "exp": int(time.time()) + 60}
    good = jwt.encode(claims, key, algorithm="ES256")
    assert verify(good, "", issuer=iss, key=key.public_key())["sub"] == "u1"
    for bad in (jwt.encode(claims, other, algorithm="ES256"),                      # 別人簽的
                jwt.encode({**claims, "exp": int(time.time()) - 5}, key, algorithm="ES256"),   # 過期
                jwt.encode({**claims, "aud": "anon"}, key, algorithm="ES256"),       # 不是登入的人
                "not-a-jwt"):
        with pytest.raises(AuthError):
            verify(bad, "", issuer=iss, key=key.public_key())
    assert bearer_token("Bearer abc") == "abc"
    for h in (None, "", "Basic abc"):
        with pytest.raises(AuthError):
            bearer_token(h)


# ---------- 資料庫列 → domain ----------
ROW = {"day": date(2026, 10, 16), "start_time": "19:00:00", "end_time": "20:00:00", "home": "資訊", "away": "能源",
       "round": 2, "match_no": 7, "home_score": None, "away_score": None, "referee": "", "linesmen": ["電機", "醫學"],
       "note": "", "analyzed_at": None}


def test_row_to_fixture_and_status():
    f = row_to_fixture(ROW)
    assert (f.start, f.end, f.linesmen, f.score) == ("19:00", "20:00", ("電機", "醫學"), None)
    assert match_status(ROW, date(2026, 10, 1)) == "upcoming"
    assert match_status(ROW, date(2026, 10, 20)) == "finished"            # 過了日期就算已結束
    assert match_status({**ROW, "home_score": 3, "away_score": 1}, date(2026, 10, 1)) == "finished"
    assert match_status({**ROW, "analyzed_at": "2026-10-20"}, date(2026, 10, 1)) == "analyzed"


def test_fixture_json_from_our_side():
    j = fixture_json({**ROW, "home_score": 1, "away_score": 2}, "資訊", date(2026, 10, 20))
    assert (j["ours"], j["opponent"], j["result"], j["score"]) == (True, "能源", "L", [1, 2])
    other = fixture_json({**ROW, "home": "法律"}, "資訊", date(2026, 10, 1))
    assert (other["ours"], other["opponent"], other["result"]) == (False, None, None)


# ---------- 匯入工具 ----------
def test_submitted_at():
    assert submitted_at("2026-09-29 14:33:09") == "2026-09-29T14:33:09+08:00"
    assert submitted_at("NaT") == submitted_at(None) == submitted_at("") == "2026-01-01T00:00:00+08:00"
    assert submitted_at("2026-09-29T06:33:09Z").endswith("Z")


def test_player_rows():
    rules = config.rules()
    p = {k: 3 for k in rules.ability_keys}
    p.update(name="甲", nickname="甲", good_positions="CB，ST", bad_positions=None, weak_side="left", message="hi",
             submitted_at="2026-09-29 14:33:09")
    q = {**p, "name": "乙", "nickname": "小乙", "weak_side": "??"}
    a, b = player_rows([p, q], rules, roles={"甲": "c", "乙": "boss"}, numbers={"乙": 7})
    assert (a["nickname"], a["badge"], a["jersey_number"], a["good_positions"], a["bad_positions"]) == \
           ("", "C", None, ["CB", "ST"], [])
    assert (b["nickname"], b["badge"], b["jersey_number"], b["weak_side"]) == ("小乙", None, "7", "")
    assert set(a["scores"]) == set(rules.ability_keys)


def test_fixture_rows_and_keys():
    f = row_to_fixture({**ROW, "home_score": 2, "away_score": 2})
    (r,) = fixture_rows([f])
    assert (r["day"], r["start_time"], r["home_score"], r["linesmen"]) == ("2026-10-16", "19:00", 2, ["電機", "醫學"])
    assert fixture_key(r) == ("2026-10-16", "19:00", "資訊", "能源")


# ---------- API（有裝 fastapi 才跑）----------
def test_api_routes_exist():
    pytest.importorskip("fastapi")
    from backend.main import app
    paths = {r.path for r in app.routes}
    assert {"/health", "/me/teams", "/teams/{team_id}/players", "/teams/{team_id}/fixtures",
            "/teams/{team_id}/duties"} <= paths


def test_api_requires_login():
    pytest.importorskip("fastapi")
    pytest.importorskip("httpx")
    from fastapi.testclient import TestClient

    from backend import main
    main.settings.cache_clear()
    main.settings.__wrapped__  # noqa: B018 確認有快取
    client = TestClient(main.app)
    for path in ("/me/teams", "/teams/x/players", "/teams/x/fixtures", "/teams/x/duties"):
        r = client.get(path)
        assert r.status_code == 401, path
        assert client.get(path, headers={"Authorization": "Bearer nope"}).status_code == 401
