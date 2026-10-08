-- ============================================================
-- v2.5 比賽列表＋出賽登記（F7）
--   1. matches：球隊自己的一場比賽（對手、開賽時間、集合時間、地點、球衣顏色、賽制、備註、比分）
--      - 跟 fixtures（系際聯賽賽程表，整個聯賽的場次）是兩件事；從聯賽賽程建立的比賽用 fixture_id 連過去
--      - 狀態不存欄位：開賽前 = 即將進行；過了開賽時間或填了比分 = 已結束（web/lib/matches.ts 算）
--   2. attendance：球員對一場比賽的回覆（出席 in / 請假 out）；沒有資料 = 還沒回覆
--   3. save_match / delete_match / match_from_fixture：只有球隊管理員
--   4. set_attendance：球員登記自己（要先認領名單上的自己），開賽後鎖住；球隊管理員可以幫任何人登記、隨時更正
--   5. lineups 加 match_id：陣容可以綁定一場比賽，綁定後只能排「出席」的人、賽制要跟比賽一樣
--   6. get_shared_lineup 多回傳「對手、開賽時間」（不是個資）；export_my_data / delete_my_account 加上出席紀錄
--
-- 規則：已經執行過的檔案不要改；要改就新增 0009_xxx.sql。
-- ============================================================

-- ---------- 1. 比賽 ----------
create table public.matches (
    id          uuid primary key default gen_random_uuid(),
    team_id     uuid not null references public.teams(id) on delete cascade,
    opponent    text not null check (char_length(btrim(opponent)) between 1 and 40),
    kickoff     timestamptz not null,                                   -- 開賽時間
    meet_at     timestamptz,                                            -- 集合／熱身時間（選填）
    location    text not null default '' check (char_length(location) <= 60),
    jersey      text not null default '' check (char_length(jersey) <= 20),   -- 球衣顏色，例如「白」「深藍」
    size        int  not null default 11 check (size in (8, 11)),
    note        text not null default '' check (char_length(note) <= 200),
    our_score   int  check (our_score between 0 and 99),
    their_score int  check (their_score between 0 and 99),
    fixture_id  uuid references public.fixtures(id) on delete set null,     -- 從聯賽賽程建立的才有
    created_by  uuid references auth.users(id) on delete set null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    check ((our_score is null) = (their_score is null)),
    check (meet_at is null or meet_at <= kickoff)
);
create index matches_team_idx on public.matches(team_id, kickoff);
create unique index matches_fixture_unique on public.matches(fixture_id) where fixture_id is not null;

alter table public.matches enable row level security;
revoke all on public.matches from anon, authenticated;
grant select on public.matches to authenticated;      -- 寫入只能透過下面的函式

create policy matches_select on public.matches
    for select to authenticated using (public.is_member(team_id));

-- ---------- 2. 出賽登記 ----------
create table public.attendance (
    match_id   uuid not null references public.matches(id) on delete cascade,
    player_id  uuid not null references public.players(id) on delete cascade,
    team_id    uuid not null references public.teams(id) on delete cascade,   -- 跟 matches 一樣，給 RLS 用
    status     text not null check (status in ('in', 'out')),
    note       text not null default '' check (char_length(note) <= 40),     -- 例如「會晚到」，全隊看得到
    updated_by uuid references auth.users(id) on delete set null,
    updated_at timestamptz not null default now(),
    primary key (match_id, player_id)
);
create index attendance_team_idx on public.attendance(team_id);
create index attendance_player_idx on public.attendance(player_id);

alter table public.attendance enable row level security;
revoke all on public.attendance from anon, authenticated;
grant select on public.attendance to authenticated;   -- 寫入只能透過 set_attendance

-- 全隊看得到彼此的登記（取代群組接龍，本來就是要讓大家看到）
create policy attendance_select on public.attendance
    for select to authenticated using (public.is_member(team_id));

-- ---------- 3. 陣容綁定比賽 ----------
alter table public.lineups
    add column match_id uuid references public.matches(id) on delete set null;   -- 比賽刪掉 → 陣容變回不綁定
create index lineups_match_idx on public.lineups(match_id) where match_id is not null;

