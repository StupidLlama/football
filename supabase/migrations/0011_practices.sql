-- ============================================================
-- v2.7 練習行事曆與出席（F11）
--   1. practices：一次練習（開始、結束、集合時間、地點、標題、內容／要帶的東西、備註）
--      - 固定練習（每週幾、到哪天）在建立時就展開成一筆一筆，同一批共用 series_id：
--        單次可以單獨改、出席記在每一筆上；「刪掉這個系列之後的練習」用 series_id 找
--      - 狀態不存欄位：開始前 = 即將進行；過了開始時間 = 已結束（web/lib/practices.ts 算）
--   2. practice_attendance：球員對一次練習的回覆（出席 in / 請假 out）；沒有資料 = 還沒回覆
--   3. 出席規則抽成共用的小工具 attendance_who（比賽和練習一起用，「兩本點名簿、一本規則手冊」）：
--      只能選出席／請假／清掉、備註 40 字、球員要先認領自己且只能登記自己、
--      開始後球員就鎖住、球隊管理員可以幫任何人登記和隨時更正。
--      set_attendance（0008，比賽）改成用這個小工具，行為完全不變。
--   4. save_practice（一次）、save_practices（一批：固定練習或 AI 匯入，全部成功或全部不建立）、
--      delete_practice（這一次，或這個系列從這次開始之後的）：只有球隊管理員
--   5. 通知：建立或修改時可以勾「發到聊天室」「推到 Discord」，兩個各自決定。
--      聊天室有新主貼文時 0009 的觸發器本來就會自動推 Discord；只勾聊天室時要讓它這次不推，
--      所以 notify_discord 多看一個只在這次交易有效的設定 app.skip_discord（一般聊天貼文不受影響）。
--      通知的文字由網站組好傳進來（網站知道使用者的時區和日期格式），內容規則跟聊天訊息一樣。
--   6. export_my_data / delete_my_account 加上練習出席
--
-- 規則：已經執行過的檔案不要改；要改就新增 0012_xxx.sql。
-- ============================================================

-- ---------- 1. 練習 ----------
create table public.practices (
    id         uuid primary key default gen_random_uuid(),
    team_id    uuid not null references public.teams(id) on delete cascade,
    starts_at  timestamptz not null,                                          -- 開始時間
    ends_at    timestamptz not null,                                          -- 結束時間
    meet_at    timestamptz,                                                   -- 集合時間（選填）
    location   text not null default '' check (char_length(location) <= 60),
    title      text not null default '' check (char_length(title) <= 20),     -- 空的 = 畫面上顯示「練習」
    content    text not null default '' check (char_length(content) <= 500), -- 內容、要帶的東西
    note       text not null default '' check (char_length(note) <= 200),
    series_id  uuid,                                                          -- 同一批固定練習共用；單次的是空的
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (ends_at > starts_at),
    check (meet_at is null or meet_at <= starts_at)
);
create index practices_team_idx on public.practices(team_id, starts_at);
create index practices_series_idx on public.practices(series_id) where series_id is not null;

alter table public.practices enable row level security;
revoke all on public.practices from anon, authenticated;
grant select on public.practices to authenticated;      -- 寫入只能透過下面的函式

create policy practices_select on public.practices
    for select to authenticated using (public.is_member(team_id));

-- ---------- 2. 練習出席 ----------
create table public.practice_attendance (
    practice_id uuid not null references public.practices(id) on delete cascade,
    player_id   uuid not null references public.players(id) on delete cascade,
    team_id     uuid not null references public.teams(id) on delete cascade,   -- 給 RLS 用
    status      text not null check (status in ('in', 'out')),
    note        text not null default '' check (char_length(note) <= 40),      -- 例如「會晚到」，全隊看得到
    updated_by  uuid references auth.users(id) on delete set null,
    updated_at  timestamptz not null default now(),
    primary key (practice_id, player_id)
);
create index practice_attendance_team_idx on public.practice_attendance(team_id);
create index practice_attendance_player_idx on public.practice_attendance(player_id);

alter table public.practice_attendance enable row level security;
revoke all on public.practice_attendance from anon, authenticated;
grant select on public.practice_attendance to authenticated;   -- 寫入只能透過 set_practice_attendance

