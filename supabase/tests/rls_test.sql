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
select pg_temp.must_fail('select * from public.join_attempts', '球員讀 join_attempts');
select pg_temp.must_fail('select code_hash from public.coach_codes', '球員讀教練碼雜湊');
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
select pg_temp.must_fail('select code_hash, salt from public.coach_codes', '教練讀教練碼雜湊');
reset role;

-- ============ 4. 沒登入 ============
set local role anon;
select set_config('request.jwt.claims', '', true);
select pg_temp.must_fail('select * from public.players', '沒登入讀球員');
select pg_temp.must_fail('select * from public.teams', '沒登入讀隊伍');
reset role;

-- ============================================================
-- v2.1 帳號系統
-- ============================================================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000e', 'rls-e@example.test'),   -- 還沒加入任何隊（用來測 Team ID 鎖定）
  ('00000000-0000-0000-0000-00000000000f', 'rls-f@example.test'),   -- 系統管理者
  ('00000000-0000-0000-0000-000000000010', 'rls-g@example.test'),   -- 新隊友：認領名單上的人
  ('00000000-0000-0000-0000-000000000011', 'rls-h@example.test');   -- 新隊友：申請新增名字
update public.profiles set is_admin = true where user_id = '00000000-0000-0000-0000-00000000000f';

create function pg_temp.st(j jsonb, want text, label text) returns void language plpgsql as $$
begin
  if j ->> 'status' is distinct from want then
    raise exception 'v2.1 測試失敗：% 應該是 %，實際是 %', label, want, j;
  end if;
