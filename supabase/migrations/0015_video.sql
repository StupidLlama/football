-- ============================================================
-- v3.0 影片分析排隊、品質檢查（Colab）
--   影片不經過網站也不經過資料庫（Supabase 免費方案單檔 50 MB）：影片放球隊管理員自己的 Google Drive，
--   在 Colab 跑 analysis/run_job.py，只把進度和品質結果寫回來。
--
--   1. match_videos：一場比賽的一次影片分析（檔名、狀態、進度、品質等級和原因、長度／幀率／解析度）
--      狀態：queued 排隊中 → processing 處理中 → done 完成（品質可能是 reject）／ failed 失敗 ／ cancelled 取消
--   2. video_tokens：分析權杖（只給函式讀寫）。Colab 沒有登入（Google 登入的帳號沒有密碼），
--      所以建立工作時給一組一次性的權杖，貼進筆記本；權杖只能回報「那一筆」的進度和結果。
--      只存 sha256；7 天到期；完成、失敗、取消就刪掉；最多回報 5000 次。
--   3. create_video_job、cancel_video_job（球隊管理員）、report_video_job（拿權杖，不用登入）
--      report_video_job 是第二個開放給 anon 的函式（第一個是 get_shared_lineup），理由寫在 docs/SECURITY_REVIEW.md：
--      不回傳任何資料、只能改權杖對到的那一筆的進度和結果、每個值都有範圍檢查。
--   4. match_videos 掛 season_guard（舊賽季不能再建立、回報）；加進 Realtime，網站進度自動更新。
--
-- 規則：已經執行過的檔案不要改；要改就新增 0016_xxx.sql。
-- 上線順序：先在 Supabase 執行這個檔案（再跑 rls_test.sql），再部署網站。
-- ============================================================

-- ---------- 1. 影片分析工作 ----------
create table public.match_videos (
    id         uuid primary key default gen_random_uuid(),
    team_id    uuid not null references public.teams(id) on delete cascade,
    match_id   uuid not null references public.matches(id) on delete cascade,
    file_name  text not null check (char_length(file_name) between 1 and 200),
    status     text not null default 'queued' check (status in ('queued', 'processing', 'done', 'failed', 'cancelled')),
    progress   int  not null default 0 check (progress between 0 and 100),
    grade      text check (grade in ('ok', 'low', 'reject')),
    reasons    text[] not null default '{}' check (cardinality(reasons) <= 10),
    width      int  check (width between 1 and 10000),
    height     int  check (height between 1 and 10000),
    fps        numeric(6, 2) check (fps between 0 and 1000),
    seconds    numeric(8, 1) check (seconds between 0 and 86400),
    error      text not null default '' check (char_length(error) <= 200),
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check ((status = 'done') = (grade is not null))
);
create index match_videos_match_idx on public.match_videos(match_id, created_at desc);
create index match_videos_team_idx on public.match_videos(team_id);

alter table public.match_videos enable row level security;
revoke all on public.match_videos from anon, authenticated;
grant select on public.match_videos to authenticated;      -- 寫入只能透過下面的函式

create policy match_videos_select on public.match_videos
    for select to authenticated using (public.is_member(team_id));

create trigger match_videos_season_guard before insert or update or delete on public.match_videos
    for each row execute function public.season_guard();

do $$ begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        alter publication supabase_realtime add table public.match_videos;
    end if;
end $$;

-- ---------- 2. 分析權杖（只給函式讀寫，沒有任何 RLS 規則）----------
create table public.video_tokens (
    video_id   uuid primary key references public.match_videos(id) on delete cascade,
    token_hash text not null unique,                 -- sha256(權杖)；原文只在建立時顯示一次
    expires_at timestamptz not null,
    reports    int  not null default 0
);
alter table public.video_tokens enable row level security;
revoke all on public.video_tokens from anon, authenticated;

create or replace function public.video_token_hash(token text)
returns text
language sql immutable
set search_path = public
as $$ select encode(sha256(convert_to(btrim(coalesce(token, '')), 'UTF8')), 'hex') $$;