-- ---------- 小工具：檢查比賽內容（只給下面的函式用）----------
create or replace function public.match_problem(opponent text, kickoff timestamptz, meet_at timestamptz,
                                                location text, jersey text, size int, note text,
                                                our_score int, their_score int)
returns text
language plpgsql immutable
set search_path = public
as $$
begin
    if opponent is null or char_length(btrim(opponent)) = 0 then return '請填對手'; end if;
    if char_length(btrim(opponent)) > 40 then return '對手名稱最多 40 個字'; end if;
    if kickoff is null then return '請填開賽時間'; end if;
    if meet_at is not null and meet_at > kickoff then return '集合時間要在開賽之前'; end if;
    if meet_at is not null and kickoff - meet_at > interval '12 hours' then return '集合時間離開賽太久了'; end if;
    if char_length(coalesce(location, '')) > 60 then return '地點最多 60 個字'; end if;
    if char_length(coalesce(jersey, '')) > 20 then return '球衣顏色最多 20 個字'; end if;
    if size is null or size not in (8, 11) then return '賽制只能是 8 人或 11 人'; end if;
    if char_length(coalesce(note, '')) > 200 then return '備註最多 200 個字'; end if;
    if (our_score is null) <> (their_score is null) then return '比分要兩邊都填，或兩邊都不填'; end if;
    if our_score is not null and (our_score not between 0 and 99 or their_score not between 0 and 99) then
        return '比分要是 0–99';
    end if;
    return null;
end $$;

