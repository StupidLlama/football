-- ============================================================
-- v2.3 球員生涯
--   一個帳號可以在很多隊（每個賽季通常是一個 Team ID）。球員可以自己決定把哪幾隊「放進生涯」，
--   現在的隊友就能在他的球員報告看到那幾隊的能力紀錄，串成一條生涯。
--   1. memberships.career_shared：這一隊有沒有放進生涯（預設不放，只有本人能開關）
--   2. set_career_shared(team, shared)：本人開關
--   3. get_career(team, player)：在 team 裡看 player 的生涯
--      - 看的人要是 team 的成員，player 要是 team 名單上、已經連結帳號的人
--      - 別人只拿得到「已放進生涯」的隊伍＋這一隊；本人拿得到自己所有的隊伍（附開關狀態）
--      - 只回傳生涯需要的欄位：隊名、賽季、背號、隊長標記、擅長位置、能力表歷史；不回傳別隊的名單和其他人
--   4. export_my_data 加上 career_shared
--
-- 規則：已經執行過的檔案不要改；要改就新增 0007_xxx.sql。
-- ============================================================

-- ---------- 1. 放進生涯的開關 ----------
alter table public.memberships
    add column career_shared boolean not null default false;
-- memberships 只有 select 權限（0004），開關要走下面的函式

-- ---------- 2. 本人開關 ----------
create or replace function public.set_career_shared(team uuid, shared boolean)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare m record;
begin
    if auth.uid() is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    if shared is null then return jsonb_build_object('status', 'invalid', 'detail', '開關只能是開或關'); end if;
    select * into m from public.memberships where team_id = team and user_id = auth.uid();
    if not found then return jsonb_build_object('status', 'not_member'); end if;
    if m.player_id is null then return jsonb_build_object('status', 'not_linked'); end if;
    update public.memberships set career_shared = shared where team_id = team and user_id = auth.uid();
    return jsonb_build_object('status', 'ok', 'shared', shared);
end $$;

-- ---------- 3. 看某位球員的生涯 ----------
create or replace function public.get_career(team uuid, player uuid)
returns jsonb
language plpgsql security definer stable
set search_path = public
as $$
declare
    uid uuid := auth.uid();
    owner uuid;
    is_self boolean;
begin
    if uid is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    if not exists (select 1 from public.memberships where team_id = team and user_id = uid) then
        return jsonb_build_object('status', 'not_member');
    end if;
    if not exists (select 1 from public.players where id = player and team_id = team) then
        return jsonb_build_object('status', 'not_found');
    end if;
    select user_id into owner from public.memberships where team_id = team and player_id = player limit 1;
    if owner is null then
        -- 名單上的名字還沒被認領：生涯只有這一隊
        return jsonb_build_object('status', 'ok', 'self', false, 'linked', false, 'entries', '[]'::jsonb);
    end if;
    is_self := owner = uid;

    return jsonb_build_object(
        'status', 'ok',
        'self', is_self,
        'linked', true,
        'entries', coalesce((
            select jsonb_agg(jsonb_build_object(
                'team_id', t.id,
                'team_name', t.name,
                'season', t.season,
                'current', t.id = team,
                'shared', m.career_shared,
                'joined_at', m.joined_at,
                'jersey_number', pl.jersey_number,
                'badge', pl.badge,
                'good_positions', pl.good_positions,
                'ratings', coalesce((
                    select jsonb_agg(jsonb_build_object('scores', r.scores, 'submitted_at', r.submitted_at)
                                     order by r.submitted_at)
                      from public.ability_ratings r where r.player_id = pl.id), '[]'::jsonb)
            ) order by coalesce(t.season, ''), m.joined_at)
              from public.memberships m
              join public.teams t on t.id = m.team_id
              join public.players pl on pl.id = m.player_id
             where m.user_id = owner
               and m.player_id is not null
               and (is_self or m.team_id = team or m.career_shared)), '[]'::jsonb)
    );
end $$;

-- ---------- 4. 下載我的資料：加上生涯開關 ----------
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
        'contact_messages', coalesce((
            select jsonb_agg(jsonb_build_object('category', c.category, 'body', c.body, 'created_at', c.created_at)
                             order by c.created_at)
              from public.contact_messages c where c.user_id = uid), '[]'::jsonb)
    );
end $$;

-- ---------- 權限：函式只給登入的人呼叫 ----------
revoke all on function public.set_career_shared(uuid, boolean) from public, anon;
revoke all on function public.get_career(uuid, uuid) from public, anon;
revoke all on function public.export_my_data() from public, anon;

grant execute on function public.set_career_shared(uuid, boolean) to authenticated;
grant execute on function public.get_career(uuid, uuid) to authenticated;
grant execute on function public.export_my_data() to authenticated;