-- ---------- 3. 建立、取消（球隊管理員）----------
create or replace function public.create_video_job(match uuid, file_name text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    uid uuid := auth.uid();
    m public.matches;
    fname text := btrim(coalesce(file_name, ''));
    raw text;
    new_id uuid;
begin
    if uid is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    select * into m from public.matches x where x.id = create_video_job.match;
    if not found or not public.is_member(m.team_id) and not public.is_admin() then
        return jsonb_build_object('status', 'not_found');
    end if;
    if not public.can_manage(m.team_id) then return jsonb_build_object('status', 'forbidden'); end if;
    if char_length(fname) not between 1 and 200 then
        return jsonb_build_object('status', 'invalid', 'detail', '請填影片檔名（最多 200 個字）');
    end if;
    if m.kickoff > now() then
        return jsonb_build_object('status', 'invalid', 'detail', '比賽還沒開始，踢完再建立影片分析');
    end if;
    if exists (select 1 from public.match_videos v where v.match_id = m.id and v.status in ('queued', 'processing')) then
        return jsonb_build_object('status', 'busy');
    end if;
    if (select count(*) from public.match_videos v where v.team_id = m.team_id
         and v.created_at > now() - interval '1 day') >= 20 then
        return jsonb_build_object('status', 'too_many', 'detail', '今天建立太多次影片分析了，明天再試');
    end if;

    insert into public.match_videos (team_id, match_id, file_name, created_by)
    values (m.team_id, m.id, fname, uid) returning id into new_id;
    -- gen_random_uuid 是密碼學等級的亂數；兩個合起來 244 位元
    raw := 'pv_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into public.video_tokens (video_id, token_hash, expires_at)
    values (new_id, public.video_token_hash(raw), now() + interval '7 days');
    return jsonb_build_object('status', 'ok', 'id', new_id, 'token', raw);
end $$;

create or replace function public.cancel_video_job(video uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v public.match_videos;
begin
    if auth.uid() is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    select * into v from public.match_videos x where x.id = cancel_video_job.video;
    if not found or not public.is_member(v.team_id) and not public.is_admin() then
        return jsonb_build_object('status', 'not_found');
    end if;
    if not public.can_manage(v.team_id) then return jsonb_build_object('status', 'forbidden'); end if;
    if v.status not in ('queued', 'processing') then
        return jsonb_build_object('status', 'closed', 'detail', '這個影片分析已經結束或取消了');
    end if;
    update public.match_videos set status = 'cancelled', updated_at = now() where id = v.id;
    delete from public.video_tokens where video_id = v.id;
    return jsonb_build_object('status', 'ok');
end $$;

-- ---------- 4. Colab 回報進度和結果（拿權杖，不用登入）----------
create or replace function public.report_video_job(p_token text, p_status text, p_progress int default null,
                                                   p_grade text default null, p_reasons text[] default null,
                                                   p_width int default null, p_height int default null,
                                                   p_fps numeric default null, p_seconds numeric default null,
                                                   p_error text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    tk public.video_tokens;
    v public.match_videos;
    allowed constant text[] := array['resolution', 'fps', 'too_long', 'too_short', 'blurry', 'dark', 'bright',
                                     'shaky', 'no_lines', 'unreadable'];
begin
    select * into tk from public.video_tokens t
     where t.token_hash = public.video_token_hash(p_token) and t.expires_at > now();
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    if tk.reports >= 5000 then return jsonb_build_object('status', 'too_many'); end if;
    update public.video_tokens set reports = reports + 1 where video_id = tk.video_id;
    select * into v from public.match_videos x where x.id = tk.video_id;
    if v.status not in ('queued', 'processing') then return jsonb_build_object('status', 'closed'); end if;

    if p_status is null or p_status not in ('processing', 'done', 'failed') then
        return jsonb_build_object('status', 'invalid', 'detail', 'status 只能是 processing、done、failed');
    end if;
    if p_width is not null and p_width not between 1 and 10000 or p_height is not null and p_height not between 1 and 10000
       or p_fps is not null and p_fps not between 0 and 1000 or p_seconds is not null and p_seconds not between 0 and 86400 then
        return jsonb_build_object('status', 'invalid', 'detail', '影片資訊超出範圍');
    end if;

    if p_status = 'processing' then
        if p_progress is null or p_progress not between 0 and 99 then
            return jsonb_build_object('status', 'invalid', 'detail', '處理中的進度要在 0–99');
        end if;
        update public.match_videos
           set status = 'processing', progress = p_progress,
               width = coalesce(p_width, width), height = coalesce(p_height, height),
               fps = coalesce(p_fps, fps), seconds = coalesce(p_seconds, seconds), updated_at = now()
         where id = v.id;
    elsif p_status = 'done' then
        if p_grade is null or p_grade not in ('ok', 'low', 'reject') then
            return jsonb_build_object('status', 'invalid', 'detail', '品質等級只能是 ok、low、reject');
        end if;
        if cardinality(coalesce(p_reasons, '{}')) > 10 or not coalesce(p_reasons, '{}') <@ allowed then
            return jsonb_build_object('status', 'invalid', 'detail', '原因代碼不認得');
        end if;
        update public.match_videos
           set status = 'done', progress = 100, grade = p_grade, reasons = coalesce(p_reasons, '{}'),
               width = coalesce(p_width, width), height = coalesce(p_height, height),
               fps = coalesce(p_fps, fps), seconds = coalesce(p_seconds, seconds), updated_at = now()
         where id = v.id;
        delete from public.video_tokens where video_id = v.id;
    else
        update public.match_videos
           set status = 'failed', error = left(btrim(coalesce(p_error, '')), 200), updated_at = now()
         where id = v.id;
        delete from public.video_tokens where video_id = v.id;
    end if;
    return jsonb_build_object('status', 'ok');
end $$;

-- ---------- 權限 ----------
revoke all on function
    public.video_token_hash(text), public.create_video_job(uuid, text), public.cancel_video_job(uuid),
    public.report_video_job(text, text, int, text, text[], int, int, numeric, numeric, text)
from public, anon;
revoke all on function public.video_token_hash(text) from authenticated;

grant execute on function public.create_video_job(uuid, text), public.cancel_video_job(uuid) to authenticated;
-- Colab 不用登入：只開這一個（理由見檔案開頭和 docs/SECURITY_REVIEW.md）
grant execute on function public.report_video_job(text, text, int, text, text[], int, int, numeric, numeric, text)
to anon, authenticated;
