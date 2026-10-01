-- ============================================================
-- v2.0 資料表（Supabase / PostgreSQL）
-- 規則：已經執行過的檔案不要改；要改結構就新增 0003_xxx.sql。
-- 帳號用 Supabase 內建的 auth.users，這裡只存「誰在哪一隊、什麼身分」。
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 隊伍 ----------
-- code = 大家輸入來加入的 Team ID（例如 CSIE-2026，每年可以開一個新的）
create table public.teams (
    id          uuid primary key default gen_random_uuid(),
    code        text not null unique check (code ~ '^[A-Za-z0-9_-]{3,40}$'),
    name        text not null,
    season      text,                       -- 例如 2026-27
    league_name text,                       -- 聯賽賽程表上的隊名，例如「資訊」
    created_at  timestamptz not null default now()
);

-- 教練碼等秘密：沒有任何 RLS 規則 → 只有後端（secret key）讀得到
create table public.team_secrets (
    team_id         uuid primary key references public.teams(id) on delete cascade,
    coach_code_hash text,                   -- 教練碼的雜湊（不存明碼）
    updated_at      timestamptz not null default now()
);

-- ---------- 成員（一個帳號可以加入多隊，每隊身分不同）----------
create table public.memberships (
    team_id    uuid not null references public.teams(id) on delete cascade,
    user_id    uuid not null references auth.users(id) on delete cascade,
    role       text not null default 'player' check (role in ('player', 'coach')),
    player_id  uuid,                        -- 這個帳號對應名單上的哪位球員（可以先空著）
    joined_at  timestamptz not null default now(),
    primary key (team_id, user_id)
);
create index memberships_user_idx on public.memberships(user_id);

-- ---------- 球員名單 ----------
create table public.players (
    id             uuid primary key default gen_random_uuid(),
    team_id        uuid not null references public.teams(id) on delete cascade,
    name           text not null,
    nickname       text not null default '',
    jersey_number  text,                    -- 還沒決定就空著
    badge          text check (badge in ('C', 'VC')),
    good_positions text[] not null default '{}',
    bad_positions  text[] not null default '{}',
    weak_side      text not null default '' check (weak_side in ('', 'left', 'right')),
    message        text not null default '',
    created_at     timestamptz not null default now(),
    unique (team_id, name)
);
create index players_team_idx on public.players(team_id);

alter table public.memberships
    add constraint memberships_player_fk foreign key (player_id) references public.players(id) on delete set null;

-- ---------- 能力自評（保留歷史，之後做賽季進步追蹤）----------
-- scores = {"passing": 4, "speed": 3, ...}；能力清單在 config/settings.toml，新增能力不用改資料表
create table public.ability_ratings (
    id           uuid primary key default gen_random_uuid(),
    team_id      uuid not null references public.teams(id) on delete cascade,
    player_id    uuid not null references public.players(id) on delete cascade,
    scores       jsonb not null check (jsonb_typeof(scores) = 'object'),
    source       text not null default 'form' check (source in ('form', 'google_form', 'import')),
    submitted_at timestamptz not null default now(),
    unique (player_id, submitted_at)
);
create index ability_ratings_player_idx on public.ability_ratings(player_id, submitted_at desc);

-- ---------- 聯賽賽程（整個聯賽的場次，每隊各存一份自己的）----------
create table public.fixtures (
    id          uuid primary key default gen_random_uuid(),
    team_id     uuid not null references public.teams(id) on delete cascade,
    day         date not null,
    start_time  time,
    end_time    time,
    home        text not null,
    away        text not null,
    round       int,
    match_no    int,
    home_score  int check (home_score >= 0),
    away_score  int check (away_score >= 0),
    referee     text not null default '',
    linesmen    text[] not null default '{}',
    note        text not null default '',
    analyzed_at timestamptz,                -- 影片分析完成的時間（v3）；三種狀態：即將進行 / 已結束 / 已分析
    unique (team_id, day, start_time, home, away),
    check ((home_score is null) = (away_score is null))
);
create index fixtures_team_day_idx on public.fixtures(team_id, day);

-- ---------- 裁判任務（我們隊要派人的場次）----------
create table public.duties (
    id          uuid primary key default gen_random_uuid(),
    team_id     uuid not null references public.teams(id) on delete cascade,
    fixture_id  uuid not null references public.fixtures(id) on delete cascade,
    role        text not null check (role in ('主審', '邊審')),
    slot        int not null default 0,
    player_id   uuid references public.players(id) on delete set null,
    assigned_by uuid references auth.users(id) on delete set null,
    updated_at  timestamptz not null default now(),
    unique (fixture_id, role, slot)
);
create index duties_team_idx on public.duties(team_id);
