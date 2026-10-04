-- ============================================================
-- v2.1 帳號系統
--   1. profiles：每個帳號的顯示名稱、是不是系統管理者
--   2. Team ID 改成隨機 8 碼（例如 K7Q4-MZP9），教練可以重設
--   3. coach_codes：教練碼（只存雜湊，可重複使用到過期，教練可作廢）
--   4. join_attempts：Team ID 輸錯 5 次 → 鎖 15 分鐘
--   5. coach_code_guard：教練碼輸錯 5 次 → 在那一隊被封鎖，直到教練（或管理者）解除
--   6. 認領：隊友選「名單上的自己」或申請新增名字，教練確認才生效
--   7. 修 v2.0 的漏洞：球員改自己的資料時，不能改隊伍、名字、背號、隊長標記
--
-- 加入、兌換、認領這些動作都寫成資料庫函式（security definer）：
-- 規則集中在資料庫，後端只負責呼叫；權限測試（rls_test.sql）可以直接測到這些規則。
-- 函式回傳 {"status": "..."}，不用 raise：輸錯的紀錄才不會跟著交易一起被復原。
-- ============================================================

-- ---------- 共用：產生隨機代碼 ----------
-- 字母表去掉容易看錯的 0 / O、1 / I / L，共 31 個字
create or replace function public.random_code(n int)
returns text
language plpgsql volatile
set search_path = public
as $$
declare
    alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    out text := '';
begin
    for i in 1..n loop
        -- gen_random_uuid() 用作業系統的安全亂數；取第一個位元組（uuid 第 0 位元組是完全隨機的）
        out := out || substr(alphabet, (get_byte(uuid_send(gen_random_uuid()), 0) % 31) + 1, 1);
    end loop;
    return out;
end $$;

-- 使用者輸入的代碼 → 統一格式（去掉空白和 -、轉大寫），比對用
create or replace function public.normalize_code(t text)
returns text
language sql immutable
set search_path = public
as $$ select upper(regexp_replace(coalesce(t, ''), '[^A-Za-z0-9]', '', 'g')) $$;

create or replace function public.new_team_code()
returns text
language plpgsql volatile
set search_path = public
as $$
declare c text;
begin
    loop
        c := public.random_code(8);
        exit when not exists (select 1 from public.teams t where public.normalize_code(t.code) = c);
    end loop;
    return substr(c, 1, 4) || '-' || substr(c, 5, 4);
end $$;

-- ---------- 1. profiles ----------
create table public.profiles (
    user_id      uuid primary key references auth.users(id) on delete cascade,
    display_name text not null default '' check (char_length(display_name) <= 40),
    is_admin     boolean not null default false,
    created_at   timestamptz not null default now()
);

-- 新帳號建立時自動建 profile；Google 登入會帶名字（raw_user_meta_data.full_name）
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
    insert into public.profiles (user_id, display_name)
    values (new.id, left(coalesce(to_jsonb(new) -> 'raw_user_meta_data' ->> 'full_name',
                                  to_jsonb(new) -> 'raw_user_meta_data' ->> 'name', ''), 40))
    on conflict (user_id) do nothing;
    return new;
end $$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- 已經存在的帳號補上 profile
insert into public.profiles (user_id) select id from auth.users on conflict do nothing;

-- ---------- 2. Team ID ----------
-- 把 v2.0 自己取的名字（例如 CSIE-2026）換成隨機代碼
update public.teams set code = public.new_team_code()
 where code !~ '^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$';
alter table public.teams alter column code set default public.new_team_code();
alter table public.teams add column code_updated_at timestamptz not null default now();
create unique index teams_code_norm_idx on public.teams (public.normalize_code(code));

-- ---------- 3. 教練碼 ----------
-- v2.0 的 team_secrets（每隊一組教練碼）從來沒用過，改用 coach_codes
drop table public.team_secrets;

