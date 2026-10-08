-- ============================================================
-- v2.6 隊伍聊天室（F6）
--   1. messages：一則訊息。parent_id 空的是主貼文，有值的是回覆（只有一層）
--      - 所有成員都能發主貼文；球員的類型固定 'general'（一般），'note'（筆記）、'tactic'（戰術）只有球隊管理員能用
--      - 置頂只有球隊管理員；每隊最多 5 則
--      - 刪除 = 清空內容、留下「已刪除」的殼（回覆還看得懂），作者或球隊管理員都能刪
--      - 編輯：只有作者，不限時間，edited_at 記錄改過
--      - 附件：只能附同一隊的正式陣容（草稿只有本人看得到，不能附）
--   2. chat_reads：每個人在每隊最後讀到什麼時候 → 未讀紅點
--   3. chat_discord：球隊的 Discord Webhook 網址（等於密碼）。沒有任何 RLS 規則，只有資料庫函式讀寫；
--      網站只拿得到「有沒有設定」。新的主貼文由資料庫自己用 pg_net 送出，網址不會經過瀏覽器
--   4. Supabase Realtime：把 messages 加進 supabase_realtime，RLS 一樣把關（只收得到自己隊的）
--   5. export_my_data / delete_my_account 加上聊天訊息（刪帳號 = 自己的訊息清空成「已刪除」）
--
-- 規則：已經執行過的檔案不要改；要改就新增 0010_xxx.sql。
-- ============================================================

-- ---------- 0. 送 HTTP 用的 pg_net（Supabase 內建；本機測試由 supabase/tests/local_shim.sql 模擬）----------
do $$
begin
    create extension if not exists pg_net;
exception when others then
    raise notice 'pg_net 不能用（本機測試環境），Discord 通知會略過';
end $$;

-- ---------- 1. 訊息 ----------
create table public.messages (
    id         uuid primary key default gen_random_uuid(),
    team_id    uuid not null references public.teams(id) on delete cascade,
    author_id  uuid references auth.users(id) on delete set null,          -- 刪帳號後變成空的
    parent_id  uuid references public.messages(id) on delete cascade,     -- 空的 = 主貼文
    kind       text not null default 'general' check (kind in ('general', 'note', 'tactic')),
    body       text not null default '' check (char_length(body) <= 2000),
    lineup_id  uuid references public.lineups(id) on delete set null,      -- 附的正式陣容；陣容刪掉附件就不見
    pinned_at  timestamptz,                                                -- 空的 = 沒置頂
    edited_at  timestamptz,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    check (parent_id is null or (kind = 'general' and pinned_at is null)), -- 回覆沒有類型、不能置頂
    check (deleted_at is null or (body = '' and lineup_id is null and pinned_at is null))
);
create index messages_team_idx on public.messages(team_id, created_at);
create index messages_parent_idx on public.messages(parent_id) where parent_id is not null;
create index messages_author_idx on public.messages(author_id);

alter table public.messages enable row level security;
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;      -- 寫入只能透過下面的函式

create policy messages_select on public.messages
    for select to authenticated using (public.is_member(team_id));

-- ---------- 2. 讀到哪裡（未讀紅點）----------
create table public.chat_reads (
    team_id      uuid not null references public.teams(id) on delete cascade,
    user_id      uuid not null references auth.users(id) on delete cascade,
    last_read_at timestamptz not null default now(),
    primary key (team_id, user_id)
);

alter table public.chat_reads enable row level security;
revoke all on public.chat_reads from anon, authenticated;
grant select on public.chat_reads to authenticated;    -- 寫入只能透過 mark_chat_read

-- 只看得到自己的（別人讀了沒是隱私）
create policy chat_reads_select on public.chat_reads
    for select to authenticated using (user_id = auth.uid());

-- ---------- 3. Discord Webhook（只有資料庫函式讀寫）----------
create table public.chat_discord (
    team_id     uuid primary key references public.teams(id) on delete cascade,
    webhook_url text not null,
    updated_by  uuid references auth.users(id) on delete set null,
    updated_at  timestamptz not null default now()
);

alter table public.chat_discord enable row level security;
revoke all on public.chat_discord from anon, authenticated;
-- 故意沒有任何 RLS 規則：連球隊管理員也讀不到網址（tests/test_v20.py 的 SECRET_TABLES）

-- ---------- 4. Realtime ----------
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        alter publication supabase_realtime add table public.messages;
    end if;
end $$;

-- ---------- 小工具：檢查內容（只給下面的函式用）----------
create or replace function public.message_problem(body text)
returns text
language plpgsql immutable
set search_path = public
as $$
begin
    if body is null or char_length(btrim(body)) = 0 then return '請輸入內容'; end if;
    if char_length(btrim(body)) > 2000 then return '一則訊息最多 2000 個字'; end if;
    return null;
end $$;