end $$;
create function pg_temp.login(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.st(jsonb, text, text), pg_temp.login(text) to authenticated;

-- 新帳號自動有 profile
select pg_temp.expect((select count(*) from public.profiles where user_id = '00000000-0000-0000-0000-000000000011'), 1,
                      '新帳號自動建立 profile');
-- 記下兩隊的 Team ID（之後換成小寫、拿掉 - 來輸入，測試格式統一）
select set_config('test.code_a', (select lower(replace(code, '-', ' ')) from public.teams where id = '10000000-0000-0000-0000-00000000000a'), true);
select set_config('test.code_b', (select code from public.teams where id = '10000000-0000-0000-0000-00000000000b'), true);

set local role authenticated;

-- ---------- Team ID：輸錯 5 次鎖 15 分鐘 ----------
select pg_temp.login('00000000-0000-0000-0000-00000000000e');
select pg_temp.st(public.join_team('WRNG-0000'), 'not_found', '錯的 Team ID 第 ' || i) from generate_series(1, 5) i;
select pg_temp.st(public.join_team(current_setting('test.code_b')), 'locked', '錯 5 次後就算輸入正確也被鎖');
select pg_temp.expect((select count(*) from public.memberships), 0, '被鎖的人沒有加入任何隊');

-- ---------- 用 Team ID 加入（大小寫、空白、- 都不影響）----------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.st(public.join_team(current_setting('test.code_a')), 'joined', 'B 隊球員加入 A 隊');
select pg_temp.st(public.join_team(current_setting('test.code_a')), 'already_member', '重複加入');
select pg_temp.expect((select count(*) from public.teams), 2, '加入後看得到兩隊');

-- ---------- 同一個帳號在兩隊身分不同：C 是 A 隊球員、B 隊教練 ----------
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.st(public.create_coach_code('10000000-0000-0000-0000-00000000000b'), 'ok', 'C 在 B 隊（教練）產生教練碼');
select pg_temp.st(public.create_coach_code('10000000-0000-0000-0000-00000000000a'), 'forbidden', 'C 在 A 隊（球員）產生教練碼');
select pg_temp.st(public.reset_team_code('10000000-0000-0000-0000-00000000000a'), 'forbidden', 'C 在 A 隊重設 Team ID');
select pg_temp.expect((select count(*) from public.coach_codes), 1, 'C 只看得到 B 隊的教練碼');
-- 重設 B 隊的 Team ID：舊的不能再加入，已經加入的人不受影響
select pg_temp.st(public.reset_team_code('10000000-0000-0000-0000-00000000000b'), 'ok', 'C 重設 B 隊 Team ID');
select pg_temp.login('00000000-0000-0000-0000-000000000010');
select pg_temp.st(public.join_team(current_setting('test.code_b')), 'not_found', '用重設前的舊 Team ID 加入');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect((select count(*) from public.memberships where team_id = '10000000-0000-0000-0000-00000000000b'
                       and user_id = auth.uid()), 1, '重設後原本的成員還在');

-- ---------- 教練碼：A 隊教練 D 產生 ----------
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select set_config('test.coach_a', public.create_coach_code('10000000-0000-0000-0000-00000000000a') ->> 'code', true);
select pg_temp.st(public.create_coach_code('10000000-0000-0000-0000-00000000000a', 90), 'invalid', '有效天數超過 30 天');

-- B 在 A 隊輸錯 5 次 → 封鎖，輸入正確也沒用
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.st(public.redeem_coach_code('10000000-0000-0000-0000-00000000000a', 'WRONG-CODE' || i), 'wrong_code',
                  '錯的教練碼第 ' || i) from generate_series(1, 4) i;
select pg_temp.st(public.redeem_coach_code('10000000-0000-0000-0000-00000000000a', 'WRONG-CODE5'), 'banned', '第 5 次錯 → 封鎖');
select pg_temp.st(public.redeem_coach_code('10000000-0000-0000-0000-00000000000a', current_setting('test.coach_a')),
                  'banned', '封鎖中輸入正確的教練碼');
select pg_temp.login('00000000-0000-0000-0000-00000000000e');
select pg_temp.st(public.redeem_coach_code('10000000-0000-0000-0000-00000000000a', current_setting('test.coach_a')),
                  'not_member', '在沒加入的隊兌換');
-- 球員不能解除封鎖，教練可以
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.st(public.unban_coach_code('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b'),
                  'forbidden', '球員解除封鎖');
select pg_temp.expect((select count(*) from public.coach_code_guard), 0, '球員看得到別人的封鎖紀錄');
select pg_temp.expect((select count(*) from public.coach_codes), 0, '球員看得到教練碼清單');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect((select count(*) from public.coach_code_guard where banned_at is not null), 1, '教練看得到誰被封鎖');
select pg_temp.st(public.unban_coach_code('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b'),
                  'ok', '教練解除封鎖');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.st(public.redeem_coach_code('10000000-0000-0000-0000-00000000000a', current_setting('test.coach_a')),
                  'ok', '解除後兌換成功');
select pg_temp.st(public.redeem_coach_code('10000000-0000-0000-0000-00000000000a', current_setting('test.coach_a')),
                  'already_coach', '已經是教練再兌換');
-- 完成條件：同一個帳號 B，在 A 隊是教練、在 B 隊是球員
select pg_temp.expect((select count(*) from public.memberships where user_id = auth.uid()
                       and ((team_id = '10000000-0000-0000-0000-00000000000a' and role = 'coach')
                         or (team_id = '10000000-0000-0000-0000-00000000000b' and role = 'player'))), 2,
                      '同一個帳號在 A 隊是教練、在 B 隊是球員');
select pg_temp.st(public.create_coach_code('10000000-0000-0000-0000-00000000000a'), 'ok', 'B 在 A 隊（教練）產生教練碼');
select pg_temp.st(public.create_coach_code('10000000-0000-0000-0000-00000000000b'), 'forbidden', 'B 在 B 隊（球員）產生教練碼');
select pg_temp.must_fail($q$insert into public.fixtures (team_id, day, home, away)
                          values ('10000000-0000-0000-0000-00000000000b', '2026-11-02', 'x', 'y')$q$, 'B 在 B 隊只是球員卻新增賽程');

-- 同一組教練碼可以重複使用（到期或作廢為止）
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.st(public.redeem_coach_code('10000000-0000-0000-0000-00000000000a', current_setting('test.coach_a')),
                  'ok', '第二個人用同一組教練碼');
reset role;
select pg_temp.expect((select max(uses) from public.coach_codes where team_id = '10000000-0000-0000-0000-00000000000a'), 2,
                      '同一組教練碼用了 2 次');
-- 過期與作廢的教練碼不能用
update public.coach_codes set expires_at = now() - interval '1 second'
 where team_id = '10000000-0000-0000-0000-00000000000a';
set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.st(public.redeem_coach_code('10000000-0000-0000-0000-00000000000a', current_setting('test.coach_a')),
                  'wrong_code', '過期的教練碼');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select set_config('test.coach_a2', public.create_coach_code('10000000-0000-0000-0000-00000000000a') ->> 'code', true);
select pg_temp.st(public.revoke_coach_code(id), 'ok', '作廢教練碼') from public.coach_codes where revoked_at is null
   and expires_at > now() and team_id = '10000000-0000-0000-0000-00000000000a';
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.st(public.redeem_coach_code('10000000-0000-0000-0000-00000000000a', current_setting('test.coach_a2')),
                  'wrong_code', '作廢的教練碼');

-- ---------- 移出成員、取消教練（教練只能移出球員；教練由管理者處理）----------
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.st(public.remove_member('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c'),
                  'forbidden', '教練移出另一位教練');
select pg_temp.st(public.demote_coach('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c'),
                  'forbidden', '教練取消另一位教練');
select pg_temp.login('00000000-0000-0000-0000-00000000000f');
select pg_temp.st(public.demote_coach('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c'),
                  'ok', '管理者取消教練');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.st(public.leave_team('10000000-0000-0000-0000-00000000000b'), 'last_coach', '最後一位教練離隊');

-- ---------- 認領名單上的自己（教練確認才生效）----------
select pg_temp.login('00000000-0000-0000-0000-000000000010');
select pg_temp.st(public.join_team(current_setting('test.code_a')), 'joined', 'G 加入 A 隊');
select pg_temp.st(public.request_claim('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1'),
                  'taken', '認領已經有帳號的球員');
select pg_temp.st(public.request_claim('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000b1'),
                  'not_found', '認領別隊的球員');
select pg_temp.st(public.request_claim('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2'),
                  'ok', 'G 認領 A2');
select pg_temp.expect((select count(*) from public.memberships where user_id = auth.uid() and player_id is not null), 0,
                      '教練確認前還沒連上');
select pg_temp.must_fail($q$insert into public.ability_ratings (team_id, player_id, scores)
                          values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', '{"passing": 5}')$q$,
                         '確認前幫 A2 填自評');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.st(public.decide_claim('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000010', true),
                  'forbidden', '球員確認認領');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.st(public.decide_claim('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000010', true),
                  'ok', '教練確認認領');
select pg_temp.login('00000000-0000-0000-0000-000000000010');
select pg_temp.st(public.request_claim('10000000-0000-0000-0000-00000000000a', null, '另一個名字'),
                  'already_linked', '已經連上還要再認領');
insert into public.ability_ratings (team_id, player_id, scores)
  values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', '{"passing": 5}');

-- 不在名單上的新隊友：申請新增名字
select pg_temp.login('00000000-0000-0000-0000-000000000011');
select pg_temp.st(public.join_team(current_setting('test.code_a')), 'joined', 'H 加入 A 隊');
select pg_temp.st(public.request_claim('10000000-0000-0000-0000-00000000000a'), 'invalid', '沒選球員也沒填名字');
select pg_temp.st(public.request_claim('10000000-0000-0000-0000-00000000000a', null, '新隊友'), 'ok', 'H 申請新增名字');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.st(public.decide_claim('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000011', true),
                  'ok', '教練確認新增名字');
select pg_temp.expect((select count(*) from public.players p join public.memberships m on m.player_id = p.id
                       where p.name = '新隊友' and m.user_id = '00000000-0000-0000-0000-000000000011'), 1, '新名字已建立並連上');
-- 拒絕：連結不變、申請清掉
select pg_temp.st(public.decide_claim('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000011', false),
                  'not_found', '沒有申請中的認領');

-- ---------- 球員只能改自己的介紹欄位 ----------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.must_fail($q$update public.players set team_id = '10000000-0000-0000-0000-00000000000b'
                          where id = '20000000-0000-0000-0000-0000000000a1'$q$, '球員把自己移到別隊');
select pg_temp.must_fail($q$update public.players set name = '改名' where id = '20000000-0000-0000-0000-0000000000a1'$q$,
                         '球員改自己的名字');
select pg_temp.must_fail($q$update public.players set badge = 'C' where id = '20000000-0000-0000-0000-0000000000a1'$q$,
                         '球員把自己設成隊長');
with u as (update public.players set message = '加油' where id = '20000000-0000-0000-0000-0000000000a1' returning 1)
select pg_temp.expect((select count(*) from u), 1, '球員改自己給球隊的話');

-- ---------- profiles ----------
select pg_temp.must_fail($q$update public.profiles set is_admin = true where user_id = auth.uid()$q$, '把自己設成管理者');
with u as (update public.profiles set display_name = '新名字' where user_id = auth.uid() returning 1)
select pg_temp.expect((select count(*) from u), 1, '改自己的顯示名稱');
with u as (update public.profiles set display_name = '亂改' where user_id <> auth.uid() returning 1)
select pg_temp.expect((select count(*) from u), 0, '改別人的顯示名稱');
select pg_temp.expect((select count(*) from public.profiles where user_id = '00000000-0000-0000-0000-00000000000e'), 0,
                      '看得到不同隊的人的 profile');
select pg_temp.expect((select count(*) from public.profiles where user_id = '00000000-0000-0000-0000-00000000000d'), 1,
                      '看得到隊友的 profile');

-- ---------- 管理者建立隊伍 ----------
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.st(public.admin_create_team('偷建的隊'), 'forbidden', '教練建立隊伍');
select pg_temp.login('00000000-0000-0000-0000-00000000000f');
select pg_temp.st(j, 'ok', '管理者建立隊伍') from (select public.admin_create_team('新隊伍', '2026-27') j) x;
reset role;
select pg_temp.expect((select count(*) from public.teams where name = '新隊伍'
                       and code ~ '^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$'), 1, '新隊伍的 Team ID 格式');
select pg_temp.expect((select count(*) from public.coach_codes c join public.teams t on t.id = c.team_id
                       where t.name = '新隊伍'), 1, '新隊伍有第一組教練碼');

-- ---------- 沒登入不能呼叫任何動作 ----------
set local role anon;
select set_config('request.jwt.claims', '', true);
select pg_temp.must_fail($q$select public.join_team('ABCD-EFGH')$q$, '沒登入加入球隊');
select pg_temp.must_fail($q$select public.create_coach_code('10000000-0000-0000-0000-00000000000a')$q$, '沒登入產生教練碼');
select pg_temp.must_fail('select * from public.profiles', '沒登入讀 profiles');
reset role;

-- ============================================================
-- v2.2 網站：資料表權限、送出能力表
-- ============================================================
-- 前面直接 insert 的自評和這裡在同一個交易裡（時間一樣），先把它們移到一小時前，才不會被當成「連按兩次」
update public.ability_ratings set submitted_at = submitted_at - interval '1 hour';

set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');   -- A 隊球員，已連到 A1
select pg_temp.st(public.submit_self_rating('10000000-0000-0000-0000-00000000000a', '{"passing": 4, "speed": 5}',
                  '{CM,ST}', '{GK}', 'left', '阿A', '多跑位'), 'ok', '球員送出自己的能力表');
select pg_temp.expect((select count(*) from public.players where id = '20000000-0000-0000-0000-0000000000a1'
                       and good_positions = '{CM,ST}' and bad_positions = '{GK}' and weak_side = 'left'
                       and nickname = '阿A' and message = '多跑位'), 1, '能力表一起更新球員資料');
select pg_temp.expect((select count(*) from public.ability_ratings where player_id = '20000000-0000-0000-0000-0000000000a1'
                       and source = 'form' and scores = '{"passing": 4, "speed": 5}'), 1, '能力表存成一筆 form 紀錄');
select pg_temp.st(public.submit_self_rating('10000000-0000-0000-0000-00000000000a', '{"passing": 3}'),
                  'too_fast', '連按兩次送出');
select pg_temp.st(public.submit_self_rating('10000000-0000-0000-0000-00000000000a', '{"passing": 6}'), 'invalid', '分數超過 5');
select pg_temp.st(public.submit_self_rating('10000000-0000-0000-0000-00000000000a', '{"passing": 2.5}'), 'invalid', '分數不是整數');
select pg_temp.st(public.submit_self_rating('10000000-0000-0000-0000-00000000000a', '{"passing": "5"}'), 'invalid', '分數是文字');
select pg_temp.st(public.submit_self_rating('10000000-0000-0000-0000-00000000000a', '{"Pass; drop": 3}'), 'invalid', '能力名稱格式');
select pg_temp.st(public.submit_self_rating('10000000-0000-0000-0000-00000000000a', '{}'), 'invalid', '沒有任何分數');
select pg_temp.st(public.submit_self_rating('10000000-0000-0000-0000-00000000000a', '[1, 2]'), 'invalid', '分數不是物件');
select pg_temp.st(public.submit_self_rating('10000000-0000-0000-0000-00000000000a', '{"passing": 3}', '{CM}', '{CM}'),
                  'invalid', '同一個位置又擅長又不擅長');
select pg_temp.st(public.submit_self_rating('10000000-0000-0000-0000-00000000000a', '{"passing": 3}', '{"<b>x</b>"}'),
                  'invalid', '位置格式');
select pg_temp.st(public.submit_self_rating('10000000-0000-0000-0000-00000000000a', '{"passing": 3}', '{}', '{}', 'both'),
                  'invalid', '弱腳格式');
select pg_temp.st(public.submit_self_rating('10000000-0000-0000-0000-00000000000b', '{"passing": 3}'),
                  'not_member', '幫沒加入的隊送出');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');   -- 在 A 隊還沒連到名單
select pg_temp.st(public.submit_self_rating('10000000-0000-0000-0000-00000000000a', '{"passing": 3}'),
                  'not_linked', '還沒認領就送出能力表');

-- 資料表權限：TRUNCATE 不受 RLS 管，一定要收回（測沒有被其他表參照的表，才不會因為外鍵而失敗）；Team ID 只能用 reset_team_code 改
select pg_temp.must_fail('truncate public.ability_ratings', '球員清空自評');
select pg_temp.must_fail($q$update public.ability_ratings set scores = '{"passing": 5}'$q$, '改自評的歷史紀錄');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');   -- A 隊教練
select pg_temp.must_fail($q$update public.teams set code = 'AAAA-BBBB' where id = '10000000-0000-0000-0000-00000000000a'$q$,
                         '教練直接改 Team ID');
select pg_temp.must_fail('truncate public.duties', '教練清空裁判任務');
with u as (update public.teams set season = '2026-27' where id = '10000000-0000-0000-0000-00000000000a' returning 1)
select pg_temp.expect((select count(*) from u), 1, '教練改賽季名稱');
with u as (update public.teams set season = '亂改' where id = '10000000-0000-0000-0000-00000000000b' returning 1)
select pg_temp.expect((select count(*) from u), 0, 'A 隊教練改 B 隊');
reset role;

set local role anon;
select set_config('request.jwt.claims', '', true);
select pg_temp.must_fail($q$select public.submit_self_rating('10000000-0000-0000-0000-00000000000a', '{"passing": 3}')$q$,
                         '沒登入送出能力表');
reset role;

-- ============================================================
-- v2.2.1 隱私與帳號：同意政策、下載資料、聯絡我們、刪除名字、刪除帳號
-- ============================================================
insert into public.players (id, team_id, name) values
  ('20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a', '沒有帳號的人');
insert into public.ability_ratings (team_id, player_id, scores, submitted_at) values
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a3', '{"passing": 3}', now() - interval '2 hours');

set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
-- 同意政策：只能透過函式，不能自己改欄位
select pg_temp.st(public.accept_policies('2026-10-05'), 'ok', '同意政策');
select pg_temp.st(public.accept_policies('隨便'), 'invalid', '政策版本格式');
select pg_temp.expect((select count(*) from public.profiles where user_id = auth.uid() and policy_version = '2026-10-05'), 1,
                      '記下同意的版本');
select pg_temp.must_fail($q$update public.profiles set policy_version = '2099-01-01' where user_id = auth.uid()$q$,
                         '自己改同意版本');
-- 下載我的資料
select pg_temp.st(public.export_my_data(), 'ok', '下載我的資料');
select pg_temp.expect((select jsonb_array_length(public.export_my_data() -> 'teams')), 1, '下載的資料有自己的球隊');
-- 聯絡我們：一小時最多 5 則；只看得到自己的；只有網站管理員能改狀態
select pg_temp.st(public.send_contact_message('bug', '第 ' || i || ' 則'), 'ok', '聯絡我們第 ' || i) from generate_series(1, 5) i;
select pg_temp.st(public.send_contact_message('bug', '第 6 則'), 'rate_limited', '一小時超過 5 則');
select pg_temp.st(public.send_contact_message('spam', '內容'), 'invalid', '聯絡類型');
select pg_temp.must_fail($q$insert into public.contact_messages (user_id, category, body)
                          values (auth.uid(), 'bug', '繞過次數限制')$q$, '直接新增聯絡訊息');
select pg_temp.expect((select count(*) from public.contact_messages), 5, '看得到自己的聯絡訊息');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect((select count(*) from public.contact_messages), 0, '球隊管理員看得到別人的聯絡訊息');
with u as (update public.contact_messages set status = 'done' returning 1)
select pg_temp.expect((select count(*) from u), 0, '球隊管理員改聯絡訊息狀態');
select pg_temp.login('00000000-0000-0000-0000-00000000000f');
-- 正式資料庫裡可能已經有真的聯絡訊息，所以只算這次測試新增的（created_at = 這個交易開始的時間）
select pg_temp.expect((select count(*) from public.contact_messages where created_at = now()), 5, '網站管理員看得到所有聯絡訊息');
with u as (update public.contact_messages set status = 'done' where created_at = now() returning 1)
select pg_temp.expect((select count(*) from u), 5, '網站管理員改聯絡訊息狀態');
-- 刪除名單上沒有連結帳號的名字
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.st(public.delete_unlinked_player('20000000-0000-0000-0000-0000000000a3'), 'forbidden', '球員刪名單上的名字');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.st(public.delete_unlinked_player('20000000-0000-0000-0000-0000000000a1'), 'linked', '刪已經連到帳號的名字');
select pg_temp.st(public.delete_unlinked_player('20000000-0000-0000-0000-0000000000b1'), 'forbidden', '刪別隊的名字');
select pg_temp.st(public.delete_unlinked_player('20000000-0000-0000-0000-0000000000a3'), 'ok', '球隊管理員刪沒有帳號的名字');
select pg_temp.expect((select count(*) from public.ability_ratings where player_id = '20000000-0000-0000-0000-0000000000a3'), 0,
                      '刪名字時自評一起刪');
-- 刪除帳號：G 連到 A2，有自評
select pg_temp.login('00000000-0000-0000-0000-000000000010');
select pg_temp.st(public.delete_my_account(), 'ok', '刪除自己的帳號');
reset role;
select pg_temp.expect((select count(*) from auth.users where id = '00000000-0000-0000-0000-000000000010'), 0, '帳號已刪除');
select pg_temp.expect((select count(*) from public.profiles where user_id = '00000000-0000-0000-0000-000000000010'), 0, 'profile 已刪除');
select pg_temp.expect((select count(*) from public.memberships where user_id = '00000000-0000-0000-0000-000000000010'), 0, '成員身分已刪除');
select pg_temp.expect((select count(*) from public.ability_ratings where player_id = '20000000-0000-0000-0000-0000000000a2'), 0, '自評已刪除');
select pg_temp.expect((select count(*) from public.players where id = '20000000-0000-0000-0000-0000000000a2'
                       and name = '球員A2' and nickname = '' and message = '' and good_positions = '{}'), 1,
                      '名單上的名字留著、自我介紹清空');
select pg_temp.expect((select count(*) from public.memberships where player_id = '20000000-0000-0000-0000-0000000000a2'), 0,
                      '名字變成沒有連結帳號');
set local role anon;
select set_config('request.jwt.claims', '', true);
select pg_temp.must_fail('select public.delete_my_account()', '沒登入刪帳號');
select pg_temp.must_fail('select public.export_my_data()', '沒登入下載資料');
reset role;

-- ============================================================
-- v2.3 球員生涯：A 的帳號在 C 隊（上賽季）、E 隊也有身分，自己決定放不放進生涯
-- ============================================================
insert into public.teams (id, code, name, season) values
  ('10000000-0000-0000-0000-00000000000c', 'RLS-TEST-C', 'C 隊', '2025-26'),
  ('10000000-0000-0000-0000-0000000000e0', 'RLS-TEST-E', 'E 隊', '2024-25');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000012', 'rls-i@example.test');   -- 只在 C 隊
insert into public.players (id, team_id, name, jersey_number) values
  ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-00000000000c', '球員C1', '7'),
  ('20000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-00000000000c', '球員C2', null),
  ('20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e0', '球員E1', null);
insert into public.memberships (team_id, user_id, role, player_id) values
  ('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 'player', '20000000-0000-0000-0000-0000000000c1'),
  ('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000012', 'player', '20000000-0000-0000-0000-0000000000c2'),
  ('10000000-0000-0000-0000-0000000000e0', '00000000-0000-0000-0000-00000000000a', 'player', '20000000-0000-0000-0000-0000000000e1');
insert into public.ability_ratings (team_id, player_id, scores, submitted_at) values
  ('10000000-0000-0000-0000-00000000000c', '20000000-0000-0000-0000-0000000000c1', '{"passing": 2}', now() - interval '300 days'),
  ('10000000-0000-0000-0000-00000000000c', '20000000-0000-0000-0000-0000000000c2', '{"passing": 5}', now() - interval '300 days'),
  ('10000000-0000-0000-0000-0000000000e0', '20000000-0000-0000-0000-0000000000e1', '{"passing": 1}', now() - interval '600 days');

create function pg_temp.career_teams(j jsonb) returns bigint language sql as $$
  select count(*) from jsonb_array_elements(coalesce(j -> 'entries', '[]'::jsonb))
$$;
create function pg_temp.career_has(j jsonb, team text) returns bigint language sql as $$
  select count(*) from jsonb_array_elements(coalesce(j -> 'entries', '[]'::jsonb)) e where e ->> 'team_id' = team
$$;
grant execute on function pg_temp.career_teams(jsonb), pg_temp.career_has(jsonb, text) to authenticated;

set local role authenticated;
-- 預設不放進生涯：A 隊管理員只看到 A 隊
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.st(public.get_career('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1'), 'ok', '隊友看生涯');
select pg_temp.expect(pg_temp.career_teams(public.get_career('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1')), 1,
                      '還沒放進生涯時只看得到這一隊');
-- 本人看得到自己所有隊伍
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect(pg_temp.career_teams(public.get_career('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1')), 3,
                      '本人看得到自己所有隊伍');
-- 本人只打開 C 隊
select pg_temp.st(public.set_career_shared('10000000-0000-0000-0000-00000000000c', true), 'ok', '把 C 隊放進生涯');
select pg_temp.st(public.set_career_shared('10000000-0000-0000-0000-00000000000b', true), 'not_member', '開不是自己的隊');
select pg_temp.st(public.set_career_shared('10000000-0000-0000-0000-00000000000c', null), 'invalid', '開關是空值');
select pg_temp.must_fail($q$update public.memberships set career_shared = true where user_id = auth.uid()$q$, '直接改生涯開關');
-- 隊友現在看到 A 隊＋C 隊，看不到 E 隊；C 隊的其他人（C2）不會出現
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect(pg_temp.career_teams(public.get_career('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1')), 2,
                      '放進生涯後隊友看到兩隊');
select pg_temp.expect(pg_temp.career_has(public.get_career('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1'),
                      '10000000-0000-0000-0000-0000000000e0'), 0, '沒打開的 E 隊看不到');
select pg_temp.expect((select count(*) from jsonb_array_elements(
                         public.get_career('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1') -> 'entries') e,
                       jsonb_array_elements(e -> 'ratings') r where (r -> 'scores' ->> 'passing') = '5'), 0, '生涯裡沒有別人的能力表');
-- 隊友還是不能直接讀 C 隊的資料
select pg_temp.expect((select count(*) from public.ability_ratings where team_id = '10000000-0000-0000-0000-00000000000c'), 0,
                      '生涯不會打開別隊的資料表');
-- 不是這隊的人不能看；拿別隊的球員來查也不行
select pg_temp.login('00000000-0000-0000-0000-000000000012');
select pg_temp.st(public.get_career('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1'), 'not_member', '非隊友看生涯');
select pg_temp.st(public.get_career('10000000-0000-0000-0000-00000000000c', '20000000-0000-0000-0000-0000000000a1'), 'not_found', '用自己隊查別隊球員');
-- C 隊的隊友看 C1（同一個帳號）：看得到 C 隊＋打開的隊；A 隊沒打開，所以看不到
select pg_temp.expect(pg_temp.career_has(public.get_career('10000000-0000-0000-0000-00000000000c', '20000000-0000-0000-0000-0000000000c1'),
                      '10000000-0000-0000-0000-00000000000a'), 0, '沒打開的 A 隊在 C 隊看不到');
-- 還沒認領的名字：生涯是空的
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect((select (public.get_career('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2') ->> 'linked')::boolean::int), 0,
                      '沒認領的名字沒有生涯');
-- 關掉之後隊友又看不到
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.st(public.set_career_shared('10000000-0000-0000-0000-00000000000c', false), 'ok', '從生涯拿掉 C 隊');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect(pg_temp.career_teams(public.get_career('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1')), 1,
                      '拿掉之後隊友只看到這一隊');
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
select pg_temp.must_fail($q$select public.get_career('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1')$q$, '沒登入看生涯');
reset role;

-- ============================================================
-- v2.4 組隊：正式陣容 / 草稿、分享連結（不用登入只能看、只看得到背號和位置）
-- ============================================================
create function pg_temp.share_text() returns text language sql as $$
  select public.get_shared_lineup(current_setting('test.tok'))::text
$$;
grant execute on function pg_temp.st(jsonb, text, text), pg_temp.expect(bigint, bigint, text),
                          pg_temp.must_fail(text, text), pg_temp.share_text() to anon;

set local role authenticated;
-- A 隊球員：存草稿可以，存正式陣容不行；放別隊的人、同一人放兩個位置都不行
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select set_config('test.draft', public.save_lineup('10000000-0000-0000-0000-00000000000a', null, 'draft', '我的草稿', 8, '3-3-1',
         '{"GK": "20000000-0000-0000-0000-0000000000a1", "ST": "20000000-0000-0000-0000-0000000000a2", "CB": null}',
         '{GK}', '{20000000-0000-0000-0000-0000000000a1,20000000-0000-0000-0000-0000000000a2}') ->> 'id', true);
select pg_temp.expect((current_setting('test.draft') <> '')::int, 1, '球員存草稿');
select pg_temp.st(public.save_lineup('10000000-0000-0000-0000-00000000000a', null, 'official', '', 8, '3-3-1', '{}'), 'forbidden', '球員存正式陣容');
select pg_temp.st(public.save_lineup('10000000-0000-0000-0000-00000000000a', null, 'draft', '', 8, '3-3-1',
                  '{"GK": "20000000-0000-0000-0000-0000000000b1"}'), 'invalid', '陣容放別隊的人');
select pg_temp.st(public.save_lineup('10000000-0000-0000-0000-00000000000a', null, 'draft', '', 8, '3-3-1',
                  '{"GK": "20000000-0000-0000-0000-0000000000a1", "ST": "20000000-0000-0000-0000-0000000000a1"}'),
                  'invalid', '同一人放兩個位置');
select pg_temp.st(public.save_lineup('10000000-0000-0000-0000-00000000000a', null, 'draft', '', 9, '3-3-1', '{}'), 'invalid', '賽制不是 8 或 11');
select pg_temp.st(public.save_lineup('10000000-0000-0000-0000-00000000000a', null, 'draft', '', 8, '3-3-1', '{"GK": null}', '{ST}'), 'invalid',
                  '鎖定不存在的位置');
select pg_temp.must_fail($q$insert into public.lineups (team_id, owner_id, kind, size, formation)
                            values ('10000000-0000-0000-0000-00000000000a', auth.uid(), 'official', 8, '3-3-1')$q$, '球員直接寫入陣容表');
select pg_temp.must_fail($q$update public.lineups set kind = 'official'$q$, '球員直接把草稿改成正式');
select pg_temp.st(public.save_lineup('10000000-0000-0000-0000-00000000000a', current_setting('test.draft')::uuid, 'official', '', 8, '3-3-1', '{}'),
                  'invalid', '草稿直接改成正式陣容');
select pg_temp.st(public.save_lineup('10000000-0000-0000-0000-00000000000a', current_setting('test.draft')::uuid, 'draft', '改名', 8, '3-2-2', '{}'),
                  'ok', '改自己的草稿');

-- A 隊管理員：存正式陣容；看不到球員的草稿
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select set_config('test.official', public.save_lineup('10000000-0000-0000-0000-00000000000a', null, 'official', '週六先發', 8, '3-3-1',
         '{"GK": "20000000-0000-0000-0000-0000000000a1", "ST": "20000000-0000-0000-0000-0000000000a2"}') ->> 'id', true);
select pg_temp.expect((select count(*) from public.lineups), 1, '管理員只看到正式陣容（看不到別人的草稿）');
select pg_temp.st(public.save_lineup('10000000-0000-0000-0000-00000000000a', current_setting('test.draft')::uuid, 'draft', 'x', 8, '3-3-1', '{}'),
                  'forbidden', '管理員改球員的草稿');
select pg_temp.st(public.delete_lineup(current_setting('test.draft')::uuid), 'forbidden', '管理員刪球員的草稿');

-- 球員看得到正式陣容＋自己的草稿，但不能改、不能刪、不能分享正式陣容
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from public.lineups), 2, '球員看到正式陣容＋自己的草稿');
select pg_temp.st(public.save_lineup('10000000-0000-0000-0000-00000000000a', current_setting('test.official')::uuid, 'official', 'x', 8, '3-3-1', '{}'),
                  'forbidden', '球員改正式陣容');
