"""v2.2：Next.js 網站（web/）和 0004 migration 的檢查（不用連資料庫、不用 npm）。

真正的權限測試在 supabase/tests/rls_test.sql（py -m backend.scripts.rls_check）；
網站的計算測試在 web/tests（cd web 後 npm test）。這裡檢查兩邊「對得起來」：
  - 網站的能力設定跟 config/settings.toml 一致
  - 網站查的欄位、呼叫的資料庫函式和參數名稱都真的存在
  - 網站的狀態訊息跟後端一樣、每種 status 都有訊息
  - 0004 的函式和權限照規則寫
  - 網站不會用到秘密金鑰
"""
import ast
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("0*.sql"))
ALL_SQL = "\n".join(p.read_text(encoding="utf-8") for p in MIGRATIONS)
MIG4 = (ROOT / "supabase" / "migrations" / "0004_web.sql").read_text(encoding="utf-8")
API = (WEB / "lib" / "api.ts").read_text(encoding="utf-8")


def web_sources():
    for p in WEB.rglob("*"):
        if p.suffix in {".ts", ".tsx", ".mjs"} and "node_modules" not in p.parts and ".next" not in p.parts:
            yield p


# ---------- 設定同步 ----------
def test_web_config_matches_settings():
    sys.path.insert(0, str(WEB / "scripts"))
    import sync_config
    expected = sync_config.render(sync_config.build())
    actual = (WEB / "lib" / "config.json").read_text(encoding="utf-8")
    assert actual == expected, "改了 config/settings.toml 之後要執行 py web/scripts/sync_config.py"


# ---------- 欄位與函式都存在 ----------
def table_columns() -> dict[str, set[str]]:
    """從所有 migration 找出每張表有哪些欄位（create table + alter table add column）。"""
    cols: dict[str, set[str]] = {}
    for m in re.finditer(r"create table public\.(\w+) \((.*?)\n\);", ALL_SQL, re.S):
        names = set()
        for line in m.group(2).splitlines():
            w = re.match(r"\s+([a-z_]+)\s+[a-z]", line)
            if w and w.group(1) not in {"primary", "unique", "check", "constraint", "foreign"}:
                names.add(w.group(1))
        cols[m.group(1)] = names
    for m in re.finditer(r"alter table public\.(\w+)\s+((?:add column[^;]*?)+);", ALL_SQL, re.S):
        cols.setdefault(m.group(1), set()).update(re.findall(r"add column (\w+)", m.group(2)))
    return cols


def test_selected_columns_exist():
    cols = table_columns()
    table_of = {"team": "teams", "membership": "memberships", "player": "players", "rating": "ability_ratings",
                "profile": "profiles", "guard": "coach_code_guard", "code": "coach_codes", "fixture": "fixtures", "duty": "duties",
                "contact": "contact_messages", "match": "matches", "attendance": "attendance", "message": "messages"}
    block = re.search(r"const COLS = \{(.*?)\n\};", API, re.S).group(1)
    found = dict(re.findall(r'(\w+): "([^"]+)"', block))
    assert set(found) == set(table_of)
    for key, fields in found.items():
        for c in (x.strip() for x in fields.split(",")):
            assert c in cols[table_of[key]], f"{table_of[key]} 沒有欄位 {c}"


def test_coach_codes_never_select_secrets():
    """coach_codes 的 salt、code_hash 沒有開放給網站（0003 只 grant 了部分欄位）。"""
    block = re.search(r'code: "([^"]+)"', API).group(1)
    assert "salt" not in block and "code_hash" not in block
    grant = re.search(r"grant select \((.*?)\)\s+on public\.coach_codes", ALL_SQL, re.S).group(1)
    assert {c.strip() for c in block.split(",")} <= {c.strip() for c in grant.split(",")}


def function_params() -> dict[str, list[str]]:
    out = {}
    for m in re.finditer(r"create or replace function public\.(\w+)\((.*?)\)\s*returns", ALL_SQL, re.S):
        out[m.group(1)] = [p.split()[0] for p in m.group(2).split(",") if p.strip()]
    return out


def test_rpc_calls_match_database_functions():
    params = function_params()
    calls = re.findall(r'rpc\("(\w+)", \{([^}]*)\}\)', API, re.S)
    assert len(calls) >= 13
    for fn, args in calls:
        assert fn in params, f"資料庫沒有函式 {fn}"
        keys = [a.split(":")[0].strip() for a in args.split(",") if a.strip()]
        for k in keys:
            assert k in params[fn], f"{fn} 沒有參數 {k}（有 {params[fn]}）"


def test_tables_used_by_web_exist():
    cols = table_columns()
    for t in set(re.findall(r'\.from\("(\w+)"\)', API)):
        assert t in cols, t