-- ---------- 5. 發文、回覆 ----------
-- parent 不填 = 主貼文；填了 = 回覆那一則（回覆只能回主貼文、類型一律 general）
create or replace function public.post_message(team uuid, body text, kind text default 'general',
                                               parent uuid default null, lineup uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    uid uuid := auth.uid();
    p public.messages;
    problem text;
    new_id uuid;
begin
    if uid is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    if not public.is_member(team) then return jsonb_build_object('status', 'not_member'); end if;
    problem := public.message_problem(body);
    if problem is not null then return jsonb_build_object('status', 'invalid', 'detail', problem); end if;
    if kind is null or kind not in ('general', 'note', 'tactic') then
        return jsonb_build_object('status', 'invalid', 'detail', '訊息類型不對');
    end if;
    if kind <> 'general' and not public.can_manage(team) then return jsonb_build_object('status', 'forbidden'); end if;

    if parent is not null then
        select * into p from public.messages x where x.id = post_message.parent and x.team_id = team;
        if not found then return jsonb_build_object('status', 'not_found'); end if;
        if p.parent_id is not null then
            return jsonb_build_object('status', 'invalid', 'detail', '只能回覆主貼文');
        end if;
        if p.deleted_at is not null then
            return jsonb_build_object('status', 'invalid', 'detail', '這則訊息已經刪除，不能回覆');
        end if;
        if kind <> 'general' then
            return jsonb_build_object('status', 'invalid', 'detail', '回覆沒有類型');
        end if;
    end if;

    if lineup is not null and not exists (select 1 from public.lineups l
                                           where l.id = lineup and l.team_id = team and l.kind = 'official') then
        return jsonb_build_object('status', 'invalid', 'detail', '只能附這一隊的正式陣容');
    end if;

    -- 防止洗版：同一個人在同一隊 1 分鐘內最多 10 則
    if (select count(*) from public.messages x
         where x.team_id = team and x.author_id = uid and x.created_at > now() - interval '1 minute') >= 10 then
        return jsonb_build_object('status', 'too_fast');
    end if;

    insert into public.messages (team_id, author_id, parent_id, kind, body, lineup_id)
    values (team, uid, parent, kind, btrim(body), lineup)
    returning id into new_id;
    return jsonb_build_object('status', 'ok', 'id', new_id);
end $$;

-- ---------- 6. 編輯（只有作者）----------
create or replace function public.edit_message(message uuid, body text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    uid uuid := auth.uid();
    m public.messages;
    problem text;
begin
    if uid is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    select * into m from public.messages x where x.id = edit_message.message;
    if not found or not public.is_member(m.team_id) then return jsonb_build_object('status', 'not_found'); end if;
    if m.deleted_at is not null then return jsonb_build_object('status', 'not_found'); end if;
    if m.author_id is distinct from uid then return jsonb_build_object('status', 'forbidden'); end if;
    problem := public.message_problem(body);
    if problem is not null then return jsonb_build_object('status', 'invalid', 'detail', problem); end if;
    if btrim(body) = m.body then return jsonb_build_object('status', 'ok'); end if;   -- 沒改就不標「已編輯」
    update public.messages x set body = btrim(edit_message.body), edited_at = now() where x.id = m.id;
    return jsonb_build_object('status', 'ok');
end $$;

-- ---------- 7. 刪除（作者或球隊管理員）----------
-- 不真的刪掉那一列：清空內容、留下「已刪除」的殼，底下的回覆還在、對話才看得懂
create or replace function public.delete_message(message uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    uid uuid := auth.uid();
    m public.messages;
begin
    if uid is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    select * into m from public.messages x where x.id = delete_message.message;
    if not found or not public.is_member(m.team_id) and not public.is_admin() then
        return jsonb_build_object('status', 'not_found');
    end if;
    if m.author_id is distinct from uid and not public.can_manage(m.team_id) then
        return jsonb_build_object('status', 'forbidden');
    end if;
    if m.deleted_at is not null then return jsonb_build_object('status', 'ok'); end if;
    update public.messages x
       set body = '', lineup_id = null, pinned_at = null, deleted_at = now()
     where x.id = m.id;
    return jsonb_build_object('status', 'ok');
end $$;

-- ---------- 8. 置頂（球隊管理員，每隊最多 5 則）----------
create or replace function public.set_pinned(message uuid, pinned boolean)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    m public.messages;
begin
    if auth.uid() is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    select * into m from public.messages x where x.id = set_pinned.message;
    if not found or not public.is_member(m.team_id) and not public.is_admin() then
        return jsonb_build_object('status', 'not_found');
    end if;
    if not public.can_manage(m.team_id) then return jsonb_build_object('status', 'forbidden'); end if;
    if m.parent_id is not null or m.deleted_at is not null then
        return jsonb_build_object('status', 'invalid', 'detail', '只有主貼文可以置頂');
    end if;
    if pinned and m.pinned_at is null and (select count(*) from public.messages x
                                             where x.team_id = m.team_id and x.pinned_at is not null) >= 5 then
        return jsonb_build_object('status', 'invalid', 'detail', '最多只能置頂 5 則，請先取消一則');
    end if;
    update public.messages x
       set pinned_at = case when set_pinned.pinned then coalesce(m.pinned_at, now()) end
     where x.id = m.id;
    return jsonb_build_object('status', 'ok');
end $$;

-- ---------- 9. 標記已讀 ----------
create or replace function public.mark_chat_read(team uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
    if uid is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    if not public.is_member(team) then return jsonb_build_object('status', 'not_member'); end if;
    insert into public.chat_reads (team_id, user_id, last_read_at) values (team, uid, now())
    on conflict (team_id, user_id) do update set last_read_at = excluded.last_read_at;
    return jsonb_build_object('status', 'ok');
end $$;

-- ---------- 10. Discord 設定（球隊管理員）----------
-- url 空的 = 關掉；只收 Discord 官方的 Webhook 網址
create or replace function public.set_chat_discord(team uuid, url text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
    if uid is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    if not public.is_member(team) and not public.is_admin() then return jsonb_build_object('status', 'not_member'); end if;
    if not public.can_manage(team) then return jsonb_build_object('status', 'forbidden'); end if;
    if url is null or btrim(url) = '' then
        delete from public.chat_discord d where d.team_id = team;
        return jsonb_build_object('status', 'ok', 'configured', false);
    end if;
    if btrim(url) !~ '^https://(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)/api/webhooks/[0-9]{5,25}/[A-Za-z0-9_-]{20,100}$' then
        return jsonb_build_object('status', 'invalid', 'detail', '這不像 Discord 的 Webhook 網址');
    end if;
    insert into public.chat_discord (team_id, webhook_url, updated_by, updated_at)
    values (team, btrim(url), uid, now())
    on conflict (team_id) do update
       set webhook_url = excluded.webhook_url, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
    return jsonb_build_object('status', 'ok', 'configured', true);
end $$;

-- 只告訴球隊管理員「有沒有設定、什麼時候設的」，網址本身永遠不回傳
create or replace function public.get_chat_discord(team uuid)
returns jsonb
language plpgsql security definer stable
set search_path = public
as $$
declare d public.chat_discord;
begin
    if auth.uid() is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    if not public.is_member(team) and not public.is_admin() then return jsonb_build_object('status', 'not_member'); end if;
    if not public.can_manage(team) then return jsonb_build_object('status', 'forbidden'); end if;
    select * into d from public.chat_discord x where x.team_id = team;
    return jsonb_build_object('status', 'ok', 'configured', found, 'updated_at', d.updated_at);
end $$;

-- ---------- 11. 新的主貼文 → Discord ----------
-- 回覆不推（頻道才不會太吵）；送不出去也不能擋住發文，所以錯誤一律吞掉
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
            -- allowed_mentions 空的：訊息裡就算打 @everyone 也不會真的 tag 全頻道
            body := jsonb_build_object('content', text_out, 'username', 'Football Analysis Potato',
                                       'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb)),
            headers := '{"Content-Type": "application/json"}'::jsonb
        );
    exception when others then
        raise notice 'Discord 通知送不出去：%', sqlerrm;
    end;
    return new;
end $$;

create trigger messages_notify_discord
    after insert on public.messages
    for each row execute function public.notify_discord();

-- ---------- 12. 下載我的資料：加上自己發的聊天訊息 ----------
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

-- ---------- 13. 刪除帳號：自己的聊天訊息清空成「已刪除」----------
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
    update public.messages
       set body = '', lineup_id = null, pinned_at = null, deleted_at = now()
     where author_id = uid and deleted_at is null;
    -- 刪掉登入帳號：profiles、memberships、chat_reads、封鎖紀錄、Team ID 嘗試紀錄跟著刪（外鍵 on delete cascade），
    -- 名單上的球員因為 memberships 不見了，自然變成「沒有連結帳號」；正式陣容的 owner_id、比賽的 created_by、
    -- 訊息的 author_id 變成空的
    delete from auth.users where id = uid;
    return jsonb_build_object('status', 'ok', 'players_unlinked', cardinality(pids));
end $$;

-- ---------- 權限 ----------
-- 先全部從 public、anon 收回
revoke all on function
    public.message_problem(text),
    public.post_message(uuid, text, text, uuid, uuid), public.edit_message(uuid, text),
    public.delete_message(uuid), public.set_pinned(uuid, boolean), public.mark_chat_read(uuid),
    public.set_chat_discord(uuid, text), public.get_chat_discord(uuid), public.notify_discord(),
    public.export_my_data(), public.delete_my_account()
from public, anon;
-- 小工具和觸發器只給資料庫內部用，登入的人也不能直接呼叫
revoke all on function public.message_problem(text), public.notify_discord() from authenticated;

grant execute on function
    public.post_message(uuid, text, text, uuid, uuid), public.edit_message(uuid, text),
    public.delete_message(uuid), public.set_pinned(uuid, boolean), public.mark_chat_read(uuid),
    public.set_chat_discord(uuid, text), public.get_chat_discord(uuid),
    public.export_my_data(), public.delete_my_account()
to authenticated;