select pg_temp.st(public.delete_lineup(current_setting('test.official')::uuid), 'forbidden', '球員刪正式陣容');
select pg_temp.st(public.set_lineup_share(current_setting('test.official')::uuid, true), 'forbidden', '球員分享正式陣容');

-- 別隊（只在 C 隊的人）：看不到、存不了 A 隊的陣容
select pg_temp.login('00000000-0000-0000-0000-000000000012');
select pg_temp.expect((select count(*) from public.lineups where team_id = '10000000-0000-0000-0000-00000000000a'), 0, '別隊看 A 隊的陣容');
select pg_temp.st(public.save_lineup('10000000-0000-0000-0000-00000000000a', null, 'draft', '', 8, '3-3-1', '{}'), 'not_member', '別隊存 A 隊的陣容');
select pg_temp.st(public.set_lineup_share(current_setting('test.official')::uuid, true), 'forbidden', '別隊分享 A 隊的陣容');

-- 管理員分享正式陣容（預設不顯示名字）
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select set_config('test.tok', public.set_lineup_share(current_setting('test.official')::uuid, true) ->> 'token', true);
select pg_temp.expect(length(current_setting('test.tok')), 32, '分享碼 32 碼');
reset role;

-- 沒登入：用分享碼看得到背號和位置，看不到名字、球員 id、能力分數；也碰不到資料表和其他函式
set local role anon;
select set_config('request.jwt.claims', '', true);
select pg_temp.st(public.get_shared_lineup(current_setting('test.tok')), 'ok', '沒登入用分享碼看陣容');
select pg_temp.expect((pg_temp.share_text() like '%球員A1%')::int, 0, '預設不顯示名字');
select pg_temp.expect((pg_temp.share_text() like '%20000000-%')::int, 0, '分享頁不帶球員 id');
select pg_temp.expect((pg_temp.share_text() like '%passing%' or pg_temp.share_text() like '%score%')::int, 0, '分享頁不帶能力分數');
select pg_temp.expect((pg_temp.share_text() like '%我的草稿%' or pg_temp.share_text() like '%owner%')::int, 0, '分享頁不帶草稿和是誰排的');
select pg_temp.st(public.get_shared_lineup('not-a-real-token-not-a-real-tok'), 'not_found', '亂打的分享碼');
select pg_temp.st(public.get_shared_lineup(null), 'not_found', '空的分享碼');
select pg_temp.must_fail('select * from public.lineups', '沒登入讀陣容表');
select pg_temp.must_fail($q$select public.save_lineup('10000000-0000-0000-0000-00000000000a', null, 'draft', '', 8, '3-3-1', '{}')$q$, '沒登入存陣容');
select pg_temp.must_fail($q$select public.set_lineup_share(current_setting('test.official')::uuid, false)$q$, '沒登入關分享');
select pg_temp.must_fail('select public.new_share_token()', '沒登入產生分享碼');
reset role;