-- 全隊看得到彼此的登記（跟比賽一樣）
create policy practice_attendance_select on public.practice_attendance
    for select to authenticated using (public.is_member(team_id));

-- ---------- 小工具：檢查練習內容（只給下面的函式用）----------
-- 回傳 null = 沒問題；有問題就回傳給人看的一句話
create or replace function public.practice_problem(starts_at timestamptz, ends_at timestamptz, meet_at timestamptz,
                                                   location text, title text, content text, note text)
returns text
language plpgsql stable
set search_path = public
as $$
begin
    if starts_at is null then return '請填開始時間'; end if;
    if ends_at is null then return '請填結束時間'; end if;
    if ends_at <= starts_at then return '結束時間要在開始之後'; end if;
    if ends_at - starts_at > interval '8 hours' then return '一次練習最長 8 小時'; end if;
    -- 擋掉打錯年份（AI 匯入最常見）：太久以前或太久以後
    if starts_at < now() - interval '366 days' or starts_at > now() + interval '731 days' then
        return '日期離今天太遠了，年份是不是打錯了？';
    end if;
    if meet_at is not null and meet_at > starts_at then return '集合時間要在開始之前'; end if;
    if meet_at is not null and starts_at - meet_at > interval '6 hours' then return '集合時間離開始太久了'; end if;
    if char_length(btrim(coalesce(location, ''))) > 60 then return '地點最多 60 個字'; end if;
    if char_length(btrim(coalesce(title, ''))) > 20 then return '標題最多 20 個字'; end if;
    if char_length(btrim(coalesce(content, ''))) > 500 then return '內容最多 500 個字'; end if;
    if char_length(btrim(coalesce(note, ''))) > 200 then return '備註最多 200 個字'; end if;
    return null;
end $$;

-- ---------- 3. 共用的出席規則（比賽、練習都用；只給下面的函式用）----------
-- 回傳 {"status": "ok", "player": 要登記的球員 id}，或是 {"status": 問題}。
-- done：比賽填了比分這類「提早結束」的情況；what：'比賽' 或 '練習'，用在鎖住時的說明
create or replace function public.attendance_who(team uuid, starts timestamptz, done boolean, answer text,
                                                 note text, player uuid, what text)
returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
    uid uuid := auth.uid();
    pid uuid;
    manager boolean;
begin
    if answer is not null and answer not in ('in', 'out') then
        return jsonb_build_object('status', 'invalid', 'detail', '只能選出席或請假');
    end if;
    if char_length(coalesce(note, '')) > 40 then
        return jsonb_build_object('status', 'invalid', 'detail', '備註最多 40 個字');
    end if;
    manager := public.can_manage(team);

    if player is null then
        select ms.player_id into pid from public.memberships ms where ms.team_id = team and ms.user_id = uid;
        if pid is null then return jsonb_build_object('status', 'not_linked'); end if;
    else
        pid := player;
        if not exists (select 1 from public.players p where p.id = pid and p.team_id = team) then
            return jsonb_build_object('status', 'not_found');
        end if;
        if not manager and not public.is_own_player(pid) then return jsonb_build_object('status', 'forbidden'); end if;
    end if;

    if not manager and (now() >= starts or coalesce(done, false)) then
        -- 比賽沿用 status.ts 的 closed 訊息；練習另外說明
        if what = '練習' then
            return jsonb_build_object('status', 'closed', 'detail', '練習已經開始，不能再改出席；需要更正請找球隊管理員');
        end if;
        return jsonb_build_object('status', 'closed');
    end if;
    return jsonb_build_object('status', 'ok', 'player', pid);
end $$;