-- ---------- 4. 建立、修改、刪除比賽（球隊管理員）----------
create or replace function public.save_match(team uuid, match uuid default null, opponent text default '',
                                             kickoff timestamptz default null, meet_at timestamptz default null,
                                             location text default '', jersey text default '', size int default 11,
                                             note text default '', our_score int default null,
                                             their_score int default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    uid uuid := auth.uid();
    m public.matches;
    problem text;
    new_id uuid;
begin
    if uid is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    if not public.is_member(team) and not public.is_admin() then return jsonb_build_object('status', 'not_member'); end if;
    if not public.can_manage(team) then return jsonb_build_object('status', 'forbidden'); end if;
    problem := public.match_problem(opponent, kickoff, meet_at, location, jersey, size, note, our_score, their_score);
    if problem is not null then return jsonb_build_object('status', 'invalid', 'detail', problem); end if;

    if match is null then
        -- 防止灌爆：每隊最多 300 場
        if (select count(*) from public.matches x where x.team_id = team) >= 300 then
            return jsonb_build_object('status', 'too_many');
        end if;
        insert into public.matches (team_id, opponent, kickoff, meet_at, location, jersey, size, note,
                                    our_score, their_score, created_by)
        values (team, btrim(opponent), kickoff, meet_at, btrim(coalesce(location, '')), btrim(coalesce(jersey, '')),
                size, btrim(coalesce(note, '')), our_score, their_score, uid)
        returning id into new_id;
        return jsonb_build_object('status', 'ok', 'id', new_id);
    end if;

    select * into m from public.matches x where x.id = save_match.match and x.team_id = team;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    -- 已經有陣容綁這場比賽時，不能改賽制（陣容的人數會對不上）
    if m.size <> save_match.size and exists (select 1 from public.lineups l where l.match_id = m.id) then
        return jsonb_build_object('status', 'invalid', 'detail', '這場比賽已經有排好的陣容，不能改賽制；請先刪掉或解除綁定那些陣容');
    end if;
    update public.matches x
       set opponent = btrim(save_match.opponent), kickoff = save_match.kickoff, meet_at = save_match.meet_at,
           location = btrim(coalesce(save_match.location, '')), jersey = btrim(coalesce(save_match.jersey, '')),
           size = save_match.size, note = btrim(coalesce(save_match.note, '')),
           our_score = save_match.our_score, their_score = save_match.their_score, updated_at = now()
     where x.id = m.id;
    return jsonb_build_object('status', 'ok', 'id', m.id);
end $$;

create or replace function public.delete_match(match uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare m public.matches;
begin
    if auth.uid() is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    select * into m from public.matches x where x.id = delete_match.match;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    if not public.can_manage(m.team_id) then return jsonb_build_object('status', 'forbidden'); end if;
    -- 出席紀錄跟著刪（on delete cascade）；綁這場的陣容留著、變回不綁定（on delete set null）
    delete from public.matches x where x.id = m.id;
    return jsonb_build_object('status', 'ok');
end $$;

-- 從聯賽賽程一鍵建立：對手 = 不是我們的那一隊（teams.league_name），時間 = 那天的開賽時間（台灣時間）
-- 同一場聯賽只會建立一次；已經建過就回傳那一場的 id（status = 'ok'，existed = true）
create or replace function public.match_from_fixture(team uuid, fixture uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    uid uuid := auth.uid();
    f public.fixtures;
    t public.teams;
    us text;
    opp text;
    ours int;
    theirs int;
    existing uuid;
    new_id uuid;
begin
    if uid is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    if not public.is_member(team) and not public.is_admin() then return jsonb_build_object('status', 'not_member'); end if;
    if not public.can_manage(team) then return jsonb_build_object('status', 'forbidden'); end if;
    select * into f from public.fixtures x where x.id = match_from_fixture.fixture and x.team_id = team;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    select x.id into existing from public.matches x where x.fixture_id = f.id;
    if found then return jsonb_build_object('status', 'ok', 'id', existing, 'existed', true); end if;

    select * into t from public.teams x where x.id = team;
    us := btrim(coalesce(t.league_name, ''));
    if us = '' then
        return jsonb_build_object('status', 'invalid', 'detail', '這一隊還沒設定聯賽隊名，分不出哪一邊是我們');
    end if;
    if btrim(f.home) = us then opp := f.away; ours := f.home_score; theirs := f.away_score;
    elsif btrim(f.away) = us then opp := f.home; ours := f.away_score; theirs := f.home_score;
    else return jsonb_build_object('status', 'invalid', 'detail', '這場聯賽沒有我們的隊伍');
    end if;
    if f.start_time is null then
        return jsonb_build_object('status', 'invalid', 'detail', '這場聯賽沒有開賽時間，請手動新增比賽');
    end if;
    if (select count(*) from public.matches x where x.team_id = team) >= 300 then
        return jsonb_build_object('status', 'too_many');
    end if;

    insert into public.matches (team_id, opponent, kickoff, size, our_score, their_score, fixture_id, created_by,
                                note)
    values (team, left(btrim(opp), 40), (f.day + f.start_time) at time zone 'Asia/Taipei', 11, ours, theirs, f.id, uid,
            case when f.round is not null then '系際聯賽第 ' || f.round || ' 輪' else '系際聯賽' end)
    returning id into new_id;
    return jsonb_build_object('status', 'ok', 'id', new_id, 'existed', false);
end $$;

-- ---------- 5. 出賽登記 ----------
-- answer：'in' 出席、'out' 請假、null 清掉（變回還沒回覆）
-- player 不填 = 登記自己（要先認領名單上的自己）；填別人 = 球隊管理員幫忙登記
-- 開賽後球員不能再改（status = 'closed'），球隊管理員可以隨時更正
create or replace function public.set_attendance(match uuid, answer text, note text default '',
                                                 player uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    uid uuid := auth.uid();
    m public.matches;
    pid uuid;
    manager boolean;
begin
    if uid is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    select * into m from public.matches x where x.id = set_attendance.match;
    if not found or not public.is_member(m.team_id) and not public.is_admin() then
        return jsonb_build_object('status', 'not_found');
    end if;
    if answer is not null and answer not in ('in', 'out') then
        return jsonb_build_object('status', 'invalid', 'detail', '只能選出席或請假');
    end if;
    if char_length(coalesce(note, '')) > 40 then
        return jsonb_build_object('status', 'invalid', 'detail', '備註最多 40 個字');
    end if;
    manager := public.can_manage(m.team_id);

    if player is null then
        select ms.player_id into pid from public.memberships ms where ms.team_id = m.team_id and ms.user_id = uid;
        if pid is null then return jsonb_build_object('status', 'not_linked'); end if;
    else
        pid := player;
        if not exists (select 1 from public.players p where p.id = pid and p.team_id = m.team_id) then
            return jsonb_build_object('status', 'not_found');
        end if;
        if not manager and not public.is_own_player(pid) then return jsonb_build_object('status', 'forbidden'); end if;
    end if;

    if not manager and (now() >= m.kickoff or m.our_score is not null) then
        return jsonb_build_object('status', 'closed');
    end if;

    if answer is null then
        delete from public.attendance a where a.match_id = m.id and a.player_id = pid;
        return jsonb_build_object('status', 'ok', 'answer', null);
    end if;
    insert into public.attendance (match_id, player_id, team_id, status, note, updated_by, updated_at)
    values (m.id, pid, m.team_id, answer, btrim(coalesce(note, '')), uid, now())
    on conflict (match_id, player_id) do update
       set status = excluded.status, note = excluded.note, updated_by = excluded.updated_by,
           updated_at = excluded.updated_at;
    return jsonb_build_object('status', 'ok', 'answer', answer);
end $$;

-- ---------- 6. 存陣容：多一個 match 參數 ----------
-- 參數不一樣 = 新的函式，所以先把 0007 的舊版本刪掉，免得留下兩個版本
drop function public.save_lineup(uuid, uuid, text, text, int, text, jsonb, text[], uuid[]);

create or replace function public.save_lineup(team uuid, lineup uuid default null, kind text default 'draft',
                                              name text default '', size int default 11, formation text default '',
                                              picks jsonb default '{}', locked text[] default '{}',
                                              attending uuid[] default '{}', match uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    uid uuid := auth.uid();
    l public.lineups;
    m public.matches;
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

    -- 綁定比賽：比賽要是這一隊的、賽制要一樣、場上的人都要登記「出席」
    if match is not null then
        select * into m from public.matches x where x.id = save_lineup.match and x.team_id = team;
        if not found then return jsonb_build_object('status', 'invalid', 'detail', '找不到這場比賽'); end if;
        if m.size <> save_lineup.size then
            return jsonb_build_object('status', 'invalid', 'detail', '陣容的賽制跟比賽不一樣');
        end if;
        if exists (select 1 from jsonb_each(picks) e
                    where jsonb_typeof(e.value) = 'string'
                      and not exists (select 1 from public.attendance a
                                       where a.match_id = m.id and a.player_id = (e.value #>> '{}')::uuid
                                         and a.status = 'in')) then
            return jsonb_build_object('status', 'invalid', 'detail', '有球員沒有登記出席這場比賽');
        end if;
    end if;

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
        insert into public.lineups (team_id, owner_id, kind, name, size, formation, picks, locked, attending, match_id)
        values (team, uid, kind, coalesce(btrim(name), ''), size, formation, picks,
                coalesce(locked, '{}'), coalesce(attending, '{}'), save_lineup.match)
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
           attending = coalesce(save_lineup.attending, '{}'), match_id = save_lineup.match, updated_at = now()
     where x.id = lineup;
    return jsonb_build_object('status', 'ok', 'id', lineup);
end $$;

-- ---------- 7. 分享頁：多回傳綁定的比賽（對手、開賽時間）----------
-- 白名單只多 'match'、'opponent'、'kickoff' 三個 key（tests/test_v25.py 檢查）；對手是別隊的隊名，不是個資
create or replace function public.get_shared_lineup(token text)
returns jsonb
language plpgsql security definer stable
set search_path = public
as $$
declare
    l public.lineups;
    t public.teams;
    m public.matches;
begin
    if token is null or token !~ '^[A-Za-z0-9_-]{32}$' then return jsonb_build_object('status', 'not_found'); end if;
    select * into l from public.lineups x where x.share_token = token;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    -- 草稿的主人離隊或刪帳號：連結失效
    if l.kind = 'draft' and (l.owner_id is null or not exists (
            select 1 from public.memberships ms where ms.team_id = l.team_id and ms.user_id = l.owner_id)) then
        return jsonb_build_object('status', 'not_found');
    end if;
    select * into t from public.teams where id = l.team_id;
    select * into m from public.matches x where x.id = l.match_id;
    return jsonb_build_object(
        'status', 'ok',
        'team_name', t.name,
        'season', t.season,
        'name', l.name,
        'size', l.size,
        'formation', l.formation,
        'show_names', l.share_names,
        'updated_at', l.updated_at,
        'match', case when m.id is null then null
                      else jsonb_build_object('opponent', m.opponent, 'kickoff', m.kickoff) end,
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

-- ---------- 8. 下載我的資料：加上自己的出席紀錄 ----------
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
                      from public.ability_ratings r where r.player_id = m.player_id), '[]'::jsonb),
                'attendance', coalesce((
                    select jsonb_agg(jsonb_build_object('opponent', mt.opponent, 'kickoff', mt.kickoff,
                                                        'status', a.status, 'note', a.note, 'updated_at', a.updated_at)
                                     order by mt.kickoff)
                      from public.attendance a join public.matches mt on mt.id = a.match_id
                     where a.player_id = m.player_id), '[]'::jsonb)
            ) order by m.joined_at)
              from public.memberships m join public.teams t on t.id = m.team_id
             where m.user_id = uid), '[]'::jsonb),
        'lineups', coalesce((
            select jsonb_agg(jsonb_build_object(
                'team_id', x.team_id, 'kind', x.kind, 'name', x.name, 'size', x.size, 'formation', x.formation,
                'picks', x.picks, 'locked', x.locked, 'attending', x.attending, 'match_id', x.match_id,
                'shared', x.share_token is not null, 'share_names', x.share_names,
                'created_at', x.created_at, 'updated_at', x.updated_at) order by x.created_at)
              from public.lineups x where x.owner_id = uid), '[]'::jsonb),
        'contact_messages', coalesce((
            select jsonb_agg(jsonb_build_object('category', c.category, 'body', c.body, 'created_at', c.created_at)
                             order by c.created_at)
              from public.contact_messages c where c.user_id = uid), '[]'::jsonb)
    );