-- 勾「顯示名字」才有名字；重發後舊連結失效；關掉分享後新連結也失效
set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.st(public.set_lineup_share(current_setting('test.official')::uuid, true, true), 'ok', '改成顯示名字');
select pg_temp.expect((pg_temp.share_text() like '%球員A1%')::int, 1, '勾了顯示名字才看得到名字');
select set_config('test.old', current_setting('test.tok'), true);
select set_config('test.tok', public.set_lineup_share(current_setting('test.official')::uuid, true, false, true) ->> 'token', true);
select pg_temp.expect((current_setting('test.tok') <> current_setting('test.old'))::int, 1, '重發換了新的分享碼');
select pg_temp.st(public.get_shared_lineup(current_setting('test.old')), 'not_found', '重發後舊連結失效');
select pg_temp.st(public.get_shared_lineup(current_setting('test.tok')), 'ok', '重發後新連結可以看');
select pg_temp.st(public.set_lineup_share(current_setting('test.official')::uuid, false), 'ok', '關掉分享');
select pg_temp.st(public.get_shared_lineup(current_setting('test.tok')), 'not_found', '關掉分享後連結失效');
select pg_temp.must_fail('select public.lineup_problem(null, 8, null, null, null, null, null)', '登入的人直接呼叫內部檢查函式');

