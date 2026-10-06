-- ============================================================
-- v2.4 組隊（F3）：存陣容、分享只能看的連結
--   1. lineups：一組陣容（賽制、陣型、每個位置的球員、鎖定的位置、今天誰會來）
--      - 正式陣容（official）：全隊看得到，只有球隊管理員能存、改、刪、分享
--      - 草稿（draft）：只有自己看得到、自己能改；每位隊員都能存
--   2. save_lineup / delete_lineup：存、刪（資料表不開放直接寫入，全部走函式檢查）
--   3. set_lineup_share：開啟／關閉／重發分享連結，選擇要不要顯示名字（預設不顯示）
--   4. get_shared_lineup(token)：**唯一開放給沒登入的人（anon）的函式**
--      只回傳畫陣容圖需要的東西：隊名、賽季、陣容名稱、賽制、陣型、每個位置的背號
--      （有勾「顯示名字」才加名字）。不回傳球員 id、能力分數、替補、誰排的。
--      草稿的主人離隊或刪帳號後，連結自動失效。
--   5. export_my_data 加上自己存的陣容；delete_my_account 刪掉自己的草稿
--
-- 規則：已經執行過的檔案不要改；要改就新增 0008_xxx.sql。
-- ============================================================

-- ---------- 1. 陣容 ----------
create table public.lineups (
    id          uuid primary key default gen_random_uuid(),
    team_id     uuid not null references public.teams(id) on delete cascade,
    owner_id    uuid references auth.users(id) on delete set null,   -- 誰存的（正式陣容的管理員刪帳號後留著）
    kind        text not null check (kind in ('official', 'draft')),
    name        text not null default '' check (char_length(name) <= 40),
    size        int  not null check (size in (8, 11)),
    formation   text not null check (formation ~ '^[0-9](-[0-9]){1,4}$'),
    picks       jsonb not null default '{}' check (jsonb_typeof(picks) = 'object'),   -- {位置 code: 球員 id 或 null}
    locked      text[] not null default '{}',                                        -- 鎖定的位置 code
    attending   uuid[] not null default '{}',                                        -- 今天誰會來（v2.5 改接出賽登記）
    share_token text unique check (share_token ~ '^[A-Za-z0-9_-]{32}$'),            -- null = 沒有分享
    share_names boolean not null default false,                                     -- 分享頁和圖片要不要顯示名字
    shared_at   timestamptz,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index lineups_team_idx on public.lineups(team_id, kind, updated_at desc);
create index lineups_owner_idx on public.lineups(owner_id);

alter table public.lineups enable row level security;
revoke all on public.lineups from anon, authenticated;
grant select on public.lineups to authenticated;     -- 寫入只能透過下面的函式

-- 正式陣容全隊看得到；草稿只有自己看得到（而且要還在這一隊）
create policy lineups_select on public.lineups
    for select to authenticated
    using (public.is_member(team_id) and (kind = 'official' or owner_id = auth.uid()));

-- ---------- 小工具：檢查陣容內容（只給下面的函式用）----------
create or replace function public.lineup_problem(team uuid, size int, formation text, picks jsonb,
                                                 locked text[], attending uuid[], name text)
returns text
language plpgsql security definer stable
set search_path = public
as $$
declare
    k text;
    v jsonb;
    ids uuid[] := '{}';
begin
    if size is null or size not in (8, 11) then return '賽制只能是 8 人或 11 人'; end if;
    if formation is null or formation !~ '^[0-9](-[0-9]){1,4}$' then return '陣型格式不對'; end if;
    if name is not null and char_length(name) > 40 then return '陣容名稱最多 40 個字'; end if;
    if picks is null or jsonb_typeof(picks) <> 'object' then return '陣容格式不對'; end if;
    if (select count(*) from jsonb_object_keys(picks)) > size then return '位置比賽制的人數多'; end if;
    for k, v in select * from jsonb_each(picks) loop
        if k !~ '^[A-Z]{1,4}$' then return '位置名稱不對'; end if;
        if jsonb_typeof(v) = 'null' then continue; end if;
        if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
            return '球員格式不對';
        end if;
        ids := ids || (v #>> '{}')::uuid;
    end loop;
    if cardinality(ids) <> (select count(distinct x) from unnest(ids) x) then return '同一位球員不能放在兩個位置'; end if;
    if exists (select 1 from unnest(ids) x where not exists (select 1 from public.players p where p.id = x and p.team_id = team)) then
        return '有球員不在這一隊';
    end if;
    if locked is not null and exists (select 1 from unnest(locked) c where not picks ? c) then return '鎖定的位置不在陣型裡'; end if;
    if attending is not null then
        if cardinality(attending) > 80 then return '出賽名單太長'; end if;
        if exists (select 1 from unnest(attending) x where not exists (select 1 from public.players p where p.id = x and p.team_id = team)) then
            return '出賽名單有不在這一隊的人';
        end if;
    end if;
    return null;
end $$;

-- 能不能改這組陣容：正式陣容要球隊管理員，草稿要是自己的
create or replace function public.can_edit_lineup(l public.lineups)
returns boolean
language sql stable security definer
set search_path = public
as $$
    select case when l.kind = 'official' then public.can_manage(l.team_id)
                else l.owner_id = auth.uid() and public.is_member(l.team_id) end
$$;

-- ---------- 2. 存、刪 ----------
create or replace function public.save_lineup(team uuid, lineup uuid default null, kind text default 'draft',
                                              name text default '', size int default 11, formation text default '',
                                              picks jsonb default '{}', locked text[] default '{}',
                                              attending uuid[] default '{}')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    uid uuid := auth.uid();
    l public.lineups;
    problem text;
    new_id uuid;
begin
    if uid is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    if not public.is_member(team) and not public.is_admin() then return jsonb_build_object('status', 'not_member'); end if;
    if kind is null or kind not in ('official', 'draft') then
        return jsonb_build_object('status', 'invalid', 'detail', '陣容種類不對');
    end if;
    problem := public.lineup_problem(team, size, formation, picks, locked, attending, name);
    if problem is not null then return jsonb_build_object('status', 'invalid', 'detail', problem); end if;

    if lineup is null then
        if kind = 'official' and not public.can_manage(team) then return jsonb_build_object('status', 'forbidden'); end if;
        if kind = 'draft' and not public.is_member(team) then return jsonb_build_object('status', 'not_member'); end if;
        -- 防止灌爆：每人每隊最多 20 組草稿、每隊最多 50 組正式陣容
        if (kind = 'draft' and (select count(*) from public.lineups x
                                 where x.team_id = team and x.owner_id = uid and x.kind = 'draft') >= 20)
           or (kind = 'official' and (select count(*) from public.lineups x
                                       where x.team_id = team and x.kind = 'official') >= 50) then
            return jsonb_build_object('status', 'too_many');
        end if;
        insert into public.lineups (team_id, owner_id, kind, name, size, formation, picks, locked, attending)
        values (team, uid, kind, coalesce(btrim(name), ''), size, formation, picks,
                coalesce(locked, '{}'), coalesce(attending, '{}'))
        returning id into new_id;
        return jsonb_build_object('status', 'ok', 'id', new_id);
    end if;

    select * into l from public.lineups x where x.id = lineup and x.team_id = team;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    if not public.can_edit_lineup(l) then return jsonb_build_object('status', 'forbidden'); end if;
    if l.kind <> kind then return jsonb_build_object('status', 'invalid', 'detail', '不能把草稿直接改成正式陣容，請另存一份'); end if;
    update public.lineups x
       set name = coalesce(btrim(save_lineup.name), ''), size = save_lineup.size, formation = save_lineup.formation,
           picks = save_lineup.picks, locked = coalesce(save_lineup.locked, '{}'),
           attending = coalesce(save_lineup.attending, '{}'), updated_at = now()
     where x.id = lineup;
    return jsonb_build_object('status', 'ok', 'id', lineup);
end $$;

create or replace function public.delete_lineup(lineup uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare l public.lineups;
begin
    if auth.uid() is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    select * into l from public.lineups where id = lineup;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    if not public.can_edit_lineup(l) then return jsonb_build_object('status', 'forbidden'); end if;
    delete from public.lineups where id = lineup;
    return jsonb_build_object('status', 'ok');
end $$;

-- ---------- 3. 分享連結 ----------
-- 分享碼 = 32 碼網址安全字元，用兩個 gen_random_uuid()（作業系統的安全亂數）組成，猜不到
create or replace function public.new_share_token()
returns text
language sql volatile
set search_path = public
as $$
    select substr(translate(encode(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()), 'base64'),
                            '+/=', '-_'), 1, 32)
$$;

create or replace function public.set_lineup_share(lineup uuid, shared boolean, show_names boolean default false,
                                                   renew boolean default false)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    l public.lineups;
    tok text;
begin
    if auth.uid() is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    if shared is null then return jsonb_build_object('status', 'invalid', 'detail', '開關只能是開或關'); end if;
    select * into l from public.lineups where id = lineup;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    if not public.can_edit_lineup(l) then return jsonb_build_object('status', 'forbidden'); end if;
    if not shared then
        update public.lineups set share_token = null, share_names = false, shared_at = null where id = lineup;
        return jsonb_build_object('status', 'ok', 'token', null);
    end if;
    -- 重發 = 換一個新的分享碼，舊連結立刻失效
    tok := case when l.share_token is null or coalesce(renew, false) then public.new_share_token() else l.share_token end;
    update public.lineups
       set share_token = tok, share_names = coalesce(show_names, false),
           shared_at = case when tok is distinct from l.share_token then now() else l.shared_at end
     where id = lineup;
    return jsonb_build_object('status', 'ok', 'token', tok, 'show_names', coalesce(show_names, false));
end $$;

-- ---------- 4. 用分享碼看陣容（不用登入）----------
create or replace function public.get_shared_lineup(token text)
returns jsonb
language plpgsql security definer stable
set search_path = public
as $$
declare
    l public.lineups;
    t public.teams;
begin
    if token is null or token !~ '^[A-Za-z0-9_-]{32}$' then return jsonb_build_object('status', 'not_found'); end if;
    select * into l from public.lineups x where x.share_token = token;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    -- 草稿的主人離隊或刪帳號：連結失效
    if l.kind = 'draft' and (l.owner_id is null or not exists (
            select 1 from public.memberships m where m.team_id = l.team_id and m.user_id = l.owner_id)) then
        return jsonb_build_object('status', 'not_found');
    end if;
    select * into t from public.teams where id = l.team_id;
    return jsonb_build_object(
        'status', 'ok',
        'team_name', t.name,
        'season', t.season,
        'name', l.name,
        'size', l.size,
        'formation', l.formation,
        'show_names', l.share_names,
        'updated_at', l.updated_at,
        'slots', coalesce((
            select jsonb_object_agg(e.key, case when p.id is null then null else
                       jsonb_build_object('number', p.jersey_number,
                                          'name', case when l.share_names then p.name end) end)
              from jsonb_each(l.picks) e
              left join public.players p
                on jsonb_typeof(e.value) = 'string' and p.id = (e.value #>> '{}')::uuid and p.team_id = l.team_id),
            '{}'::jsonb)
    );
end $$;

-- ---------- 5. 下載我的資料：加上自己存的陣容 ----------
create or replace function public.export_my_data()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
    if uid is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    return jsonb_build_object(
        'status', 'ok',
        'exported_at', now(),
        'account', (select jsonb_build_object('id', u.id, 'email', u.email) from auth.users u where u.id = uid),
        'profile', (select to_jsonb(p) from public.profiles p where p.user_id = uid),
        'teams', coalesce((
            select jsonb_agg(jsonb_build_object(
                'team', jsonb_build_object('id', t.id, 'name', t.name, 'season', t.season),
                'role', m.role, 'joined_at', m.joined_at, 'career_shared', m.career_shared,
                'player', (select to_jsonb(pl) - 'team_id' from public.players pl where pl.id = m.player_id),
                'ability_ratings', coalesce((
                    select jsonb_agg(jsonb_build_object('scores', r.scores, 'source', r.source, 'submitted_at', r.submitted_at)
                                     order by r.submitted_at)
                      from public.ability_ratings r where r.player_id = m.player_id), '[]'::jsonb)
            ) order by m.joined_at)
              from public.memberships m join public.teams t on t.id = m.team_id
             where m.user_id = uid), '[]'::jsonb),
        'lineups', coalesce((
            select jsonb_agg(jsonb_build_object(
                'team_id', x.team_id, 'kind', x.kind, 'name', x.name, 'size', x.size, 'formation', x.formation,
                'picks', x.picks, 'locked', x.locked, 'attending', x.attending,
                'shared', x.share_token is not null, 'share_names', x.share_names,
                'created_at', x.created_at, 'updated_at', x.updated_at) order by x.created_at)
              from public.lineups x where x.owner_id = uid), '[]'::jsonb),
        'contact_messages', coalesce((
            select jsonb_agg(jsonb_build_object('category', c.category, 'body', c.body, 'created_at', c.created_at)
                             order by c.created_at)
              from public.contact_messages c where c.user_id = uid), '[]'::jsonb)
    );
end $$;

-- ---------- 5. 刪除帳號：草稿一起刪（正式陣容是全隊的，留著）----------
create or replace function public.delete_my_account()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    uid uuid := auth.uid();
    pids uuid[];
begin
    if uid is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    select coalesce(array_agg(player_id), '{}') into pids
      from public.memberships where user_id = uid and player_id is not null;
    delete from public.ability_ratings where player_id = any(pids);
    update public.players
       set nickname = '', message = '', good_positions = '{}', bad_positions = '{}', weak_side = ''
     where id = any(pids);
    delete from public.lineups where owner_id = uid and kind = 'draft';
    -- 刪掉登入帳號：profiles、memberships、封鎖紀錄、Team ID 嘗試紀錄跟著刪（外鍵 on delete cascade），
    -- 名單上的球員因為 memberships 不見了，自然變成「沒有連結帳號」；正式陣容的 owner_id 變成空的
    delete from auth.users where id = uid;
    return jsonb_build_object('status', 'ok', 'players_unlinked', cardinality(pids));
end $$;

-- ---------- 權限 ----------
-- 先全部從 public、anon 收回
revoke all on function
    public.lineup_problem(uuid, int, text, jsonb, text[], uuid[], text), public.can_edit_lineup(public.lineups),
    public.save_lineup(uuid, uuid, text, text, int, text, jsonb, text[], uuid[]), public.delete_lineup(uuid),
    public.new_share_token(), public.set_lineup_share(uuid, boolean, boolean, boolean),
    public.get_shared_lineup(text), public.export_my_data(), public.delete_my_account()
from public, anon;
-- 小工具只給函式內部用，登入的人也不能直接呼叫
revoke all on function public.lineup_problem(uuid, int, text, jsonb, text[], uuid[], text),
                       public.can_edit_lineup(public.lineups), public.new_share_token() from authenticated;

grant execute on function
    public.save_lineup(uuid, uuid, text, text, int, text, jsonb, text[], uuid[]), public.delete_lineup(uuid),
    public.set_lineup_share(uuid, boolean, boolean, boolean),
    public.export_my_data(), public.delete_my_account()
to authenticated;

-- 唯一的例外：分享頁不用登入（tests/test_v24.py 檢查全部 migration 只有這一個函式給 anon）
grant execute on function public.get_shared_lineup(text) to anon, authenticated;
