-- ============================================================
-- 權限規則測試：證明「A 隊讀不到 B 隊」等規則。
-- 整個檔案包在一個交易裡，最後 ROLLBACK，資料庫不會留下任何東西。
-- 本機：  backend/scripts/rls_check.py 會自動跑
-- 手動：  貼到 Supabase SQL Editor 執行；全部通過最後會看到 'RLS OK'，失敗會看到錯誤訊息
-- ============================================================
begin;

-- ---------- 測試資料（用管理者身分建立）----------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'rls-a@example.test'),   -- A 隊球員
  ('00000000-0000-0000-0000-00000000000b', 'rls-b@example.test'),   -- B 隊球員
  ('00000000-0000-0000-0000-00000000000c', 'rls-c@example.test'),   -- A 隊球員 + B 隊教練
  ('00000000-0000-0000-0000-00000000000d', 'rls-d@example.test');   -- A 隊教練

insert into public.teams (id, code, name) values
  ('10000000-0000-0000-0000-00000000000a', 'RLS-TEST-A', 'A 隊'),
  ('10000000-0000-0000-0000-00000000000b', 'RLS-TEST-B', 'B 隊');
insert into public.team_secrets (team_id, coach_code_hash) values ('10000000-0000-0000-0000-00000000000a', 'x');

insert into public.players (id, team_id, name) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', '球員A1'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', '球員A2'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', '球員B1');

insert into public.memberships (team_id, user_id, role, player_id) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'player', '20000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'player', '20000000-0000-0000-0000-0000000000b1'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 'player', null),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c', 'coach', null),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', 'coach', null);

insert into public.fixtures (id, team_id, day, start_time, home, away) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', '2026-10-16', '19:00', '甲', '乙'),
  ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', '2026-10-16', '19:00', '甲', '乙');
insert into public.duties (team_id, fixture_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000a1', '邊審'),
  ('10000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-0000000000b1', '邊審');

-- 小工具：一定要失敗的語句
create function pg_temp.must_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    return;   -- 有擋下來 = 通過
  end;
  raise exception 'RLS 測試失敗：% 應該被擋下，卻成功了', label;
end $$;

create function pg_temp.expect(n bigint, want bigint, label text) returns void language plpgsql as $$
begin
  if n is distinct from want then
    raise exception 'RLS 測試失敗：% 應該是 %，實際是 %', label, want, n;
  end if;
end $$;

grant execute on function pg_temp.must_fail(text, text), pg_temp.expect(bigint, bigint, text) to anon, authenticated;

-- ============ 1. A 隊球員 ============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select pg_temp.expect((select count(*) from public.teams), 1, 'A 隊球員看得到的隊伍數');
select pg_temp.expect((select count(*) from public.players), 2, 'A 隊球員看得到的球員數');
select pg_temp.expect((select count(*) from public.players where team_id = '10000000-0000-0000-0000-00000000000b'), 0,
                      'A 隊球員看得到 B 隊的球員');
select pg_temp.expect((select count(*) from public.fixtures), 1, 'A 隊球員看得到的賽程');
select pg_temp.expect((select count(*) from public.duties), 1, 'A 隊球員看得到的裁判任務');
select pg_temp.must_fail('select * from public.team_secrets', '球員讀 team_secrets');
select pg_temp.must_fail($q$insert into public.fixtures (team_id, day, home, away)
                          values ('10000000-0000-0000-0000-00000000000a', '2026-11-01', 'x', 'y')$q$, '球員新增賽程');
select pg_temp.must_fail($q$insert into public.players (team_id, name)
                          values ('10000000-0000-0000-0000-00000000000a', '偷加的人')$q$, '球員新增名單');
-- 自己的自評可以，別人的不行
insert into public.ability_ratings (team_id, player_id, scores)
  values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '{"passing": 4}');
select pg_temp.must_fail($q$insert into public.ability_ratings (team_id, player_id, scores)
                          values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', '{"passing": 5}')$q$,
                         '球員幫隊友填自評');
select pg_temp.must_fail($q$insert into public.ability_ratings (team_id, player_id, scores)
                          values ('10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000a1', '{"passing": 5}')$q$,
                         '把自評塞到別隊');
-- 改自己的資料可以，改隊友的不會生效
with u as (update public.players set nickname = '新暱稱' where id = '20000000-0000-0000-0000-0000000000a1' returning 1)
select pg_temp.expect((select count(*) from u), 1, '球員改自己的暱稱');
with u as (update public.players set nickname = '亂改' where id = '20000000-0000-0000-0000-0000000000a2' returning 1)
select pg_temp.expect((select count(*) from u), 0, '球員改隊友的暱稱');
with u as (update public.duties set slot = 9 returning 1)
select pg_temp.expect((select count(*) from u), 0, '球員改裁判任務');
reset role;

-- ============ 2. 一人兩隊：A 隊球員 + B 隊教練 ============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select pg_temp.expect((select count(*) from public.teams), 2, '兩隊成員看得到的隊伍數');
insert into public.fixtures (team_id, day, home, away)
  values ('10000000-0000-0000-0000-00000000000b', '2026-11-01', 'B 隊教練', '新增');
select pg_temp.must_fail($q$insert into public.fixtures (team_id, day, home, away)
                          values ('10000000-0000-0000-0000-00000000000a', '2026-11-01', '不是 A 隊教練', 'x')$q$,
                         '在 A 隊只是球員卻新增 A 隊賽程');
reset role;

-- ============ 3. A 隊教練 ============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
with u as (update public.duties set player_id = '20000000-0000-0000-0000-0000000000a2' returning 1)
select pg_temp.expect((select count(*) from u), 1, 'A 隊教練排 A 隊的裁判（B 隊的不能動）');
select pg_temp.expect((select count(*) from public.duties where team_id = '10000000-0000-0000-0000-00000000000b'), 0,
                      'A 隊教練看得到 B 隊的裁判任務');
select pg_temp.must_fail($q$insert into public.players (team_id, name)
                          values ('10000000-0000-0000-0000-00000000000b', '跨隊新增')$q$, 'A 隊教練新增 B 隊球員');
select pg_temp.must_fail('select * from public.team_secrets', '教練直接讀 team_secrets');
reset role;

-- ============ 4. 沒登入 ============
set local role anon;
select set_config('request.jwt.claims', '', true);
select pg_temp.must_fail('select * from public.players', '沒登入讀球員');
select pg_temp.must_fail('select * from public.teams', '沒登入讀隊伍');
reset role;

select 'RLS OK' as result;
rollback;