end $$;

-- ---------- 9. 刪除帳號：出席紀錄一起刪 ----------
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
    delete from public.attendance where player_id = any(pids);
    update public.players
       set nickname = '', message = '', good_positions = '{}', bad_positions = '{}', weak_side = ''
     where id = any(pids);
    delete from public.lineups where owner_id = uid and kind = 'draft';
    -- 刪掉登入帳號：profiles、memberships、封鎖紀錄、Team ID 嘗試紀錄跟著刪（外鍵 on delete cascade），
    -- 名單上的球員因為 memberships 不見了，自然變成「沒有連結帳號」；正式陣容的 owner_id、比賽的 created_by 變成空的
    delete from auth.users where id = uid;
    return jsonb_build_object('status', 'ok', 'players_unlinked', cardinality(pids));
end $$;

-- ---------- 權限 ----------
-- 先全部從 public、anon 收回
revoke all on function
    public.match_problem(text, timestamptz, timestamptz, text, text, int, text, int, int),
    public.save_match(uuid, uuid, text, timestamptz, timestamptz, text, text, int, text, int, int),
    public.delete_match(uuid), public.match_from_fixture(uuid, uuid),
    public.set_attendance(uuid, text, text, uuid),
    public.save_lineup(uuid, uuid, text, text, int, text, jsonb, text[], uuid[], uuid),
    public.export_my_data(), public.delete_my_account()
from public, anon;
-- 小工具只給函式內部用，登入的人也不能直接呼叫
revoke all on function public.match_problem(text, timestamptz, timestamptz, text, text, int, text, int, int)
from authenticated;

grant execute on function
    public.save_match(uuid, uuid, text, timestamptz, timestamptz, text, text, int, text, int, int),
    public.delete_match(uuid), public.match_from_fixture(uuid, uuid),
    public.set_attendance(uuid, text, text, uuid),
    public.save_lineup(uuid, uuid, text, text, int, text, jsonb, text[], uuid[], uuid),
    public.export_my_data(), public.delete_my_account()
to authenticated;

-- 分享頁 get_shared_lineup（上面重新定義過）照舊開放給沒登入的人：0007 已經 grant 給 anon，
-- create or replace 會保留原本的權限，所以這裡**不能**把它放進上面的 revoke，也不再 grant 一次
-- （tests/test_v24.py 檢查全部 migration 只有一個 grant 給 anon；rls_test 檢查沒登入還看得到分享頁）。