-- 球員分享自己的草稿；下載資料看得到自己的陣容；離隊後草稿連結失效
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select set_config('test.tok', public.set_lineup_share(current_setting('test.draft')::uuid, true) ->> 'token', true);
select pg_temp.st(public.get_shared_lineup(current_setting('test.tok')), 'ok', '分享自己的草稿');
select pg_temp.expect(jsonb_array_length(public.export_my_data() -> 'lineups'), 1, '下載資料包含自己存的陣容');
reset role;
delete from public.memberships where team_id = '10000000-0000-0000-0000-00000000000a' and user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.st(public.get_shared_lineup(current_setting('test.tok')), 'not_found', '草稿主人離隊後連結失效');

-- 刪帳號：自己的草稿一起刪，管理員的正式陣容留著
insert into public.memberships (team_id, user_id, role, player_id)
values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000012', 'player', null);
set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-000000000012');
select pg_temp.st(public.save_lineup('10000000-0000-0000-0000-00000000000a', null, 'draft', '', 11, '4-3-3', '{}'), 'ok', '新隊友存草稿');
select pg_temp.st(public.delete_my_account(), 'ok', '新隊友刪帳號');
reset role;
select pg_temp.expect((select count(*) from public.lineups where owner_id is null and kind = 'draft'), 0, '刪帳號後沒有留下無主草稿');
select pg_temp.expect((select count(*) from public.lineups where kind = 'official' and team_id = '10000000-0000-0000-0000-00000000000a'), 1, '正式陣容還在');

-- ============================================================
-- v2.5 比賽列表＋出賽登記（F7）
-- ============================================================
-- 準備：A1 重新連回帳號 a（上面測離隊時刪掉了）；新隊友 13 連到新球員 A3（最後測刪帳號）
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000013', 'rls-13@example.test'),
                                         ('00000000-0000-0000-0000-000000000014', 'rls-14@example.test');   -- 只在 B 隊
insert into public.players (id, team_id, name) values
  ('20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a', '球員A3');
insert into public.memberships (team_id, user_id, role, player_id) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'player', '20000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000013', 'player', '20000000-0000-0000-0000-0000000000a3'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000014', 'player', null);
grant execute on function pg_temp.st(jsonb, text, text), pg_temp.login(text) to authenticated;

set local role authenticated;
-- 建立比賽：只有球隊管理員
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.st(public.save_match('10000000-0000-0000-0000-00000000000a', null, '對手隊', now() + interval '2 days'),
                  'forbidden', '球員建立比賽');
select pg_temp.must_fail($q$insert into public.matches (team_id, opponent, kickoff)
                          values ('10000000-0000-0000-0000-00000000000a', '偷建的', now())$q$, '球員直接寫比賽表');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select set_config('test.match', public.save_match('10000000-0000-0000-0000-00000000000a', null, '對手隊',
         now() + interval '2 days', now() + interval '2 days' - interval '40 minutes', '操場', '白', 11) ->> 'id', true);
select pg_temp.expect((current_setting('test.match') <> '')::int, 1, '管理員建立比賽');
select pg_temp.st(public.save_match('10000000-0000-0000-0000-00000000000a', null, '  ', now()), 'invalid', '比賽沒填對手');
select pg_temp.st(public.save_match('10000000-0000-0000-0000-00000000000a', null, 'x', now(), now() + interval '1 hour'),
                  'invalid', '集合時間在開賽之後');