create table public.coach_codes (
    id           uuid primary key default gen_random_uuid(),
    team_id      uuid not null references public.teams(id) on delete cascade,
    salt         text not null,
    code_hash    text not null,                    -- sha256(salt + 代碼)；原文只在產生時顯示一次
    hint         text not null,                    -- 代碼最後 2 碼，讓教練分辨是哪一組
    created_by   uuid references auth.users(id) on delete set null,
    created_at   timestamptz not null default now(),
    expires_at   timestamptz not null,
    revoked_at   timestamptz,
    uses         int not null default 0,
    last_used_at timestamptz
);
create index coach_codes_team_idx on public.coach_codes(team_id);

create or replace function public.hash_code(salt text, code text)
returns text
language sql immutable
set search_path = public
as $$ select encode(sha256(convert_to(salt || public.normalize_code(code), 'UTF8')), 'hex') $$;

-- ---------- 4. Team ID 嘗試紀錄（只有資料庫函式讀寫）----------
create table public.join_attempts (
    id      bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    ok      boolean not null,
    at      timestamptz not null default now()
);
create index join_attempts_user_idx on public.join_attempts(user_id, at desc);

-- ---------- 5. 教練碼輸錯的紀錄與封鎖 ----------
create table public.coach_code_guard (
    team_id    uuid not null references public.teams(id) on delete cascade,
    user_id    uuid not null references auth.users(id) on delete cascade,
    failures   int not null default 0,
    banned_at  timestamptz,                       -- 有值 = 封鎖中，教練解除才會清掉
    updated_at timestamptz not null default now(),
    primary key (team_id, user_id)
);

-- ---------- 6. 認領 ----------
alter table public.memberships
    add column claim_player_id uuid references public.players(id) on delete set null,
    add column claim_new_name  text check (char_length(claim_new_name) between 1 and 40),
    add column claim_at        timestamptz,
    add constraint memberships_one_claim check (claim_player_id is null or claim_new_name is null);
-- 名單上一個人只能連到一個帳號
create unique index memberships_player_unique on public.memberships(player_id) where player_id is not null;

-- ---------- 判斷用的函式 ----------
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$ select coalesce((select p.is_admin from public.profiles p where p.user_id = auth.uid()), false) $$;

