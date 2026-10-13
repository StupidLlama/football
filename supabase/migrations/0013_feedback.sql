-- ============================================================
-- v2.9 意見回饋（SPEC F10）
--   決定（2026-10-13）：不另開 feedback 表，把 v2.2.1 的「聯絡我們」（contact_messages）升級成意見回饋。
--   同一個入口、同一張表、同一個 Discord Webhook；只有登入的人能送；截圖先不做。
--
--   1. contact_messages 加欄位：version（網站版本）、device（粗略裝置，例如「手機 · Safari」）、
--      reply（網站管理員的回覆）、replied_at、reply_read_at（本人看過回覆的時間，網站用來亮小圓點）
--      狀態從 new / done 變成 new / doing / done（新的 → 處理中 → 已解決）
--   2. send_contact_message 多收 version、device（都有預設值，舊網站照三個參數呼叫也可以）
--   3. 改狀態、回覆都改成函式（只有網站管理員）：set_feedback_status、reply_feedback
--      本人標記「回覆看過了」：mark_feedback_read
--      收回直接 update 這張表的權限（原本 0005 開放網站管理員直接改 status）
--   4. export_my_data 帶出狀態、回覆、頁面、版本、裝置
--
-- 回饋屬於「使用者」，不屬於任何球隊，所以不掛 season_guard（tests/test_v28.py 有寫原因）。
-- 刪帳號時回饋跟著刪（0005 的外鍵 on delete cascade），delete_my_account 不用改。
--
-- 規則：已經執行過的檔案不要改；要改就新增 0014_xxx.sql。
-- 上線順序：先在 Supabase 執行這個檔案，再部署網站。
-- ============================================================

-- ---------- 1. 新欄位、新狀態 ----------
alter table public.contact_messages
    add column version       text not null default '' check (char_length(version) <= 20),
    add column device        text not null default '' check (char_length(device) <= 60),
    add column reply         text not null default '' check (char_length(reply) <= 2000),
    add column replied_at    timestamptz,
    add column reply_read_at timestamptz;

alter table public.contact_messages drop constraint if exists contact_messages_status_check;
alter table public.contact_messages
    add constraint contact_messages_status_check check (status in ('new', 'doing', 'done'));

-- 「我的回饋」用：找自己的訊息
create index if not exists contact_messages_user_idx on public.contact_messages(user_id, created_at desc);

-- ---------- 2. 權限：只能看，不能直接改 ----------
-- 看：本人看自己的、網站管理員看全部（0005 的 contact_messages_select 不變）
-- 改：一律走下面的函式
drop policy if exists contact_messages_update on public.contact_messages;
revoke update on public.contact_messages from authenticated;

-- ---------- 3. 送出回饋：多收版本和裝置 ----------
-- 舊的三個參數版本要先刪掉，不然 (category, body, page) 呼叫時資料庫不知道要用哪一個
drop function if exists public.send_contact_message(text, text, text);

create or replace function public.send_contact_message(
    category text, body text, page text default '', version text default '', device text default '')
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
    insert into public.contact_messages (user_id, category, body, page, version, device)
    values (auth.uid(), category, trim(body), left(coalesce(page, ''), 200),
            left(coalesce(version, ''), 20), left(coalesce(device, ''), 60))
    returning id into new_id;
    return jsonb_build_object('status', 'ok', 'id', new_id);
end $$;

-- ---------- 4. 網站管理員：改狀態、回覆 ----------
create or replace function public.set_feedback_status(message uuid, status text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
    if auth.uid() is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    if not public.is_admin() then return jsonb_build_object('status', 'forbidden'); end if;
    if status is null or status not in ('new', 'doing', 'done') then
        return jsonb_build_object('status', 'invalid', 'detail', '狀態不對');
    end if;
    update public.contact_messages c set status = set_feedback_status.status where c.id = message;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    return jsonb_build_object('status', 'ok');
end $$;

-- 回覆：同一則可以改回覆（覆蓋）；回覆後填寫的人下次打開網站會看到小圓點。
-- 可以順便改狀態（例如回覆並標成已解決）；next_status 空的就不改。
create or replace function public.reply_feedback(message uuid, reply text, next_status text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
    if auth.uid() is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    if not public.is_admin() then return jsonb_build_object('status', 'forbidden'); end if;
    if coalesce(char_length(trim(reply)), 0) not between 1 and 2000 then
        return jsonb_build_object('status', 'invalid', 'detail', '回覆要 1–2000 字');
    end if;
    if coalesce(next_status, '') not in ('', 'new', 'doing', 'done') then
        return jsonb_build_object('status', 'invalid', 'detail', '狀態不對');
    end if;
    update public.contact_messages c
       set reply = trim(reply_feedback.reply),
           replied_at = now(),
           reply_read_at = null,
           status = case when coalesce(next_status, '') = '' then c.status else next_status end
     where c.id = message;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    return jsonb_build_object('status', 'ok');
end $$;

-- ---------- 5. 本人：回覆看過了 ----------
-- 把自己所有「有回覆、還沒看過」的訊息標成看過（打開「我的回饋」時呼叫一次）
create or replace function public.mark_feedback_read()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare n int;
begin
    if auth.uid() is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    update public.contact_messages c
       set reply_read_at = now()
     where c.user_id = auth.uid() and c.replied_at is not null
       and (c.reply_read_at is null or c.reply_read_at < c.replied_at);
    get diagnostics n = row_count;
    return jsonb_build_object('status', 'ok', 'marked', n);
end $$;

-- ---------- 6. 下載我的資料：回饋帶出狀態和回覆 ----------
-- 內容跟 0012 一樣，只有最後的 contact_messages 多了欄位
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
            select jsonb_agg(jsonb_build_object(
                'category', c.category, 'body', c.body, 'page', c.page, 'version', c.version, 'device', c.device,
                'status', c.status, 'reply', c.reply, 'replied_at', c.replied_at, 'created_at', c.created_at)
                             order by c.created_at)
              from public.contact_messages c where c.user_id = uid), '[]'::jsonb)
    );
end $$;

-- ---------- 權限：函式只給登入的人呼叫 ----------
revoke all on function
    public.send_contact_message(text, text, text, text, text),
    public.set_feedback_status(uuid, text), public.reply_feedback(uuid, text, text),
    public.mark_feedback_read(), public.export_my_data()
from public, anon;

grant execute on function
    public.send_contact_message(text, text, text, text, text),
    public.set_feedback_status(uuid, text), public.reply_feedback(uuid, text, text),
    public.mark_feedback_read(), public.export_my_data()
to authenticated;