# ---------- 狀態訊息 ----------
def backend_status() -> dict:
    tree = ast.parse((ROOT / "backend" / "accounts.py").read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "STATUS":
            return ast.literal_eval(node.value)
    raise AssertionError("找不到 STATUS")


def web_status() -> dict:
    text = (WEB / "lib" / "status.ts").read_text(encoding="utf-8")
    block = re.search(r"export const STATUS: Record<string, string> = \{(.*?)\n\};", text, re.S).group(1)
    return dict(re.findall(r'(\w+): "([^"]+)"', block))


def test_web_and_backend_messages_match():
    back = {k: v[1] for k, v in backend_status().items()}
    assert web_status() == back


def test_every_status_has_a_message():
    statuses = set(re.findall(r"'status',\s*'(\w+)'", ALL_SQL))
    for pair in re.findall(r"then '(\w+)' else '(\w+)'", ALL_SQL):
        statuses |= set(pair)
    assert statuses <= set(web_status()), statuses - set(web_status())
    assert {"not_linked", "too_fast"} <= statuses


# ---------- 0004 ----------
def test_0004_functions_are_safe():
    heads = {m.group(1): m.group(0) for m in
             re.finditer(r"create or replace function public\.(\w+)\(.*?\bas \$\$", MIG4, re.S)}
    assert "submit_self_rating" in heads
    revoked = re.search(r"revoke all on function(.*?)from public, anon;", MIG4, re.S).group(1)
    granted = re.search(r"grant execute on function(.*?)to authenticated;", MIG4, re.S).group(1)
    for name, head in heads.items():
        assert "security definer" in head and "set search_path = public" in head, name
        assert f"public.{name}(" in revoked and f"public.{name}(" in granted, name


def test_0004_revokes_before_granting():
    """先全部收回（含 TRUNCATE），再只給需要的權限；沒有任何地方把 TRUNCATE 或 ALL 給回去。"""
    revoke = re.search(r"revoke all on (.*?) from authenticated;", MIG4, re.S)
    assert revoke and revoke.start() < MIG4.index("grant select")
    for t in ("teams", "memberships", "players", "ability_ratings", "fixtures", "duties"):
        assert f"public.{t}" in revoke.group(1), t
    grants = re.findall(r"grant ([^;]*?) on public\.", MIG4)
    assert grants and not any("truncate" in g or "all" in g.split() for g in grants)
    assert re.search(r"grant update \(name, season, league_name\) on public\.teams", MIG4), "Team ID 不能直接改"


def test_rls_test_covers_v22():
    rls = (ROOT / "supabase" / "tests" / "rls_test.sql").read_text(encoding="utf-8")
    for label in ("球員送出自己的能力表", "連按兩次送出", "還沒認領就送出能力表", "教練直接改 Team ID", "沒登入送出能力表"):
        assert label in rls, label


# ---------- 網站不碰秘密 ----------
SERVER_ONLY_ENV = {"DISCORD_WEBHOOK_URL"}   # 只能出現在伺服器端的 app/api/**/route.ts


def test_web_uses_only_public_env():
    for p in web_sources():
        server = "api" in p.relative_to(WEB).parts and p.name == "route.ts"
        for name in re.findall(r"process\.env\.(\w+)", p.read_text(encoding="utf-8")):
            ok = name.startswith("NEXT_PUBLIC_") or name == "NODE_ENV" or (server and name in SERVER_ONLY_ENV)
            assert ok, f"{p.relative_to(WEB)} 用了 {name}"


def test_web_never_mentions_secret_keys_in_code():
    for p in web_sources():
        text = p.read_text(encoding="utf-8")
        assert "service_role" not in text and "SECRET_KEY" not in text, p


def test_web_env_files_are_ignored():
    ignore = (WEB / ".gitignore").read_text(encoding="utf-8")
    assert ".env*.local" in ignore and "node_modules" in ignore
    assert not (WEB / ".env.local").exists() or ".env*.local" in ignore
    example = (WEB / ".env.example").read_text(encoding="utf-8")
    assert "NEXT_PUBLIC_SUPABASE_URL" in example and "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" in example


def test_web_package_is_agpl_and_has_tests():
    pkg = json.loads((WEB / "package.json").read_text(encoding="utf-8"))
    assert pkg["license"].startswith("AGPL-3.0")
    assert {"dev", "build", "test", "typecheck"} <= set(pkg["scripts"])
    assert "@supabase/supabase-js" in pkg["dependencies"] and "next" in pkg["dependencies"]


def test_pages_only_export_page():
    """Next.js 的 page.tsx / layout.tsx 只能 export 預設元件（和 metadata 這類設定），多 export 會 build 失敗。"""
    allowed = {"metadata", "viewport", "dynamic", "revalidate"}
    for p in (WEB / "app").rglob("*.tsx"):
        if p.name not in {"page.tsx", "layout.tsx", "not-found.tsx"}:
            continue
        text = p.read_text(encoding="utf-8")
        named = re.findall(r"^export (?:async )?(?:function|const|let|class|type|interface) (\w+)", text, re.M)
        assert set(named) <= allowed, f"{p.relative_to(WEB)} 多 export 了 {set(named) - allowed}"
        assert "export default" in text, p
