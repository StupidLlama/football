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

select 'RLS OK' as result;
rollback;
