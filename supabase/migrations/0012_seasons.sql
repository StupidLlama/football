-- ============================================================
-- v2.8 賽季進步追蹤（SPEC F8）
--   決定（2026-10-13）：不拆獨立的 seasons 表。一筆 teams 仍然是「一支球隊的一個賽季」，
--   用「系列」lineage_id 把同一支隊的各賽季串起來（SPEC 資料模型有說明為什麼）。
--
--   1. teams 加 lineage_id（系列）、prev_team_id（上一季）、archived_at（封存時間 = 舊賽季，只能看）
--      players 加 prev_player_id（上一季的自己）：跨賽季同一人靠這條鏈連起來，沒有帳號的球員也連得起來
--   2. 舊賽季唯讀：一個「守門員」觸發器 season_guard 掛在每張屬於球隊的表上，封存的賽季一律不能新增、修改、刪除
--      - 不用改二十幾個動作函式：不管是網站直接寫表（RLS）還是資料庫函式，最後都會經過這個觸發器
--      - 例外 1：外鍵連帶的改動（pg_trigger_depth() > 1），例如刪帳號時 author_id 變成空的
--      - 例外 2：這次交易設了 app.allow_archived = on（只有 delete_my_account 會設；網站沒辦法設這個值）
--      - memberships 只擋「加入」（離開舊賽季、生涯開關照常可以）；chat_reads（讀到哪裡）不擋
--   3. join_team：用舊賽季的 Team ID 加入 → 回傳 archived，不會加入
--   4. start_new_season（球隊管理員）：開新的一季
--      新的 teams（同一個系列、新的 Team ID）→ 複製名單（每個人連到上一季的自己）→ 帳號一起帶過去（身分不變）
--      → 複製 Discord 設定 → 舊賽季的管理員碼作廢 → 舊賽季封存 → 可以順便在新賽季聊天室發通知
--   5. get_progress(team, player)：同一個系列裡，這個人每一季的能力表（隊友都看得到，不用打開生涯開關）
--      get_team_progress(team)：全隊每個人的進步資料，只有球隊管理員
--      跨隊資料只經過這兩個函式拿，不放寬 RLS
--   6. export_my_data 加上系列、封存時間；delete_my_account 可以清掉舊賽季裡自己的資料
--
-- 出席率不需要新的資料庫函式：出席紀錄本來就是同隊看得到（attendance_select），
-- 出席率在網站算（web/lib/attendance-rate.ts），只是畫面上只給本人和球隊管理員看。
--
-- 規則：已經執行過的檔案不要改；要改就新增 0013_xxx.sql。
-- 上線順序：先在 Supabase 執行這個檔案，再部署網站（新網站會讀 lineage_id、archived_at）。
-- ============================================================

-- ---------- 1. 新欄位 ----------
alter table public.teams
    add column lineage_id   uuid not null default gen_random_uuid(),   -- 現有每一隊各自是一個系列
    add column prev_team_id uuid references public.teams(id) on delete set null,
    add column archived_at  timestamptz;
create index teams_lineage_idx on public.teams(lineage_id);
-- 一季只能接一個下一季（連按兩次「開新賽季」也只會開一季）
create unique index teams_prev_unique on public.teams(prev_team_id) where prev_team_id is not null;

alter table public.players
    add column prev_player_id uuid references public.players(id) on delete set null;
create index players_prev_idx on public.players(prev_player_id) where prev_player_id is not null;
-- 名單上一個人只會被下一季接一次
create unique index players_prev_unique on public.players(prev_player_id) where prev_player_id is not null;

-- teams 的 select 本來就是全部欄位（0004），新欄位不用另外 grant；update 還是只能改名稱、賽季、聯賽隊名

