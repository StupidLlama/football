"""v2.6 隊伍聊天室（F6）：0009 migration 的靜態檢查（不用連資料庫）。

真正的權限測試在 supabase/tests/rls_test.sql（py -m backend.scripts.rls_check）。
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("0*.sql"))
ALL_SQL = "\n".join(p.read_text(encoding="utf-8") for p in MIGRATIONS)
MIG9 = (ROOT / "supabase" / "migrations" / "0009_chat.sql").read_text(encoding="utf-8")
RLS_TEST = (ROOT / "supabase" / "tests" / "rls_test.sql").read_text(encoding="utf-8")


def _functions(sql: str) -> dict[str, str]:
    return {m.group(1): m.group(0) for m in
            re.finditer(r"create or replace function public\.(\w+)\(.*?\bas \$\$", sql, re.S)}


# ---------- 函式的安全規則 ----------
def test_0009_security_definer_functions_pin_search_path():
    for name, head in _functions(MIG9).items():
        if "security definer" in head:
            assert "set search_path = public" in head, name


def test_0009_functions_revoked_from_anon_first():
    revoked = re.search(r"revoke all on function(.*?)from public, anon;", MIG9, re.S).group(1)
    for name in _functions(MIG9):
        assert f"public.{name}(" in revoked, f"{name} 沒有先從 public、anon 收回"


def test_message_problem_and_trigger_are_not_callable():
    """小工具和觸發器只給資料庫內部用，不能直接呼叫。"""
    assert re.search(r"revoke all on function public\.message_problem\(text\), public\.notify_discord\(\)\s*from authenticated;", MIG9)
    grants = " ".join(re.findall(r"grant execute on function(.*?)to authenticated;", MIG9, re.S))
    assert "message_problem" not in grants
    assert "notify_discord" not in grants


# ---------- 資料表 ----------
def test_messages_only_written_through_functions():
    assert re.search(r"alter table public\.messages\s+enable row level security", MIG9)
    assert "revoke all on public.messages from anon, authenticated;" in MIG9
    assert re.findall(r"grant ([^;]*) on public\.messages to authenticated;", MIG9) == ["select"]
    policies = re.findall(r"create policy \w+ on public\.messages\s+for (\w+) to (\w+) using \(([^;]*)\);", MIG9)
    assert policies == [("select", "authenticated", "public.is_member(team_id)")]


def test_chat_reads_only_shows_own_row():
    assert "revoke all on public.chat_reads from anon, authenticated;" in MIG9
    assert re.findall(r"grant ([^;]*) on public\.chat_reads to authenticated;", MIG9) == ["select"]
    policies = re.findall(r"create policy \w+ on public\.chat_reads\s+for (\w+) to (\w+) using \(([^;]*)\);", MIG9)
    assert policies == [("select", "authenticated", "user_id = auth.uid()")], "只看得到自己讀到哪裡"


def test_chat_discord_has_no_rls_policy_at_all():
    """Discord 網址等於密碼：連球隊管理員都讀不到，只有資料庫函式能碰。"""
    assert re.search(r"alter table public\.chat_discord\s+enable row level security", MIG9)
    assert "revoke all on public.chat_discord from anon, authenticated;" in MIG9
    assert not re.search(r"create policy \w+ on public\.chat_discord", MIG9)


def test_chat_discord_is_in_secret_tables():
    test_v20 = (ROOT / "tests" / "test_v20.py").read_text(encoding="utf-8")
    assert "chat_discord" in re.search(r"SECRET_TABLES = \{([^}]*)\}", test_v20).group(1)


def test_messages_table_rules():
    table = re.search(r"create table public\.messages \((.*?)\n\);", MIG9, re.S).group(1)
    assert "check (parent_id is null or (kind = 'general' and pinned_at is null))" in table, "回覆沒有類型、不能置頂"
    assert "check (deleted_at is null or (body = '' and lineup_id is null and pinned_at is null))" in table, \
        "刪除後清空內容才算已刪除"
    assert "check (char_length(body) <= 2000)" in table


def test_realtime_publication_includes_messages():
    assert "alter publication supabase_realtime add table public.messages;" in MIG9


# ---------- 規則寫在函式裡 ----------
def _body(name: str) -> str:
    return re.search(rf"function public\.{name}\(.*?\nend \$\$;", MIG9, re.S).group(0)


def test_only_managers_post_note_or_tactic():
    body = _body("post_message")
    assert "if kind <> 'general' and not public.can_manage(team) then return jsonb_build_object('status', 'forbidden'); end if;" in body


def test_replies_are_one_level_and_general_only():
    body = _body("post_message")
    assert "只能回覆主貼文" in body
    assert "回覆沒有類型" in body


def test_only_official_lineups_can_be_attached():
    body = _body("post_message")
    assert "l.kind = 'official'" in body


def test_rate_limit_is_ten_per_minute():
    assert "interval '1 minute'" in _body("post_message") and ">= 10 then" in _body("post_message")


def test_edit_checks_deleted_before_ownership():
    """編輯已刪除的訊息要回 not_found，不是 forbidden（deleted_at 的檢查要排在作者檢查前面）。"""
    body = _body("edit_message")
    assert body.index("m.deleted_at is not null") < body.index("m.author_id is distinct from uid")


def test_delete_clears_content_but_keeps_row():
    body = _body("delete_message")
    assert "set body = '', lineup_id = null, pinned_at = null, deleted_at = now()" in body
    assert "m.author_id is distinct from uid and not public.can_manage(m.team_id)" in body, "作者或球隊管理員才能刪"


def test_pin_limit_is_five_and_only_top_level():
    body = _body("set_pinned")
    assert ">= 5 then" in body
    assert "m.parent_id is not null or m.deleted_at is not null" in body


def test_discord_url_validated_and_never_read_back():
    set_body = _body("set_chat_discord")
    get_body = _body("get_chat_discord")
    assert "discord\\.com|discordapp\\.com|ptb\\.discord\\.com|canary\\.discord\\.com" in set_body
    assert "public.can_manage(team)" in set_body, "只有球隊管理員能設定"
    assert "webhook_url" not in get_body, "查詢結果絕對不能帶網址"
    assert "'configured', found" in get_body


def test_only_top_level_posts_notify_discord():
    body = _body("notify_discord")
    assert "if new.parent_id is not null then return new; end if;" in body
    assert "allowed_mentions" in body and "'parse', '[]'" in body, "不能讓訊息內容真的 tag 到全頻道"


def test_privacy_functions_cover_chat():
    assert "'chat_messages', coalesce((" in _body("export_my_data")
    assert "x.author_id = uid and x.deleted_at is null" in _body("export_my_data")
    delete_body = _body("delete_my_account")
    assert "set body = '', lineup_id = null, pinned_at = null, deleted_at = now()" in delete_body
    assert "where author_id = uid and deleted_at is null;" in delete_body


def test_new_statuses_have_messages():
    status_ts = (WEB / "lib" / "status.ts").read_text(encoding="utf-8")
    accounts = (ROOT / "backend" / "accounts.py").read_text(encoding="utf-8")
    for st in set(re.findall(r"'status', '(\w+)'", MIG9)):
        assert st in status_ts, st
        assert f'"{st}"' in accounts, st


def test_discord_webhook_regex_matches_between_sql_and_ts():
    """web/lib/chat.ts 的 DISCORD_HOOK_URL_RE 要和 SQL 的檢查條件同一套規則。"""
    chat_ts = (WEB / "lib" / "chat.ts").read_text(encoding="utf-8")
    assert "discord\\.com|discordapp\\.com|ptb\\.discord\\.com|canary\\.discord\\.com" in chat_ts
    assert r"\d{5,25}" in chat_ts and r"[A-Za-z0-9_-]{20,100}" in chat_ts


def test_rls_test_covers_v26():
    for label in ("球員發主貼文", "球員發戰術", "球員發筆記", "發空白訊息", "訊息超過 2000 字", "附草稿陣容",
                  "球員直接寫訊息表", "球員直接改訊息表", "球員置頂", "球員回覆", "回覆回覆", "作者編輯自己的訊息",
                  "編輯後標記已編輯", "標記已讀", "看得到自己讀到哪裡", "直接寫已讀表", "登入的人直接呼叫訊息檢查函式",
                  "隊友看得到全隊訊息", "編輯別人的訊息", "球員刪別人的訊息", "看別人讀到哪裡", "附別隊的陣容",
                  "管理員發戰術附正式陣容", "管理員置頂", "置頂回覆", "回覆有類型", "管理員編輯別人的訊息",
                  "管理員刪任何訊息", "刪除後內容清空", "編輯已刪除的訊息", "再置頂 4 則", "置頂超過 5 則", "取消置頂",
                  "亂填 Discord 網址", "管理員設定 Discord", "管理員看得到已設定 Discord", "設定 Discord 不回傳網址",
                  "管理員讀 Discord 網址", "登入的人直接呼叫 Discord 觸發器", "回覆有 Discord 的隊伍",
                  "球員關掉 Discord", "球員查 Discord 設定", "新主貼文排進 Discord 通知、回覆不會",
                  "別隊看 A 隊的訊息", "別隊在 A 隊發文", "別隊刪 A 隊的訊息", "別隊改 A 隊的 Discord",
                  "沒登入讀訊息表", "沒登入讀已讀表", "沒登入發文", "1 分鐘內發 10 則", "1 分鐘內發太多則",
                  "發過訊息的隊友刪帳號", "下載資料包含自己的聊天訊息（被刪掉的回覆不算）", "作者刪自己的訊息",
                  "回覆已刪除的訊息", "刪帳號後訊息清空", "刪帳號後訊息沒有作者"):
        assert label in RLS_TEST, label
