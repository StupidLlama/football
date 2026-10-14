-- ============================================================
-- v2.10 資安檢查的修補（報告：docs/SECURITY_REVIEW.md）
--
--   1. 能力表（ability_ratings）只能經過 submit_self_rating 寫入：收回直接 insert / delete。
--      網站本來就只用 submit_self_rating；匯入工具用管理者身分（db.admin），不受影響。
--   2. 資料表本身也加上字數和格式的上限（跟資料庫函式、網站的檢查一樣或更寬）：
--      players、teams、fixtures。用 NOT VALID：舊資料不檢查，新增和修改才檢查。
--      執行前先跑 supabase/tests/v210_precheck.sql（只讀），確認舊資料沒有超過上限的（docs/V2_10_SETUP.md 第 2 節）。
--   3. export_my_data（下載我的資料）補上：裁判任務、聊天室已讀時間、加入球隊／兌換管理員碼的嘗試紀錄。
--
-- 規則：已經執行過的檔案不要改；要改就新增 0015_xxx.sql。
-- 上線順序：先在 Supabase 執行這個檔案（再跑 rls_test.sql），再部署網站。
-- ============================================================

-- ---------- 1. 能力表只能用 submit_self_rating 寫 ----------
drop policy if exists ratings_insert on public.ability_ratings;
drop policy if exists ratings_delete on public.ability_ratings;
revoke insert, delete on public.ability_ratings from authenticated;

-- ---------- 2. 資料表的字數、格式上限 ----------
-- 球員：名字 1–40 字（roster_problem）、暱稱 ≤ 20、給球隊的話 ≤ 300（submit_self_rating）；
-- 這裡放寬一點（暱稱 40、話 1000），只擋「塞爆」，不會擋到舊資料或正常使用。
-- 位置：每個都要像 CB 或 LB/RB，各最多 10 個，同一個位置不能同時擅長又不擅長。
alter table public.players
    add constraint players_name_len     check (char_length(btrim(name)) between 1 and 40) not valid,
    add constraint players_nickname_len check (char_length(nickname) <= 40) not valid,
    add constraint players_message_len  check (char_length(message) <= 1000) not valid,
    add constraint players_jersey_len   check (char_length(jersey_number) <= 3) not valid,
    add constraint players_positions_ok check (
        cardinality(good_positions) <= 10 and cardinality(bad_positions) <= 10
        and array_to_string(good_positions || bad_positions, ',', '?')
            ~ '^([A-Z]{2,3}(/[A-Z]{2,3})?)?(,[A-Z]{2,3}(/[A-Z]{2,3})?)*$'
        and not ('' = any(good_positions || bad_positions))
        and not (good_positions && bad_positions)
    ) not valid;

-- 球隊：隊名 1–40、賽季 ≤ 20、聯賽隊名 ≤ 40（跟 start_new_season 一樣）
alter table public.teams
    add constraint teams_name_len        check (char_length(btrim(name)) between 1 and 40) not valid,
    add constraint teams_season_len      check (char_length(season) <= 20) not valid,
    add constraint teams_league_name_len check (char_length(league_name) <= 40) not valid;

-- 系際聯賽賽程（球隊管理員直接寫）：隊名 ≤ 40、備註 ≤ 500、邊審最多 4 個
alter table public.fixtures
    add constraint fixtures_text_len check (
        char_length(home) <= 40 and char_length(away) <= 40 and char_length(referee) <= 40
        and char_length(note) <= 500
        and cardinality(linesmen) <= 4 and char_length(array_to_string(linesmen, ',')) <= 200
    ) not valid;

-- ---------- 3. 下載我的資料：補上漏掉的表 ----------
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
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
                     where a.player_id = m.player_id), '[]'::jsonb),
                -- v2.10：裁判任務
                'referee_duties', coalesce((
                    select jsonb_agg(jsonb_build_object('day', f.day, 'home', f.home, 'away', f.away,
                                                        'role', d.role, 'updated_at', d.updated_at)
                                     order by f.day)
                      from public.duties d join public.fixtures f on f.id = d.fixture_id
                     where d.player_id = m.player_id), '[]'::jsonb),
                -- v2.10：聊天室最後已讀時間
                'chat_last_read_at', (select cr.last_read_at from public.chat_reads cr
                                       where cr.team_id = m.team_id and cr.user_id = uid)
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
            select jsonb_agg(jsonb_build_object(
                'category', c.category, 'body', c.body, 'page', c.page, 'version', c.version, 'device', c.device,
                'status', c.status, 'reply', c.reply, 'replied_at', c.replied_at, 'created_at', c.created_at)
                             order by c.created_at)
              from public.contact_messages c where c.user_id = uid), '[]'::jsonb),
        -- v2.10：輸入 Team ID 的紀錄（只留一天）、兌換管理員碼輸錯的次數
        'join_attempts', coalesce((
            select jsonb_agg(jsonb_build_object('at', j.at, 'ok', j.ok) order by j.at)
              from public.join_attempts j where j.user_id = uid), '[]'::jsonb),
        'coach_code_attempts', coalesce((
            select jsonb_agg(jsonb_build_object('team_id', g.team_id, 'failures', g.failures,
                                                'banned_at', g.banned_at, 'updated_at', g.updated_at))
              from public.coach_code_guard g where g.user_id = uid), '[]'::jsonb)
    );
end $$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