select pg_temp.st(public.save_match('10000000-0000-0000-0000-00000000000a', null, 'x', now(), null, '', '', 9),
                  'invalid', '比賽賽制不是 8 或 11');
select pg_temp.st(public.save_match('10000000-0000-0000-0000-00000000000a', null, 'x', now(), null, '', '', 11, '', 2, null),
                  'invalid', '比分只填一邊');
-- 已經開賽的比賽（測鎖定用）
select set_config('test.past', public.save_match('10000000-0000-0000-0000-00000000000a', null, '昨天的對手',
         now() - interval '1 day') ->> 'id', true);
select pg_temp.must_fail('select public.match_problem(null, null, null, null, null, null, null, null, null)',
                         '登入的人直接呼叫比賽檢查函式');

-- 出賽登記：球員登記自己；沒認領的人不行；不能幫隊友登記；不能直接寫表
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from public.matches), 2, '球員看得到本隊的比賽');
select pg_temp.st(public.set_attendance(current_setting('test.match')::uuid, 'in'), 'ok', '球員登記自己出席');
select pg_temp.st(public.set_attendance(current_setting('test.match')::uuid, 'maybe'), 'invalid', '出席狀態亂填');
select pg_temp.st(public.set_attendance(current_setting('test.match')::uuid, 'in', '', '20000000-0000-0000-0000-0000000000a2'),
                  'forbidden', '球員幫隊友登記');
select pg_temp.st(public.set_attendance(current_setting('test.past')::uuid, 'in'), 'closed', '開賽後球員改登記');
select pg_temp.must_fail($q$insert into public.attendance (match_id, player_id, team_id, status)
                          values (current_setting('test.match')::uuid, '20000000-0000-0000-0000-0000000000a2',
                                  '10000000-0000-0000-0000-00000000000a', 'in')$q$, '球員直接寫出席表');
select pg_temp.must_fail($q$update public.attendance set status = 'out'$q$, '球員直接改出席表');
select pg_temp.st(public.delete_match(current_setting('test.match')::uuid), 'forbidden', '球員刪比賽');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.st(public.set_attendance(current_setting('test.match')::uuid, 'in'), 'not_linked', '還沒認領的隊員登記出席');

-- 球隊管理員：幫還沒註冊的隊友登記、開賽後也能更正
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.st(public.set_attendance(current_setting('test.match')::uuid, 'out', '出國', '20000000-0000-0000-0000-0000000000a2'),
                  'ok', '管理員幫隊友登記請假');
select pg_temp.st(public.set_attendance(current_setting('test.past')::uuid, 'in', '', '20000000-0000-0000-0000-0000000000a1'),
                  'ok', '管理員開賽後更正登記');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from public.attendance where match_id = current_setting('test.match')::uuid), 2,
                      '隊友看得到全隊的出席登記');

-- 別隊（只在 B 隊的人）：看不到、登記不了、建不了
select pg_temp.login('00000000-0000-0000-0000-000000000014');
select pg_temp.expect((select count(*) from public.matches where team_id = '10000000-0000-0000-0000-00000000000a'), 0, '別隊看 A 隊的比賽');
select pg_temp.expect((select count(*) from public.attendance where team_id = '10000000-0000-0000-0000-00000000000a'), 0, '別隊看 A 隊的出席');
select pg_temp.st(public.set_attendance(current_setting('test.match')::uuid, 'in', '', '20000000-0000-0000-0000-0000000000a1'),
                  'not_found', '別隊登記 A 隊的比賽');
select pg_temp.st(public.save_match('10000000-0000-0000-0000-00000000000a', null, 'x', now()), 'not_member', '別隊建立 A 隊的比賽');
select pg_temp.st(public.delete_match(current_setting('test.match')::uuid), 'forbidden', '別隊刪 A 隊的比賽');
reset role;

-- 從聯賽賽程一鍵建立（還沒設定聯賽隊名 → 不行；設定後 → 對手是另一隊；同一場只建一次）
set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.st(public.match_from_fixture('10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000a1'),
                  'invalid', '沒設定聯賽隊名就從聯賽建立');
update public.teams set league_name = '甲' where id = '10000000-0000-0000-0000-00000000000a';
select set_config('test.fx', public.match_from_fixture('10000000-0000-0000-0000-00000000000a',
         '30000000-0000-0000-0000-0000000000a1') ->> 'id', true);
select pg_temp.expect((select count(*) from public.matches where id = current_setting('test.fx')::uuid and opponent = '乙'
                         and kickoff = timestamptz '2026-10-16 19:00+08'), 1, '從聯賽建立的對手和時間');
select pg_temp.expect((public.match_from_fixture('10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000a1')
                         ->> 'id' = current_setting('test.fx'))::int, 1, '同一場聯賽只建一次');
select pg_temp.st(public.match_from_fixture('10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000b1'),
                  'not_found', '從別隊的聯賽賽程建立');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.st(public.match_from_fixture('10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000a1'),
                  'forbidden', '球員從聯賽建立比賽');

-- 陣容綁定比賽：只能排出席的人、賽制要一樣
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.st(public.save_lineup('10000000-0000-0000-0000-00000000000a', null, 'official', '', 11, '4-3-3',
         '{"GK": "20000000-0000-0000-0000-0000000000a2"}', '{}', '{}', current_setting('test.match')::uuid),
         'invalid', '綁定比賽的陣容排了請假的人');
select pg_temp.st(public.save_lineup('10000000-0000-0000-0000-00000000000a', null, 'official', '', 8, '3-3-1',
         '{"GK": "20000000-0000-0000-0000-0000000000a1"}', '{}', '{}', current_setting('test.match')::uuid),
         'invalid', '綁定比賽的陣容賽制不一樣');
select pg_temp.st(public.save_lineup('10000000-0000-0000-0000-0000000000b0', null, 'draft', '', 11, '4-3-3',
         '{}', '{}', '{}', current_setting('test.match')::uuid), 'not_member', '綁定比賽時隊伍不對');
select set_config('test.bound', public.save_lineup('10000000-0000-0000-0000-00000000000a', null, 'official', '對手隊先發', 11, '4-3-3',
         '{"GK": "20000000-0000-0000-0000-0000000000a1", "ST": null}', '{}', '{}', current_setting('test.match')::uuid) ->> 'id', true);
select pg_temp.expect((select count(*) from public.lineups where id = current_setting('test.bound')::uuid
                         and match_id = current_setting('test.match')::uuid), 1, '綁定比賽的陣容存好了');
select pg_temp.st(public.save_match('10000000-0000-0000-0000-00000000000a', current_setting('test.match')::uuid, '對手隊',
         now() + interval '2 days', null, '', '', 8), 'invalid', '有陣容綁定時改比賽賽制');
select set_config('test.tok', public.set_lineup_share(current_setting('test.bound')::uuid, true) ->> 'token', true);
reset role;
set local role anon;
select pg_temp.expect((public.get_shared_lineup(current_setting('test.tok')) -> 'match' ->> 'opponent' = '對手隊')::int, 1,
                      '分享頁帶綁定比賽的對手');
select pg_temp.must_fail('select * from public.matches', '沒登入讀比賽表');
select pg_temp.must_fail('select * from public.attendance', '沒登入讀出席表');
select pg_temp.must_fail($q$select public.set_attendance(current_setting('test.match')::uuid, 'in')$q$, '沒登入登記出席');
reset role;

-- 下載資料有出席紀錄；刪帳號後出席紀錄一起刪
set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from jsonb_array_elements(public.export_my_data() -> 'teams') t
                        cross join jsonb_array_elements(t -> 'attendance') a), 2, '下載資料包含自己的出席紀錄（自己登記＋管理員更正）');
select pg_temp.login('00000000-0000-0000-0000-000000000013');
select pg_temp.st(public.set_attendance(current_setting('test.match')::uuid, 'in'), 'ok', '新隊友登記出席');
select pg_temp.st(public.delete_my_account(), 'ok', '新隊友刪帳號');
reset role;
select pg_temp.expect((select count(*) from public.attendance where player_id = '20000000-0000-0000-0000-0000000000a3'), 0,
                      '刪帳號後出席紀錄一起刪');

-- 刪比賽：出席紀錄跟著刪，綁定的陣容留著、變回不綁定
set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.st(public.delete_match(current_setting('test.match')::uuid), 'ok', '管理員刪比賽');
reset role;
select pg_temp.expect((select count(*) from public.attendance where match_id = current_setting('test.match')::uuid), 0,
                      '刪比賽後出席紀錄一起刪');
