-- ============================================================
-- v2.2.1 隱私與帳號
--   1. 同意隱私權政策與服務條款：profiles 記下「最新同意的版本」和時間（第一次登入、政策改版都要再同意）
--   2. 刪除帳號：帳號、成員身分、能力自評、名單上的自我介紹全部刪除；名單上的名字留著、變成沒有連結帳號
--   3. 球隊管理員刪除名單上沒有連結帳號的名字（連同自評）
--   4. 下載我的資料（個資法：當事人可以要求複製）
--   5. 聯絡我們：訊息存在 contact_messages，網站管理員看得到；網站另外轉發到 Discord
--
-- 規則：已經執行過的檔案不要改；要改就新增 0006_xxx.sql。
-- 畫面上「教練」改叫「球隊管理員」，資料庫裡的值還是 'coach'。
-- ============================================================

-- ---------- 1. 同意政策 ----------
alter table public.profiles
    add column policy_version text,
    add column policy_accepted_at timestamptz;
-- profiles 的 update 權限只開放 display_name（0003），同意要走下面的函式，不能自己亂填

create or replace function public.accept_policies(version text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
    if auth.uid() is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    if version is null or version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        return jsonb_build_object('status', 'invalid', 'detail', '政策版本格式不對');
    end if;
    insert into public.profiles (user_id) values (auth.uid()) on conflict do nothing;
    update public.profiles set policy_version = version, policy_accepted_at = now() where user_id = auth.uid();
    return jsonb_build_object('status', 'ok', 'version', version);
end $$;

-- ---------- 2. 刪除帳號 ----------
-- 名單上的「人」屬於球隊（教練排陣容、裁判任務會用到），所以名字、背號、隊長標記留著，
-- 只刪掉這個人自己填的東西（能力自評、暱稱、位置、慣用腳、給球隊的話），之後球隊管理員可以再刪名字。
-- 最後一位球隊管理員也可以刪帳號：那一隊會暫時沒有管理員，由網站管理員處理。
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
    -- 刪掉登入帳號：profiles、memberships、封鎖紀錄、Team ID 嘗試紀錄跟著刪（外鍵 on delete cascade），
    -- 名單上的球員因為 memberships 不見了，自然變成「沒有連結帳號」
    delete from auth.users where id = uid;
    return jsonb_build_object('status', 'ok', 'players_unlinked', cardinality(pids));
end $$;

-- ---------- 3. 球隊管理員刪除沒有連結帳號的名字 ----------
create or replace function public.delete_unlinked_player(player uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare t uuid;
begin
    select team_id into t from public.players where id = player;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    if not public.can_manage(t) then return jsonb_build_object('status', 'forbidden'); end if;
    if exists (select 1 from public.memberships m where m.player_id = player) then
        return jsonb_build_object('status', 'linked');
    end if;
    delete from public.players where id = player;   -- 能力自評跟著刪；認領申請、裁判任務的指派自動清掉
    return jsonb_build_object('status', 'ok');
end $$;

-- ---------- 4. 下載我的資料 ----------
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
                'role', m.role, 'joined_at', m.joined_at,
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

-- ---------- 5. 聯絡我們 ----------
create table public.contact_messages (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid references auth.users(id) on delete cascade,   -- 刪帳號時訊息一起刪
    category   text not null check (category in ('bug', 'suggestion', 'privacy', 'other')),
    body       text not null check (char_length(body) between 1 and 2000),
    page       text not null default '' check (char_length(page) <= 200),
    status     text not null default 'new' check (status in ('new', 'done')),
    created_at timestamptz not null default now()
);
create index contact_messages_created_idx on public.contact_messages(created_at desc);

alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from anon, authenticated;
-- 新增走函式（要登入、有次數限制）；網站管理員看得到全部、可以改狀態
grant select on public.contact_messages to authenticated;
grant update (status) on public.contact_messages to authenticated;
create policy contact_messages_select on public.contact_messages
    for select to authenticated using (public.is_admin() or user_id = auth.uid());
create policy contact_messages_update on public.contact_messages
    for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.send_contact_message(category text, body text, page text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare new_id uuid;
begin
    if auth.uid() is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    if category is null or category not in ('bug', 'suggestion', 'privacy', 'other') then
        return jsonb_build_object('status', 'invalid', 'detail', '請選擇類型');
    end if;
    if coalesce(char_length(trim(body)), 0) not between 1 and 2000 then
        return jsonb_build_object('status', 'invalid', 'detail', '內容要 1–2000 字');
    end if;
    -- 一小時最多 5 則，防止灌爆管理員的 Discord
    if (select count(*) from public.contact_messages c
         where c.user_id = auth.uid() and c.created_at > now() - interval '1 hour') >= 5 then
        return jsonb_build_object('status', 'rate_limited');
    end if;
    insert into public.contact_messages (user_id, category, body, page)
    values (auth.uid(), category, trim(body), left(coalesce(page, ''), 200))
    returning id into new_id;
    return jsonb_build_object('status', 'ok', 'id', new_id);
end $$;

-- ---------- 權限：函式只給登入的人呼叫 ----------
revoke all on function
    public.accept_policies(text), public.delete_my_account(), public.delete_unlinked_player(uuid),
    public.export_my_data(), public.send_contact_message(text, text, text)
from public, anon;

grant execute on function
    public.accept_policies(text), public.delete_my_account(), public.delete_unlinked_player(uuid),
    public.export_my_data(), public.send_contact_message(text, text, text)
to authenticated;