create or replace function public.can_manage(t uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$ select public.is_coach(t) or public.is_admin() $$;

-- 兩個帳號有沒有在同一隊（看得到隊友的顯示名稱）
create or replace function public.shares_team(other uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
    select exists (select 1 from public.memberships a join public.memberships b on a.team_id = b.team_id
                   where a.user_id = auth.uid() and b.user_id = other);
$$;

-- ---------- RLS ----------
alter table public.profiles         enable row level security;
alter table public.coach_codes      enable row level security;
alter table public.join_attempts    enable row level security;
alter table public.coach_code_guard enable row level security;

revoke all on public.profiles, public.coach_codes, public.join_attempts, public.coach_code_guard from anon;
-- join_attempts：沒有任何規則 → 只有資料庫函式讀寫
revoke all on public.join_attempts from authenticated;

-- profiles：看得到自己和隊友；只能改自己的顯示名稱（is_admin 改不了）
revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
create policy profiles_select on public.profiles
    for select to authenticated using (user_id = auth.uid() or public.shares_team(user_id));
create policy profiles_update on public.profiles
    for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- coach_codes：教練看得到自己隊的代碼清單，但看不到雜湊；新增、作廢走函式
revoke all on public.coach_codes from authenticated;
grant select (id, team_id, hint, created_by, created_at, expires_at, revoked_at, uses, last_used_at)
    on public.coach_codes to authenticated;
create policy coach_codes_select on public.coach_codes
    for select to authenticated using (public.can_manage(team_id));

-- coach_code_guard：教練看得到自己隊誰被封鎖；本人看得到自己的狀態；修改走函式
revoke all on public.coach_code_guard from authenticated;
grant select on public.coach_code_guard to authenticated;
create policy coach_code_guard_select on public.coach_code_guard
    for select to authenticated using (user_id = auth.uid() or public.can_manage(team_id));

-- memberships：維持 v2.0（看得到同隊的人），加入、升級、認領都走函式

-- ---------- 7. 球員只能改自己的「自我介紹」類欄位 ----------
create or replace function public.players_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    -- 管理者身分（匯入工具、資料庫函式）和教練不受限制
    if current_user <> 'authenticated' or public.is_coach(old.team_id) then
        return new;
    end if;
    if new.team_id is distinct from old.team_id or new.name is distinct from old.name
       or new.jersey_number is distinct from old.jersey_number or new.badge is distinct from old.badge
       or new.id is distinct from old.id or new.created_at is distinct from old.created_at then
        raise exception '球員只能修改暱稱、擅長位置、慣用腳和給球隊的話' using errcode = '42501';
    end if;
    return new;
end $$;

create trigger players_guard before update on public.players
    for each row execute function public.players_guard();

-- ============================================================
-- 動作（後端 API 呼叫這些函式）
-- ============================================================

-- ---------- 加入球隊 ----------
create or replace function public.join_team(team_code text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    uid uuid := auth.uid();
    fails int;
    last_fail timestamptz;
    t record;
    added int;
begin
    if uid is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    insert into public.profiles (user_id) values (uid) on conflict do nothing;
    delete from public.join_attempts where user_id = uid and at < now() - interval '1 day';

    select count(*), max(at) into fails, last_fail from public.join_attempts
     where user_id = uid and not ok and at > now() - interval '15 minutes';
    if fails >= 5 then
        return jsonb_build_object('status', 'locked', 'until', last_fail + interval '15 minutes');
    end if;

    select id, name, season, code into t from public.teams
     where public.normalize_code(code) = public.normalize_code(team_code);
    if not found then
        insert into public.join_attempts (user_id, ok) values (uid, false);
        return jsonb_build_object('status', 'not_found', 'attempts_left', greatest(0, 4 - fails));
    end if;

    insert into public.join_attempts (user_id, ok) values (uid, true);
    insert into public.memberships (team_id, user_id) values (t.id, uid) on conflict do nothing;
    get diagnostics added = row_count;
    return jsonb_build_object('status', case when added = 1 then 'joined' else 'already_member' end,
                              'team_id', t.id, 'name', t.name, 'season', t.season);
end $$;

-- ---------- 離開球隊 ----------
create or replace function public.leave_team(team uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare r text;
begin
    select role into r from public.memberships where team_id = team and user_id = auth.uid();
    if not found then return jsonb_build_object('status', 'not_member'); end if;
    if r = 'coach' and (select count(*) from public.memberships where team_id = team and role = 'coach') = 1 then
        return jsonb_build_object('status', 'last_coach');
    end if;
    delete from public.memberships where team_id = team and user_id = auth.uid();
    return jsonb_build_object('status', 'ok');
end $$;

-- ---------- 兌換教練碼 ----------
create or replace function public.redeem_coach_code(team uuid, code text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    uid uuid := auth.uid();
    r text;
    g record;
    hit uuid;
begin
    select role into r from public.memberships where team_id = team and user_id = uid;
    if not found then return jsonb_build_object('status', 'not_member'); end if;
    if r = 'coach' then return jsonb_build_object('status', 'already_coach'); end if;

    select * into g from public.coach_code_guard where team_id = team and user_id = uid;
    if found and g.banned_at is not null then return jsonb_build_object('status', 'banned'); end if;

    select c.id into hit from public.coach_codes c
     where c.team_id = team and c.revoked_at is null and c.expires_at > now()
       and c.code_hash = public.hash_code(c.salt, code)
     limit 1;

    if hit is null then
        insert into public.coach_code_guard as cg (team_id, user_id, failures) values (team, uid, 1)
            on conflict (team_id, user_id) do update set failures = cg.failures + 1, updated_at = now()
            returning * into g;
        if g.failures >= 5 then
            update public.coach_code_guard set banned_at = now() where team_id = team and user_id = uid;
            return jsonb_build_object('status', 'banned');
        end if;
        return jsonb_build_object('status', 'wrong_code', 'attempts_left', 5 - g.failures);
    end if;

    update public.coach_codes set uses = uses + 1, last_used_at = now() where id = hit;
    update public.memberships set role = 'coach' where team_id = team and user_id = uid;
    delete from public.coach_code_guard where team_id = team and user_id = uid;
    return jsonb_build_object('status', 'ok', 'role', 'coach');
end $$;

-- ---------- 教練 / 管理者：產生、作廢教練碼 ----------
create or replace function public.create_coach_code(team uuid, valid_days int default 7)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    raw text;
    s text := gen_random_uuid()::text;
    new_id uuid;
    exp timestamptz;
begin
    if not exists (select 1 from public.teams where id = team) then
        return jsonb_build_object('status', 'not_found');
    end if;
    if not public.can_manage(team) then return jsonb_build_object('status', 'forbidden'); end if;
    if valid_days is null or valid_days not between 1 and 30 then
        return jsonb_build_object('status', 'invalid', 'detail', 'valid_days 要在 1–30 之間');
    end if;
    raw := public.random_code(10);
    insert into public.coach_codes (team_id, salt, code_hash, hint, created_by, expires_at)
    values (team, s, public.hash_code(s, raw), right(raw, 2), auth.uid(), now() + make_interval(days => valid_days))
    returning id, expires_at into new_id, exp;
    return jsonb_build_object('status', 'ok', 'id', new_id, 'expires_at', exp,
                              'code', substr(raw, 1, 5) || '-' || substr(raw, 6, 5));
end $$;

create or replace function public.revoke_coach_code(code_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare t uuid;
begin
    select team_id into t from public.coach_codes where id = code_id;
    if not found or not public.can_manage(t) then return jsonb_build_object('status', 'not_found'); end if;
    update public.coach_codes set revoked_at = coalesce(revoked_at, now()) where id = code_id;
    return jsonb_build_object('status', 'ok');
end $$;

-- ---------- 教練 / 管理者：重設 Team ID ----------
create or replace function public.reset_team_code(team uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare c text;
begin
    if not public.is_member(team) and not public.is_admin() then return jsonb_build_object('status', 'not_found'); end if;
    if not public.can_manage(team) then return jsonb_build_object('status', 'forbidden'); end if;
    c := public.new_team_code();
    update public.teams set code = c, code_updated_at = now() where id = team;
    return jsonb_build_object('status', 'ok', 'code', c);
end $$;

-- ---------- 教練 / 管理者：解除教練碼封鎖 ----------
create or replace function public.unban_coach_code(team uuid, member uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
    if not public.can_manage(team) then return jsonb_build_object('status', 'forbidden'); end if;
    delete from public.coach_code_guard where team_id = team and user_id = member;
    return jsonb_build_object('status', case when found then 'ok' else 'not_found' end);
end $$;

-- ---------- 教練 / 管理者：移出成員（教練只能移出球員，教練要由管理者處理）----------
create or replace function public.remove_member(team uuid, member uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare r text;
begin
    if not public.can_manage(team) then return jsonb_build_object('status', 'forbidden'); end if;
    select role into r from public.memberships where team_id = team and user_id = member;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    if member = auth.uid() then return jsonb_build_object('status', 'invalid', 'detail', '要離開球隊請用「離開球隊」'); end if;
    if r = 'coach' and not public.is_admin() then return jsonb_build_object('status', 'forbidden'); end if;
    delete from public.memberships where team_id = team and user_id = member;
    return jsonb_build_object('status', 'ok');
end $$;

-- ---------- 管理者：取消教練身分 ----------
create or replace function public.demote_coach(team uuid, member uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
    if not public.is_admin() then return jsonb_build_object('status', 'forbidden'); end if;
    update public.memberships set role = 'player' where team_id = team and user_id = member and role = 'coach';
    return jsonb_build_object('status', case when found then 'ok' else 'not_found' end);
end $$;

-- ---------- 管理者：建立隊伍（同時產生第一組教練碼）----------
create or replace function public.admin_create_team(team_name text, season text default null,
                                                    league_name text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    t record;
    c jsonb;
begin
    if not public.is_admin() then return jsonb_build_object('status', 'forbidden'); end if;
    if coalesce(trim(team_name), '') = '' then return jsonb_build_object('status', 'invalid', 'detail', '隊伍名稱不能空白'); end if;
    insert into public.teams (name, season, league_name) values (trim(team_name), season, league_name)
    returning id, code into t;
    c := public.create_coach_code(t.id, 7);
    return jsonb_build_object('status', 'ok', 'team_id', t.id, 'code', t.code, 'coach_code', c -> 'code',
                              'coach_code_expires_at', c -> 'expires_at');
end $$;

-- ---------- 認領：選名單上的自己，或申請新增名字 ----------
create or replace function public.request_claim(team uuid, player uuid default null, new_name text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare m record;
begin
    select * into m from public.memberships where team_id = team and user_id = auth.uid();
    if not found then return jsonb_build_object('status', 'not_member'); end if;
    if m.player_id is not null then return jsonb_build_object('status', 'already_linked'); end if;
    if (player is null) = (coalesce(trim(new_name), '') = '') then
        return jsonb_build_object('status', 'invalid', 'detail', '選一位球員，或填一個新名字（二選一）');
    end if;
    if player is not null then
        if not exists (select 1 from public.players p where p.id = player and p.team_id = team) then
            return jsonb_build_object('status', 'not_found');
        end if;
        if exists (select 1 from public.memberships x where x.player_id = player) then
            return jsonb_build_object('status', 'taken');
        end if;
    elsif char_length(trim(new_name)) > 40 then
        return jsonb_build_object('status', 'invalid', 'detail', '名字最多 40 字');
    end if;
    update public.memberships
       set claim_player_id = player, claim_new_name = nullif(trim(coalesce(new_name, '')), ''), claim_at = now()
     where team_id = team and user_id = auth.uid();
    return jsonb_build_object('status', 'ok');
end $$;

-- ---------- 教練 / 管理者：確認或拒絕認領 ----------
create or replace function public.decide_claim(team uuid, member uuid, approve boolean)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    m record;
    pid uuid;
begin
    if not public.can_manage(team) then return jsonb_build_object('status', 'forbidden'); end if;
    select * into m from public.memberships where team_id = team and user_id = member;
    if not found or (m.claim_player_id is null and m.claim_new_name is null) then
        return jsonb_build_object('status', 'not_found');
    end if;
    if approve then
        if m.claim_player_id is not null then
            if exists (select 1 from public.memberships x where x.player_id = m.claim_player_id) then
                return jsonb_build_object('status', 'taken');
            end if;
            pid := m.claim_player_id;
        else
            if exists (select 1 from public.players p where p.team_id = team and p.name = m.claim_new_name) then
                return jsonb_build_object('status', 'taken');
            end if;
            insert into public.players (team_id, name) values (team, m.claim_new_name) returning id into pid;
        end if;
    end if;
    update public.memberships
       set player_id = coalesce(pid, player_id), claim_player_id = null, claim_new_name = null, claim_at = null
     where team_id = team and user_id = member;
    return jsonb_build_object('status', 'ok', 'player_id', pid);
end $$;

-- ---------- 權限：函式只給登入的人呼叫 ----------
revoke all on function
    public.random_code(int), public.new_team_code(), public.handle_new_user(), public.players_guard(),
    public.is_admin(), public.can_manage(uuid), public.shares_team(uuid),
    public.join_team(text), public.leave_team(uuid), public.redeem_coach_code(uuid, text),
    public.create_coach_code(uuid, int), public.revoke_coach_code(uuid), public.reset_team_code(uuid),
    public.unban_coach_code(uuid, uuid), public.remove_member(uuid, uuid), public.demote_coach(uuid, uuid),
    public.admin_create_team(text, text, text), public.request_claim(uuid, uuid, text),
    public.decide_claim(uuid, uuid, boolean)
from public, anon;

grant execute on function
    public.is_admin(), public.can_manage(uuid), public.shares_team(uuid),
    public.join_team(text), public.leave_team(uuid), public.redeem_coach_code(uuid, text),
    public.create_coach_code(uuid, int), public.revoke_coach_code(uuid), public.reset_team_code(uuid),
    public.unban_coach_code(uuid, uuid), public.remove_member(uuid, uuid), public.demote_coach(uuid, uuid),
    public.admin_create_team(text, text, text), public.request_claim(uuid, uuid, text),
    public.decide_claim(uuid, uuid, boolean)
to authenticated;