select pg_temp.expect((select count(*) from public.lineups where id = current_setting('test.bound')::uuid and match_id is null), 1,
                      '刪比賽後陣容變回不綁定');

-- ============================================================
-- v2.6 隊伍聊天室（F6）
-- ============================================================
-- 準備：新隊友 15（最後測刪帳號）
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000015', 'rls-15@example.test');
insert into public.memberships (team_id, user_id, role, player_id)
values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000015', 'player', null);

set local role authenticated;
-- 球員：發一般貼文、回覆、編輯自己的；不能發筆記／戰術、不能置頂、不能附草稿、不能直接寫表
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select set_config('test.msg', public.post_message('10000000-0000-0000-0000-00000000000a', '週六誰要去練球？') ->> 'id', true);
select pg_temp.expect((current_setting('test.msg') <> '')::int, 1, '球員發主貼文');
select pg_temp.st(public.post_message('10000000-0000-0000-0000-00000000000a', '偷發戰術', 'tactic'), 'forbidden', '球員發戰術');
select pg_temp.st(public.post_message('10000000-0000-0000-0000-00000000000a', '偷發筆記', 'note'), 'forbidden', '球員發筆記');
select pg_temp.st(public.post_message('10000000-0000-0000-0000-00000000000a', '   '), 'invalid', '發空白訊息');
select pg_temp.st(public.post_message('10000000-0000-0000-0000-00000000000a', repeat('長', 2001)), 'invalid', '訊息超過 2000 字');
select pg_temp.st(public.post_message('10000000-0000-0000-0000-00000000000a', '看我的草稿', 'general', null,
                  current_setting('test.draft')::uuid), 'invalid', '附草稿陣容');
select pg_temp.must_fail($q$insert into public.messages (team_id, author_id, body)
                          values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '偷寫')$q$,
                         '球員直接寫訊息表');
select pg_temp.must_fail($q$update public.messages set body = '偷改'$q$, '球員直接改訊息表');
select pg_temp.st(public.set_pinned(current_setting('test.msg')::uuid, true), 'forbidden', '球員置頂');
select set_config('test.reply', public.post_message('10000000-0000-0000-0000-00000000000a', '我可以', 'general',
                  current_setting('test.msg')::uuid) ->> 'id', true);
select pg_temp.expect((current_setting('test.reply') <> '')::int, 1, '球員回覆');
select pg_temp.st(public.post_message('10000000-0000-0000-0000-00000000000a', '回覆的回覆', 'general',
                  current_setting('test.reply')::uuid), 'invalid', '回覆回覆');
select pg_temp.st(public.edit_message(current_setting('test.msg')::uuid, '週六下午誰要去練球？'), 'ok', '作者編輯自己的訊息');
select pg_temp.expect((select count(*) from public.messages where id = current_setting('test.msg')::uuid
                         and edited_at is not null and body = '週六下午誰要去練球？'), 1, '編輯後標記已編輯');
select pg_temp.st(public.mark_chat_read('10000000-0000-0000-0000-00000000000a'), 'ok', '標記已讀');
select pg_temp.expect((select count(*) from public.chat_reads), 1, '看得到自己讀到哪裡');
select pg_temp.must_fail($q$insert into public.chat_reads (team_id, user_id)
                          values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a')$q$,
                         '直接寫已讀表');
select pg_temp.must_fail('select public.message_problem(null)', '登入的人直接呼叫訊息檢查函式');

-- 隊友：看得到全隊訊息，但不能改、不能刪別人的；看不到別人讀到哪裡
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from public.messages where team_id = '10000000-0000-0000-0000-00000000000a'), 2,
                      '隊友看得到全隊訊息');
select pg_temp.st(public.edit_message(current_setting('test.msg')::uuid, '亂改'), 'forbidden', '編輯別人的訊息');
select pg_temp.st(public.delete_message(current_setting('test.msg')::uuid), 'forbidden', '球員刪別人的訊息');
select pg_temp.expect((select count(*) from public.chat_reads), 0, '看別人讀到哪裡');
-- c 在 B 隊是管理員：不能附 A 隊的陣容
select pg_temp.st(public.post_message('10000000-0000-0000-0000-00000000000b', 'B 隊戰術', 'tactic', null,
                  current_setting('test.bound')::uuid), 'invalid', '附別隊的陣容');

-- 球隊管理員：發戰術附正式陣容、置頂、刪任何訊息、不能編輯別人的
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select set_config('test.tac', public.post_message('10000000-0000-0000-0000-00000000000a', '週六先發這樣排', 'tactic', null,
                  current_setting('test.bound')::uuid) ->> 'id', true);
select pg_temp.expect((current_setting('test.tac') <> '')::int, 1, '管理員發戰術附正式陣容');
select pg_temp.st(public.set_pinned(current_setting('test.tac')::uuid, true), 'ok', '管理員置頂');
select pg_temp.st(public.set_pinned(current_setting('test.reply')::uuid, true), 'invalid', '置頂回覆');
select pg_temp.st(public.post_message('10000000-0000-0000-0000-00000000000a', '回覆不能有類型', 'note',
                  current_setting('test.msg')::uuid), 'invalid', '回覆有類型');
select pg_temp.st(public.edit_message(current_setting('test.msg')::uuid, '管理員改字'), 'forbidden', '管理員編輯別人的訊息');
select pg_temp.st(public.delete_message(current_setting('test.reply')::uuid), 'ok', '管理員刪任何訊息');
select pg_temp.expect((select count(*) from public.messages where id = current_setting('test.reply')::uuid
                         and body = '' and deleted_at is not null), 1, '刪除後內容清空');
select pg_temp.st(public.edit_message(current_setting('test.reply')::uuid, '復活'), 'not_found', '編輯已刪除的訊息');
-- 置頂最多 5 則
select pg_temp.expect((select count(*) from generate_series(1, 4) g
                        where public.set_pinned((public.post_message('10000000-0000-0000-0000-00000000000a',
                                                  '公告 ' || g, 'note') ->> 'id')::uuid, true) ->> 'status' = 'ok'), 4,
                      '再置頂 4 則');
select pg_temp.st(public.set_pinned((public.post_message('10000000-0000-0000-0000-00000000000a', '第 6 則', 'note')
                  ->> 'id')::uuid, true), 'invalid', '置頂超過 5 則');
select pg_temp.st(public.set_pinned(current_setting('test.tac')::uuid, false), 'ok', '取消置頂');
select pg_temp.expect((select count(*) from public.messages where pinned_at is not null
                         and team_id = '10000000-0000-0000-0000-00000000000a'), 4, '取消後剩 4 則置頂');

-- Discord：只有管理員設定；網址怎樣都讀不到；新主貼文排進通知、回覆不會
select pg_temp.st(public.set_chat_discord('10000000-0000-0000-0000-00000000000a', 'https://evil.example/api/webhooks/1/x'),
                  'invalid', '亂填 Discord 網址');
select pg_temp.st(public.set_chat_discord('10000000-0000-0000-0000-00000000000a',
                  'https://discord.com/api/webhooks/123456789012345678/rls-test-token-abcdefghijklmnop'), 'ok', '管理員設定 Discord');
select pg_temp.expect(((public.get_chat_discord('10000000-0000-0000-0000-00000000000a') ->> 'configured')::boolean)::int, 1,
                      '管理員看得到已設定 Discord');
select pg_temp.expect((public.get_chat_discord('10000000-0000-0000-0000-00000000000a')::text like '%webhooks%')::int, 0,
                      '設定 Discord 不回傳網址');
select pg_temp.must_fail('select * from public.chat_discord', '管理員讀 Discord 網址');
select pg_temp.must_fail('select public.notify_discord()', '登入的人直接呼叫 Discord 觸發器');
select set_config('test.dc', public.post_message('10000000-0000-0000-0000-00000000000a', '明天集合 6 點', 'note') ->> 'id', true);
select pg_temp.st(public.post_message('10000000-0000-0000-0000-00000000000a', '收到', 'general',
                  current_setting('test.dc')::uuid), 'ok', '回覆有 Discord 的隊伍');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.st(public.set_chat_discord('10000000-0000-0000-0000-00000000000a', ''), 'forbidden', '球員關掉 Discord');
