-- ============================================================
-- v2.0 權限規則（Row Level Security）
-- 原則：
--   1. 只看得到自己所屬隊伍的資料（A 隊讀不到 B 隊）
--   2. 只有教練能改賽程、排裁判、改名單
--   3. 球員可以新增「自己」的能力自評
--   4. 沒登入（anon）什麼都看不到
--   5. team_secrets 沒有任何規則 = 只有後端的 secret key 讀得到
-- 加入隊伍、升級成教練由後端處理（v2.1），所以 memberships 沒有寫入規則。
-- ============================================================

-- ---------- 判斷用的函式 ----------
-- security definer：在函式裡查 memberships 時不會再觸發 RLS（避免無限迴圈）
create or replace function public.is_member(t uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
    select exists (select 1 from public.memberships m where m.team_id = t and m.user_id = auth.uid());
$$;

create or replace function public.is_coach(t uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
    select exists (select 1 from public.memberships m
                   where m.team_id = t and m.user_id = auth.uid() and m.role = 'coach');
$$;

create or replace function public.is_own_player(p uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
    select exists (select 1 from public.memberships m where m.player_id = p and m.user_id = auth.uid());
$$;

revoke all on function public.is_member(uuid), public.is_coach(uuid), public.is_own_player(uuid) from public, anon;
grant execute on function public.is_member(uuid), public.is_coach(uuid), public.is_own_player(uuid) to authenticated;

-- ---------- 打開 RLS ----------
alter table public.teams           enable row level security;
alter table public.team_secrets    enable row level security;
alter table public.memberships     enable row level security;
alter table public.players         enable row level security;
alter table public.ability_ratings enable row level security;
alter table public.fixtures        enable row level security;
alter table public.duties          enable row level security;

-- 沒登入的人：什麼都不給
revoke all on public.teams, public.team_secrets, public.memberships, public.players,
              public.ability_ratings, public.fixtures, public.duties from anon;
-- team_secrets 連登入的人也不給（只有後端）
revoke all on public.team_secrets from authenticated;

-- ---------- teams ----------
create policy teams_select on public.teams
    for select to authenticated using (public.is_member(id));
create policy teams_update on public.teams
    for update to authenticated using (public.is_coach(id)) with check (public.is_coach(id));

-- ---------- memberships：看得到同隊的人 ----------
create policy memberships_select on public.memberships
    for select to authenticated using (public.is_member(team_id));

-- ---------- players ----------
create policy players_select on public.players
    for select to authenticated using (public.is_member(team_id));
create policy players_insert on public.players
    for insert to authenticated with check (public.is_coach(team_id));
create policy players_update on public.players
    for update to authenticated
    using (public.is_coach(team_id) or public.is_own_player(id))
    with check (public.is_coach(team_id) or public.is_own_player(id));
create policy players_delete on public.players
    for delete to authenticated using (public.is_coach(team_id));

-- ---------- ability_ratings ----------
create policy ratings_select on public.ability_ratings
    for select to authenticated using (public.is_member(team_id));
create policy ratings_insert on public.ability_ratings
    for insert to authenticated
    with check (public.is_member(team_id)
                and (public.is_coach(team_id) or public.is_own_player(player_id))
                and exists (select 1 from public.players p where p.id = player_id and p.team_id = ability_ratings.team_id));
create policy ratings_delete on public.ability_ratings
    for delete to authenticated using (public.is_coach(team_id));

-- ---------- fixtures：大家看，教練改 ----------
create policy fixtures_select on public.fixtures
    for select to authenticated using (public.is_member(team_id));
create policy fixtures_write on public.fixtures
    for all to authenticated using (public.is_coach(team_id)) with check (public.is_coach(team_id));

-- ---------- duties：大家看，教練排 ----------
create policy duties_select on public.duties
    for select to authenticated using (public.is_member(team_id));
create policy duties_write on public.duties
    for all to authenticated using (public.is_coach(team_id)) with check (public.is_coach(team_id));