-- ---------- 4. 比賽出賽登記改用共用規則（參數、回傳、行為都跟 0008 一樣）----------
create or replace function public.set_attendance(match uuid, answer text, note text default '',
                                                 player uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    uid uuid := auth.uid();
    m public.matches;
    who jsonb;
    pid uuid;
begin
    if uid is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    select * into m from public.matches x where x.id = set_attendance.match;
    if not found or not public.is_member(m.team_id) and not public.is_admin() then
        return jsonb_build_object('status', 'not_found');
    end if;
    who := public.attendance_who(m.team_id, m.kickoff, m.our_score is not null, answer, note, player, '比賽');
    if who ->> 'status' <> 'ok' then return who; end if;
    pid := (who ->> 'player')::uuid;

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

-- ---------- 5. 聊天室觸發器：多一個「這次不要推 Discord」的開關 ----------
-- 跟 0009 一樣，只多了最前面兩行；app.skip_discord 只有 practice_announce 會在同一個交易裡暫時打開
create or replace function public.notify_discord()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
    url text;
    who text;
    label text;
    text_out text;
    lineup_name text;
begin
    if coalesce(current_setting('app.skip_discord', true), '') = 'on' then return new; end if;
    if new.parent_id is not null then return new; end if;
    select d.webhook_url into url from public.chat_discord d where d.team_id = new.team_id;
    if url is null then return new; end if;

    select coalesce(nullif(btrim(p.nickname), ''), nullif(btrim(p.name), ''), nullif(btrim(pr.display_name), ''), '隊友')
      into who
      from public.memberships ms
      left join public.players p on p.id = ms.player_id
      left join public.profiles pr on pr.user_id = ms.user_id
     where ms.team_id = new.team_id and ms.user_id = new.author_id;
    label := case new.kind when 'note' then '【筆記】' when 'tactic' then '【戰術】' else '' end;
    select nullif(btrim(l.name), '') into lineup_name from public.lineups l where l.id = new.lineup_id;

    text_out := label || '**' || coalesce(who, '隊友') || '**：' || left(new.body, 1500)
                || case when char_length(new.body) > 1500 then '…' else '' end
                || case when new.lineup_id is not null then E'\n（附陣容：' || coalesce(lineup_name, '未命名') || '）' else '' end
                || E'\nhttps://football-analysis-potato.vercel.app/t/' || new.team_id || '/chat';
    begin
        perform net.http_post(
            url := url,
            body := jsonb_build_object('content', text_out, 'username', 'Football Analysis Potato',
                                       'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb)),
            headers := '{"Content-Type": "application/json"}'::jsonb
        );
    exception when others then
        raise notice 'Discord 通知送不出去：%', sqlerrm;
    end;
    return new;
end $$;

-- ---------- 6. 練習的通知（只給下面的函式用）----------
-- 回傳 {"chat": 有沒有發到聊天室, "discord": 有沒有推 Discord}
-- 呼叫前要先用 message_problem 檢查過 body。Discord 沒設定時，勾了也只是不推（不算錯）。
create or replace function public.practice_announce(team uuid, body text, to_chat boolean, to_discord boolean)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
    uid uuid := auth.uid();
    url text;
    who text;
    sent_discord boolean := false;
begin
    if not coalesce(to_chat, false) and not coalesce(to_discord, false) then
        return jsonb_build_object('chat', false, 'discord', false);
    end if;
    select d.webhook_url into url from public.chat_discord d where d.team_id = team;
    sent_discord := coalesce(to_discord, false) and url is not null;

    if coalesce(to_chat, false) then
        -- 發到聊天室：要推 Discord 就交給原本的觸發器；不推就在這次交易裡暫時關掉它
        if not sent_discord then perform set_config('app.skip_discord', 'on', true); end if;
        insert into public.messages (team_id, author_id, kind, body) values (team, uid, 'note', btrim(body));
        perform set_config('app.skip_discord', 'off', true);
        return jsonb_build_object('chat', true, 'discord', sent_discord);
    end if;

    -- 只推 Discord、不發聊天室
    if sent_discord then
        select coalesce(nullif(btrim(p.nickname), ''), nullif(btrim(p.name), ''), nullif(btrim(pr.display_name), ''), '隊友')
          into who
          from public.memberships ms
          left join public.players p on p.id = ms.player_id
          left join public.profiles pr on pr.user_id = ms.user_id
         where ms.team_id = team and ms.user_id = uid;
        begin
            perform net.http_post(
                url := url,
                body := jsonb_build_object(
                    'content', '【練習】**' || coalesce(who, '球隊管理員') || '**：' || left(btrim(body), 1500)
                               || case when char_length(btrim(body)) > 1500 then '…' else '' end
                               || E'\nhttps://football-analysis-potato.vercel.app/t/' || team || '/practice',
                    'username', 'Football Analysis Potato',
                    'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb)),
                headers := '{"Content-Type": "application/json"}'::jsonb
            );
        exception when others then
            raise notice 'Discord 通知送不出去：%', sqlerrm;
            sent_discord := false;
        end;
    end if;
    return jsonb_build_object('chat', false, 'discord', sent_discord);
end $$;

-- ---------- 7. 新增、修改一次練習（球隊管理員）----------
-- practice 不填 = 新增；填了 = 修改那一次（固定練習裡的一次也只改那一次）
-- announce：要發的通知文字（to_chat / to_discord 有勾才用得到）
create or replace function public.save_practice(team uuid, practice uuid default null,
                                                starts_at timestamptz default null, ends_at timestamptz default null,
                                                meet_at timestamptz default null, location text default '',
                                                title text default '', content text default '', note text default '',
                                                announce text default '', to_chat boolean default false,
                                                to_discord boolean default false)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    uid uuid := auth.uid();
    p public.practices;
    problem text;
    new_id uuid;
    sent jsonb;
begin
    if uid is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    if not public.is_member(team) and not public.is_admin() then return jsonb_build_object('status', 'not_member'); end if;
    if not public.can_manage(team) then return jsonb_build_object('status', 'forbidden'); end if;
    problem := public.practice_problem(starts_at, ends_at, meet_at, location, title, content, note);
    if problem is not null then return jsonb_build_object('status', 'invalid', 'detail', problem); end if;
    if coalesce(to_chat, false) or coalesce(to_discord, false) then
        problem := public.message_problem(announce);
        if problem is not null then return jsonb_build_object('status', 'invalid', 'detail', '通知：' || problem); end if;
    end if;

    if practice is null then
        -- 防止灌爆：每隊最多 500 次
        if (select count(*) from public.practices x where x.team_id = team) >= 500 then
            return jsonb_build_object('status', 'too_many', 'detail', '練習太多了（每隊最多 500 次），請先刪掉舊的');
        end if;
        insert into public.practices (team_id, starts_at, ends_at, meet_at, location, title, content, note, created_by)
        values (team, save_practice.starts_at, save_practice.ends_at, save_practice.meet_at,
                btrim(coalesce(save_practice.location, '')), btrim(coalesce(save_practice.title, '')),
                btrim(coalesce(save_practice.content, '')), btrim(coalesce(save_practice.note, '')), uid)
        returning id into new_id;
    else
        select * into p from public.practices x where x.id = save_practice.practice and x.team_id = team;
        if not found then return jsonb_build_object('status', 'not_found'); end if;
        update public.practices x
           set starts_at = save_practice.starts_at, ends_at = save_practice.ends_at, meet_at = save_practice.meet_at,
               location = btrim(coalesce(save_practice.location, '')), title = btrim(coalesce(save_practice.title, '')),
               content = btrim(coalesce(save_practice.content, '')), note = btrim(coalesce(save_practice.note, '')),
               updated_at = now()
         where x.id = p.id;
        new_id := p.id;
    end if;

    sent := public.practice_announce(team, announce, to_chat, to_discord);
    return jsonb_build_object('status', 'ok', 'id', new_id) || sent;
end $$;

-- ---------- 8. 一次建立一批（固定練習、AI 匯入）----------
-- items：[{"starts_at": "...", "ends_at": "...", "meet_at": null, "location": "", "title": "", "content": "", "note": ""}, ...]
-- 時間用帶時區的 ISO 格式（網站從使用者的時區換好再送）。
-- 先全部檢查，有一筆不對就整批都不建立，並回傳是第幾筆（row，從 1 開始）和原因，網站把那一行標出來。
-- series = true：這一批共用一個 series_id（固定練習）；AI 匯入的是一筆一筆獨立的
create or replace function public.save_practices(team uuid, items jsonb, series boolean default false,
                                                 announce text default '', to_chat boolean default false,
                                                 to_discord boolean default false)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    uid uuid := auth.uid();
    n int;
    i int;
    r jsonb;
    s timestamptz[] := '{}';
    e timestamptz[] := '{}';
    mt timestamptz[] := '{}';
    one_s timestamptz;
    one_e timestamptz;
    one_m timestamptz;
    problem text;
    sid uuid;
    new_id uuid;
    ids uuid[] := '{}';
    sent jsonb;
begin
    if uid is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    if not public.is_member(team) and not public.is_admin() then return jsonb_build_object('status', 'not_member'); end if;
    if not public.can_manage(team) then return jsonb_build_object('status', 'forbidden'); end if;
    if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
        return jsonb_build_object('status', 'invalid', 'detail', '沒有要建立的練習');
    end if;
    n := jsonb_array_length(items);
    if n > 60 then
        return jsonb_build_object('status', 'invalid', 'detail', '一次最多建立 60 次練習，請分批');
    end if;
    if (select count(*) from public.practices x where x.team_id = team) + n > 500 then
        return jsonb_build_object('status', 'too_many', 'detail', '練習太多了（每隊最多 500 次），請先刪掉舊的');
    end if;
    if coalesce(to_chat, false) or coalesce(to_discord, false) then
        problem := public.message_problem(announce);
        if problem is not null then return jsonb_build_object('status', 'invalid', 'detail', '通知：' || problem); end if;
    end if;

    -- 第一輪：全部檢查（時間看不懂、內容不對都在這裡擋下）
    for i in 0 .. n - 1 loop
        r := items -> i;
        if jsonb_typeof(r) <> 'object' then
            return jsonb_build_object('status', 'invalid', 'row', i + 1, 'detail', '第 ' || (i + 1) || ' 筆的格式不對');
        end if;
        begin
            one_s := nullif(r ->> 'starts_at', '')::timestamptz;
            one_e := nullif(r ->> 'ends_at', '')::timestamptz;
            one_m := nullif(r ->> 'meet_at', '')::timestamptz;
        exception when others then
            return jsonb_build_object('status', 'invalid', 'row', i + 1, 'detail', '第 ' || (i + 1) || ' 筆的時間看不懂');
        end;
        problem := public.practice_problem(one_s, one_e, one_m, r ->> 'location', r ->> 'title', r ->> 'content', r ->> 'note');
        if problem is not null then
            return jsonb_build_object('status', 'invalid', 'row', i + 1, 'detail', '第 ' || (i + 1) || ' 筆：' || problem);
        end if;
        s := s || one_s;
        e := e || one_e;
        mt := mt || one_m;
    end loop;

    -- 第二輪：全部建立
    sid := case when coalesce(series, false) then gen_random_uuid() end;
    for i in 0 .. n - 1 loop
        r := items -> i;
        insert into public.practices (team_id, starts_at, ends_at, meet_at, location, title, content, note, series_id, created_by)
        values (team, s[i + 1], e[i + 1], mt[i + 1],
                btrim(coalesce(r ->> 'location', '')), btrim(coalesce(r ->> 'title', '')),
                btrim(coalesce(r ->> 'content', '')), btrim(coalesce(r ->> 'note', '')), sid, uid)
        returning id into new_id;
        ids := ids || new_id;
    end loop;

    sent := public.practice_announce(team, announce, to_chat, to_discord);
    return jsonb_build_object('status', 'ok', 'count', n, 'ids', to_jsonb(ids), 'series_id', sid) || sent;
end $$;

-- ---------- 9. 刪除（球隊管理員）----------
-- rest_of_series = true：刪掉同一個系列「從這一次開始、之後的」；之前已經練過的和出席紀錄留著
create or replace function public.delete_practice(practice uuid, rest_of_series boolean default false)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    p public.practices;
    n int;
begin
    if auth.uid() is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    select * into p from public.practices x where x.id = delete_practice.practice;
    -- 別隊的人連「有沒有這次練習」都不告訴他
    if not found or not public.is_member(p.team_id) and not public.is_admin() then
        return jsonb_build_object('status', 'not_found');
    end if;
    if not public.can_manage(p.team_id) then return jsonb_build_object('status', 'forbidden'); end if;
    -- 出席紀錄跟著刪（on delete cascade）
    if coalesce(rest_of_series, false) and p.series_id is not null then
        delete from public.practices x where x.series_id = p.series_id and x.starts_at >= p.starts_at;
    else
        delete from public.practices x where x.id = p.id;
    end if;
    get diagnostics n = row_count;
    return jsonb_build_object('status', 'ok', 'deleted', n);
end $$;

-- ---------- 10. 練習出席登記 ----------
-- answer：'in' 出席、'out' 請假、null 清掉（變回還沒回覆）
-- player 不填 = 登記自己（要先認領名單上的自己）；填別人 = 球隊管理員幫忙登記
create or replace function public.set_practice_attendance(practice uuid, answer text, note text default '',
                                                          player uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    uid uuid := auth.uid();
    p public.practices;
    who jsonb;
    pid uuid;
begin
    if uid is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    select * into p from public.practices x where x.id = set_practice_attendance.practice;
    if not found or not public.is_member(p.team_id) and not public.is_admin() then
        return jsonb_build_object('status', 'not_found');
    end if;
    who := public.attendance_who(p.team_id, p.starts_at, false, answer, note, player, '練習');
    if who ->> 'status' <> 'ok' then return who; end if;
    pid := (who ->> 'player')::uuid;

    if answer is null then
        delete from public.practice_attendance a where a.practice_id = p.id and a.player_id = pid;
        return jsonb_build_object('status', 'ok', 'answer', null);
    end if;
    insert into public.practice_attendance (practice_id, player_id, team_id, status, note, updated_by, updated_at)
    values (p.id, pid, p.team_id, answer, btrim(coalesce(note, '')), uid, now())
    on conflict (practice_id, player_id) do update
       set status = excluded.status, note = excluded.note, updated_by = excluded.updated_by,
           updated_at = excluded.updated_at;
    return jsonb_build_object('status', 'ok', 'answer', answer);
end $$;

-- ---------- 11. 下載我的資料：加上練習出席 ----------
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

-- ---------- 12. 刪除帳號：練習出席也刪掉 ----------
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
    delete from public.practice_attendance where player_id = any(pids);
    update public.players
       set nickname = '', message = '', good_positions = '{}', bad_positions = '{}', weak_side = ''
     where id = any(pids);
    delete from public.lineups where owner_id = uid and kind = 'draft';
    update public.messages
       set body = '', lineup_id = null, pinned_at = null, deleted_at = now()
     where author_id = uid and deleted_at is null;
    -- 刪掉登入帳號：profiles、memberships、chat_reads、封鎖紀錄、Team ID 嘗試紀錄跟著刪（外鍵 on delete cascade），
    -- 名單上的球員因為 memberships 不見了，自然變成「沒有連結帳號」；正式陣容的 owner_id、比賽和練習的 created_by、
    -- 訊息的 author_id 變成空的
    delete from auth.users where id = uid;
    return jsonb_build_object('status', 'ok', 'players_unlinked', cardinality(pids));
end $$;

-- ---------- 權限 ----------
-- 先全部從 public、anon 收回
revoke all on function
    public.practice_problem(timestamptz, timestamptz, timestamptz, text, text, text, text),
    public.attendance_who(uuid, timestamptz, boolean, text, text, uuid, text),
    public.set_attendance(uuid, text, text, uuid), public.notify_discord(),
    public.practice_announce(uuid, text, boolean, boolean),
    public.save_practice(uuid, uuid, timestamptz, timestamptz, timestamptz, text, text, text, text, text, boolean, boolean),
    public.save_practices(uuid, jsonb, boolean, text, boolean, boolean),
    public.delete_practice(uuid, boolean), public.set_practice_attendance(uuid, text, text, uuid),
    public.export_my_data(), public.delete_my_account()
from public, anon;
-- 小工具和觸發器只給資料庫內部用，登入的人也不能直接呼叫
revoke all on function
    public.practice_problem(timestamptz, timestamptz, timestamptz, text, text, text, text),
    public.attendance_who(uuid, timestamptz, boolean, text, text, uuid, text),
    public.practice_announce(uuid, text, boolean, boolean), public.notify_discord()
from authenticated;

grant execute on function
    public.set_attendance(uuid, text, text, uuid),
    public.save_practice(uuid, uuid, timestamptz, timestamptz, timestamptz, text, text, text, text, text, boolean, boolean),
    public.save_practices(uuid, jsonb, boolean, text, boolean, boolean),
    public.delete_practice(uuid, boolean), public.set_practice_attendance(uuid, text, text, uuid),
    public.export_my_data(), public.delete_my_account()
to authenticated;