select pg_temp.st(public.get_chat_discord('10000000-0000-0000-0000-00000000000a'), 'forbidden', '球員查 Discord 設定');
reset role;
select pg_temp.expect((select count(*) from net.http_request_queue
                        where url = 'https://discord.com/api/webhooks/123456789012345678/rls-test-token-abcdefghijklmnop'), 1,
                      '新主貼文排進 Discord 通知、回覆不會');

-- 別隊、沒登入：看不到、發不了、刪不了
set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-000000000014');
select pg_temp.expect((select count(*) from public.messages where team_id = '10000000-0000-0000-0000-00000000000a'), 0,
                      '別隊看 A 隊的訊息');
select pg_temp.st(public.post_message('10000000-0000-0000-0000-00000000000a', '亂入'), 'not_member', '別隊在 A 隊發文');
select pg_temp.st(public.delete_message(current_setting('test.msg')::uuid), 'not_found', '別隊刪 A 隊的訊息');
select pg_temp.st(public.set_chat_discord('10000000-0000-0000-0000-00000000000a', ''), 'not_member', '別隊改 A 隊的 Discord');
reset role;
set local role anon;
select pg_temp.must_fail('select * from public.messages', '沒登入讀訊息表');
select pg_temp.must_fail('select * from public.chat_reads', '沒登入讀已讀表');
select pg_temp.must_fail($q$select public.post_message('10000000-0000-0000-0000-00000000000a', 'x')$q$, '沒登入發文');
reset role;

-- 洗版：1 分鐘內最多 10 則；下載資料有自己的訊息；刪帳號後訊息清空；作者刪自己的之後不能再回覆
set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-000000000015');
select pg_temp.expect((select count(*) from generate_series(1, 10) g
                        where public.post_message('10000000-0000-0000-0000-00000000000a', '洗版 ' || g) ->> 'status' = 'ok'), 10,
                      '1 分鐘內發 10 則');
select pg_temp.st(public.post_message('10000000-0000-0000-0000-00000000000a', '第 11 則'), 'too_fast', '1 分鐘內發太多則');
select pg_temp.st(public.delete_my_account(), 'ok', '發過訊息的隊友刪帳號');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect(jsonb_array_length(public.export_my_data() -> 'chat_messages'), 1,
                      '下載資料包含自己的聊天訊息（被刪掉的回覆不算）');
select pg_temp.st(public.delete_message(current_setting('test.msg')::uuid), 'ok', '作者刪自己的訊息');
select pg_temp.st(public.post_message('10000000-0000-0000-0000-00000000000a', '還有人嗎', 'general',
                  current_setting('test.msg')::uuid), 'invalid', '回覆已刪除的訊息');
reset role;
select pg_temp.expect((select count(*) from public.messages where body like '洗版%'), 0, '刪帳號後訊息清空');
select pg_temp.expect((select count(*) from public.messages where author_id = '00000000-0000-0000-0000-000000000015'), 0,
                      '刪帳號後訊息沒有作者');

-- ============================================================
-- v2.6.1 名單管理（add_player、edit_player）
-- ============================================================
set local role authenticated;
-- 球員：不能新增、不能改別人（也不能改自己）的姓名／背號／隊長
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.st(public.add_player('10000000-0000-0000-0000-00000000000a', '偷加的人'), 'forbidden', '球員新增球員');
select pg_temp.st(public.edit_player('20000000-0000-0000-0000-0000000000a1', '我自己', '10', 'C'), 'forbidden', '球員改自己的背號和隊長');
select pg_temp.must_fail('select public.roster_problem(null, null, null, null, null, null, null, null)', '登入的人直接呼叫名單檢查函式');

-- 球隊管理員：新增、改名、背號、隊長；擋重複
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select set_config('test.np', public.add_player('10000000-0000-0000-0000-00000000000a', '  新球員甲  ', '07', 'C') ->> 'id', true);
select pg_temp.expect((select count(*) from public.players where id = current_setting('test.np')::uuid
                         and name = '新球員甲' and jersey_number = '7' and badge = 'C'), 1, '管理員新增球員（背號 07 存成 7）');
select pg_temp.st(public.add_player('10000000-0000-0000-0000-00000000000a', '新球員甲'), 'taken', '新增重複的名字');
select pg_temp.st(public.add_player('10000000-0000-0000-0000-00000000000a', '新球員乙', '7'), 'taken', '新增重複的背號');
select pg_temp.st(public.add_player('10000000-0000-0000-0000-00000000000a', '新球員乙', null, 'C'), 'taken', '新增第二位隊長');
select pg_temp.st(public.add_player('10000000-0000-0000-0000-00000000000a', '新球員乙', '十號'), 'invalid', '背號不是數字');
select pg_temp.st(public.add_player('10000000-0000-0000-0000-00000000000a', '新球員乙', null, 'X'), 'invalid', '亂填隊長標記');
select pg_temp.st(public.add_player('10000000-0000-0000-0000-00000000000a', '   '), 'invalid', '新增空白名字');
select set_config('test.np2', public.add_player('10000000-0000-0000-0000-00000000000a', '新球員乙', '', 'VC') ->> 'id', true);
select pg_temp.expect((select count(*) from public.players where id = current_setting('test.np2')::uuid
                         and jersey_number is null and badge = 'VC'), 1, '背號空白 = 還沒決定、新增副隊長');
select pg_temp.st(public.edit_player(current_setting('test.np2')::uuid, '新球員乙', '7', 'VC'), 'taken', '改成別人的背號');
select pg_temp.st(public.edit_player(current_setting('test.np2')::uuid, '新球員乙', null, 'C'), 'taken', '改成第二位隊長');
-- 隊長交接：先拿掉原本的，再給新的
select pg_temp.st(public.edit_player(current_setting('test.np')::uuid, '新球員甲', '7', null), 'ok', '拿掉隊長');
select pg_temp.st(public.edit_player(current_setting('test.np2')::uuid, '新球員乙', '10', 'C'), 'ok', '交接隊長、改背號');
select pg_temp.st(public.edit_player(current_setting('test.np2')::uuid, '新球員乙', '10', 'C'), 'ok', '沒改東西再存一次');
-- 已經連到帳號的球員也能改（姓名、背號、隊長）；同一個人可以是隊長也是球隊管理員（兩個欄位互不相干）
select pg_temp.st(public.edit_player('20000000-0000-0000-0000-0000000000a1', '球員A1改名', '99', 'VC'), 'ok', '改已連帳號的球員');
reset role;
update public.memberships set role = 'coach'
 where team_id = '10000000-0000-0000-0000-00000000000a' and user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect((select count(*) from public.players p join public.memberships m on m.player_id = p.id
                        where p.id = '20000000-0000-0000-0000-0000000000a1' and p.badge = 'VC' and m.role = 'coach'), 1,
                      '副隊長同時是球隊管理員');
update public.memberships set role = 'player'
 where team_id = '10000000-0000-0000-0000-00000000000a' and user_id = '00000000-0000-0000-0000-00000000000a';
-- 舊資料本來就重複時（v1 匯入）：只改名字不會被擋
update public.players set jersey_number = '99' where id = current_setting('test.np')::uuid;
set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.st(public.edit_player(current_setting('test.np')::uuid, '新球員甲改名', '99', null), 'ok', '舊資料背號重複、只改名字');

-- 別隊：不能新增、改不到（連有沒有這個人都不知道）；c 在 B 隊是管理員也一樣
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.st(public.add_player('10000000-0000-0000-0000-00000000000a', '亂入'), 'forbidden', 'A 隊球員（B 隊管理員）新增 A 隊球員');
select pg_temp.st(public.edit_player('20000000-0000-0000-0000-0000000000b1', '球員B1', '5', null), 'ok', 'B 隊管理員改 B 隊球員');
select pg_temp.login('00000000-0000-0000-0000-000000000014');
select pg_temp.st(public.edit_player(current_setting('test.np')::uuid, '亂改', null, null), 'not_found', '別隊改 A 隊球員');
select pg_temp.st(public.add_player('10000000-0000-0000-0000-00000000000a', '亂入'), 'forbidden', '別隊新增 A 隊球員');
reset role;
set local role anon;
select pg_temp.must_fail($q$select public.add_player('10000000-0000-0000-0000-00000000000a', 'x')$q$, '沒登入新增球員');
select pg_temp.must_fail($q$select public.edit_player('20000000-0000-0000-0000-0000000000a1', 'x')$q$, '沒登入改球員');
reset role;

select 'RLS OK' as result;
rollback;