-- players 球隊管理員可以直接寫表（0004），所以「上一季的自己」要另外鎖住：只有 start_new_season 能設
-- （它會在這次交易設 app.new_season = on）；外鍵連帶變成空的（上一季的人被刪）照常可以
create or replace function public.players_prev_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if pg_trigger_depth() > 1 or coalesce(current_setting('app.new_season', true), '') = 'on' then return new; end if;
    if (tg_op = 'INSERT' and new.prev_player_id is not null)
       or (tg_op = 'UPDATE' and new.prev_player_id is distinct from old.prev_player_id) then
        raise exception '上一季的連結只能由「開新賽季」設定' using errcode = '42501';
    end if;
    return new;
end $$;
create trigger players_prev_guard before insert or update on public.players
    for each row execute function public.players_prev_guard();

-- ---------- 2. 舊賽季唯讀：守門員 ----------
create or replace function public.season_archived(t uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$ select exists (select 1 from public.teams where id = t and archived_at is not null) $$;

create or replace function public.season_guard()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare t uuid;
begin
    if pg_trigger_depth() > 1 or coalesce(current_setting('app.allow_archived', true), '') = 'on' then
        return coalesce(new, old);
    end if;
    if tg_table_name = 'teams' then
        t := old.id;   -- teams 只掛 update / delete
    elsif tg_op = 'DELETE' then
        t := old.team_id;
    else
        t := new.team_id;
        if tg_op = 'UPDATE' and old.team_id is distinct from new.team_id and public.season_archived(old.team_id) then
            t := old.team_id;
        end if;
    end if;
    if public.season_archived(t) then
        raise exception 'season_archived' using errcode = 'P0001', hint = '這是舊賽季，只能看，不能修改';
    end if;
    return coalesce(new, old);
end $$;

create trigger teams_season_guard before update or delete on public.teams
    for each row execute function public.season_guard();
create trigger memberships_season_guard before insert on public.memberships
    for each row execute function public.season_guard();
create trigger players_season_guard before insert or update or delete on public.players
    for each row execute function public.season_guard();
create trigger ability_ratings_season_guard before insert or update or delete on public.ability_ratings
    for each row execute function public.season_guard();
create trigger fixtures_season_guard before insert or update or delete on public.fixtures
    for each row execute function public.season_guard();
create trigger duties_season_guard before insert or update or delete on public.duties
    for each row execute function public.season_guard();
create trigger coach_codes_season_guard before insert or update or delete on public.coach_codes
    for each row execute function public.season_guard();
create trigger lineups_season_guard before insert or update or delete on public.lineups
    for each row execute function public.season_guard();
create trigger matches_season_guard before insert or update or delete on public.matches
    for each row execute function public.season_guard();
create trigger attendance_season_guard before insert or update or delete on public.attendance
    for each row execute function public.season_guard();
create trigger practices_season_guard before insert or update or delete on public.practices
    for each row execute function public.season_guard();
create trigger practice_attendance_season_guard before insert or update or delete on public.practice_attendance
    for each row execute function public.season_guard();
create trigger messages_season_guard before insert or update or delete on public.messages
    for each row execute function public.season_guard();
create trigger chat_discord_season_guard before insert or update or delete on public.chat_discord
    for each row execute function public.season_guard();

-- ---------- 3. 用舊賽季的 Team ID 加入：回傳 archived ----------
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

    select id, name, season, code, archived_at into t from public.teams
     where public.normalize_code(code) = public.normalize_code(team_code);
    if not found then
        insert into public.join_attempts (user_id, ok) values (uid, false);
        return jsonb_build_object('status', 'not_found', 'attempts_left', greatest(0, 4 - fails));
    end if;

    insert into public.join_attempts (user_id, ok) values (uid, true);
    if t.archived_at is not null then
        -- 已經是成員的照常回 already_member（讓他能回去看舊賽季）；新加入的不行，也不告訴他新賽季的 Team ID
        if exists (select 1 from public.memberships where team_id = t.id and user_id = uid) then
            return jsonb_build_object('status', 'already_member', 'team_id', t.id, 'name', t.name, 'season', t.season);
        end if;
        return jsonb_build_object('status', 'archived', 'name', t.name, 'season', t.season);
    end if;
    insert into public.memberships (team_id, user_id) values (t.id, uid) on conflict do nothing;
    get diagnostics added = row_count;
    return jsonb_build_object('status', case when added = 1 then 'joined' else 'already_member' end,
                              'team_id', t.id, 'name', t.name, 'season', t.season);
end $$;

-- ---------- 4. 開新賽季 ----------
-- season：新賽季的名稱（例如「2027 春」），必填、不能跟這一季一樣
-- team_name：新賽季的隊名，不填 = 沿用
-- keep_jersey / keep_badge：背號、隊長標記要不要帶過去
-- notice：發到新賽季聊天室的通知（空的 = 不發）；to_discord：同時推 Discord（有設定 Webhook 才會推）
create or replace function public.start_new_season(team uuid, season text, team_name text default null,
                                                   keep_jersey boolean default true, keep_badge boolean default true,
                                                   notice text default null, to_discord boolean default false)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    uid uuid := auth.uid();
    old record;
    new_id uuid;
    new_code text;
    n_players int;
    n_members int;
    new_season text := btrim(coalesce(start_new_season.season, ''));
    new_name text := nullif(btrim(coalesce(team_name, '')), '');
    sent jsonb := jsonb_build_object('chat', false, 'discord', false);
begin
    if uid is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    if not public.is_member(team) and not public.is_admin() then return jsonb_build_object('status', 'not_found'); end if;
    if not public.can_manage(team) then return jsonb_build_object('status', 'forbidden'); end if;

    -- 鎖住這一季：連按兩次只會開一季
    select * into old from public.teams where id = team for update;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    if old.archived_at is not null then return jsonb_build_object('status', 'archived'); end if;

    if char_length(new_season) not between 1 and 20 then
        return jsonb_build_object('status', 'invalid', 'detail', '新賽季的名稱要 1–20 個字，例如「2027 春」');
    end if;
    if new_season = btrim(coalesce(old.season, '')) then
        return jsonb_build_object('status', 'invalid', 'detail', '新賽季的名稱不能跟這一季一樣');
    end if;
    if char_length(coalesce(new_name, '')) > 40 then
        return jsonb_build_object('status', 'invalid', 'detail', '隊名最多 40 個字');
    end if;
    if char_length(btrim(coalesce(notice, ''))) > 2000 then
        return jsonb_build_object('status', 'invalid', 'detail', '通知最多 2000 個字');
    end if;

    -- 新的一季（新的 Team ID 由 teams.code 的預設值產生）
    insert into public.teams (name, season, league_name, lineage_id, prev_team_id)
    values (coalesce(new_name, old.name), new_season, old.league_name, old.lineage_id, old.id)
    returning id, code into new_id, new_code;

    -- 名單：每個人連到上一季的自己。能力表不複製（新賽季重填，舊的留在舊賽季看得到進步）
    perform set_config('app.new_season', 'on', true);
    insert into public.players (team_id, name, nickname, jersey_number, badge, good_positions, bad_positions,
                                weak_side, message, prev_player_id)
    select new_id, p.name, p.nickname,
           case when keep_jersey then p.jersey_number end,
           case when keep_badge then p.badge end,
           p.good_positions, p.bad_positions, p.weak_side, p.message, p.id
      from public.players p where p.team_id = team;
    get diagnostics n_players = row_count;
    perform set_config('app.new_season', 'off', true);

    -- 帳號一起帶過去：身分（球員／球隊管理員）、生涯開關不變；還沒處理的認領申請不帶
    insert into public.memberships (team_id, user_id, role, player_id, career_shared)
    select new_id, m.user_id, m.role, np.id, m.career_shared
      from public.memberships m
      left join public.players np on np.team_id = new_id and np.prev_player_id = m.player_id
     where m.team_id = team;
    get diagnostics n_members = row_count;

    -- 開新賽季的人如果是網站管理員、本來不在這隊，不會被加進去（跟 admin_create_team 一樣）

    -- Discord 設定跟著新賽季
    insert into public.chat_discord (team_id, webhook_url)
    select new_id, d.webhook_url from public.chat_discord d where d.team_id = team;

    -- 舊賽季：管理員碼作廢，然後封存（封存之後守門員就不讓它再改了，所以要先作廢）
    update public.coach_codes set revoked_at = now() where team_id = team and revoked_at is null;
    update public.teams set archived_at = now() where id = team;

    if btrim(coalesce(notice, '')) <> '' then
        sent := public.practice_announce(new_id, notice, true, coalesce(to_discord, false));
    end if;

    return jsonb_build_object('status', 'ok', 'team_id', new_id, 'code', new_code,
                              'players', n_players, 'members', n_members,
                              'chat', sent -> 'chat', 'discord', sent -> 'discord');
end $$;

-- ---------- 5. 進步資料 ----------
-- 一位球員在同一個系列裡的每一季（往前、往後都找），每一季附上全部的能力表
-- 只給下面兩個函式用（不 grant 給任何人）
create or replace function public.progress_chain(player uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
    with recursive
    back(pid, depth) as (
        select player, 0
        union all
        select p.prev_player_id, b.depth + 1 from back b join public.players p on p.id = b.pid
         where p.prev_player_id is not null and b.depth < 50
    ),
    fwd(pid, depth) as (
        select player, 0
        union all
        select p.id, f.depth + 1 from fwd f join public.players p on p.prev_player_id = f.pid
         where f.depth < 50
    ),
    -- pos：這一季是 0，往前是 -1、-2…，往後是 1、2…（用鏈的順序排，不靠建立時間）
    chain as (select pid, -depth as pos from back union select pid, depth from fwd)
    select coalesce(jsonb_agg(jsonb_build_object(
               'team_id', t.id,
               'team_name', t.name,
               'season', t.season,
               'started_at', t.created_at,
               'archived_at', t.archived_at,
               'player_id', pl.id,
               'jersey_number', pl.jersey_number,
               'ratings', coalesce((
                   select jsonb_agg(jsonb_build_object('scores', r.scores, 'submitted_at', r.submitted_at)
                                    order by r.submitted_at)
                     from public.ability_ratings r where r.player_id = pl.id), '[]'::jsonb)
           ) order by c.pos), '[]'::jsonb)
      from chain c
      join public.players pl on pl.id = c.pid
      join public.teams t on t.id = pl.team_id
     -- 只留同一個系列（理論上鏈一定在同一個系列裡，這裡再擋一次）
     where t.lineage_id = (select t0.lineage_id from public.players p0 join public.teams t0 on t0.id = p0.team_id
                            where p0.id = player);
$$;

-- 在 team 裡看 player 的進步：同隊的人都可以看（v2.8 決定：同一個系列自動串起來，不用打開生涯開關）
create or replace function public.get_progress(team uuid, player uuid)
returns jsonb
language plpgsql security definer stable
set search_path = public
as $$
begin
    if auth.uid() is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    if not public.is_member(team) and not public.is_admin() then return jsonb_build_object('status', 'not_member'); end if;
    if not exists (select 1 from public.players where id = player and team_id = team) then
        return jsonb_build_object('status', 'not_found');
    end if;
    return jsonb_build_object('status', 'ok', 'seasons', public.progress_chain(player));
end $$;

-- 全隊的進步（排行榜用）：只有球隊管理員
create or replace function public.get_team_progress(team uuid)
returns jsonb
language plpgsql security definer stable
set search_path = public
as $$
begin
    if auth.uid() is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    if not public.is_member(team) and not public.is_admin() then return jsonb_build_object('status', 'not_member'); end if;
    if not public.can_manage(team) then return jsonb_build_object('status', 'forbidden'); end if;
    return jsonb_build_object('status', 'ok', 'players', coalesce((
        select jsonb_agg(jsonb_build_object('player_id', p.id, 'seasons', public.progress_chain(p.id)) order by p.name)
          from public.players p where p.team_id = team), '[]'::jsonb));
end $$;

-- ---------- 6. 下載我的資料：加上系列和封存時間 ----------
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
                'team', jsonb_build_object('id', t.id, 'name', t.name, 'season', t.season,
                                           'lineage_id', t.lineage_id, 'prev_team_id', t.prev_team_id,
                                           'archived_at', t.archived_at),
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
                     where a.player_id = m.player_id), '[]'::jsonb),
                'practice_attendance', coalesce((
                    select jsonb_agg(jsonb_build_object('starts_at', pr.starts_at, 'location', pr.location,
                                                        'status', a.status, 'note', a.note, 'updated_at', a.updated_at)
                                     order by pr.starts_at)
                      from public.practice_attendance a join public.practices pr on pr.id = a.practice_id
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
        'chat_messages', coalesce((
            select jsonb_agg(jsonb_build_object(
                'team_id', x.team_id, 'kind', x.kind, 'reply', x.parent_id is not null, 'body', x.body,
                'lineup_id', x.lineup_id, 'pinned', x.pinned_at is not null,
                'created_at', x.created_at, 'edited_at', x.edited_at) order by x.created_at)
              from public.messages x where x.author_id = uid and x.deleted_at is null), '[]'::jsonb),
        'contact_messages', coalesce((
            select jsonb_agg(jsonb_build_object('category', c.category, 'body', c.body, 'created_at', c.created_at)
                             order by c.created_at)
              from public.contact_messages c where c.user_id = uid), '[]'::jsonb)
    );
end $$;

-- ---------- 7. 刪除帳號：舊賽季裡自己的資料也要刪得掉 ----------
-- 內容跟 0011 一樣，只多了第一行：這次交易暫時讓守門員放行（只有刪帳號會這樣做）
-- 各賽季名單上的自己都會清掉個人介紹（每一季是一筆 players，都連在自己的帳號上）
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
    perform set_config('app.allow_archived', 'on', true);
    select coalesce(array_agg(player_id), '{}') into pids
      from public.memberships where user_id = uid and player_id is not null;
    delete from public.ability_ratings where player_id = any(pids);
    delete from public.attendance where player_id = any(pids);
    delete from public.practice_attendance where player_id = any(pids);
    update public.players
       set nickname = '', message = '', good_positions = '{}', bad_positions = '{}', weak_side = ''
     where id = any(pids);
    delete from public.lineups where owner_id = uid and kind = 'draft';
    update public.messages
       set body = '', lineup_id = null, pinned_at = null, deleted_at = now()
     where author_id = uid and deleted_at is null;
    delete from auth.users where id = uid;
    perform set_config('app.allow_archived', 'off', true);
    return jsonb_build_object('status', 'ok', 'players_unlinked', cardinality(pids));
end $$;

-- ---------- 權限 ----------
revoke all on function
    public.season_archived(uuid), public.season_guard(), public.players_prev_guard(), public.join_team(text),
    public.start_new_season(uuid, text, text, boolean, boolean, text, boolean),
    public.progress_chain(uuid), public.get_progress(uuid, uuid), public.get_team_progress(uuid),
    public.export_my_data(), public.delete_my_account()
from public, anon;
-- 守門員和進步鏈只給資料庫內部用，登入的人也不能直接呼叫
revoke all on function public.season_guard(), public.players_prev_guard(), public.progress_chain(uuid) from authenticated;

grant execute on function
    public.season_archived(uuid), public.join_team(text),
    public.start_new_season(uuid, text, text, boolean, boolean, text, boolean),
    public.get_progress(uuid, uuid), public.get_team_progress(uuid),
    public.export_my_data(), public.delete_my_account()
to authenticated;
