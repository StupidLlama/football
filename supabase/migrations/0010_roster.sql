-- ============================================================
-- v2.6.1 名單管理
--   1. add_player：球隊管理員直接新增名單上的球員（不用等對方加入、認領）
--   2. edit_player：球隊管理員改球員的姓名、背號、隊長／副隊長
--      （球員自己能改的暱稱、位置、慣用腳、給球隊的話不在這裡，還是走「我的」頁面）
--   規則（兩個函式共用 roster_problem）：
--     - 姓名 1–40 字，同隊不能重複
--     - 背號：空白 = 還沒決定；只能是 0–999 的數字（存成去掉前面 0 的字串，07 → 7）；同隊不能重複
--     - 隊長（C）、副隊長（VC）同隊各只能有一位；要換人先把原本的人改掉
--     - 只在「有改到」的欄位檢查格式和重複：舊資料（v1 匯入）就算本來有重複，改別的欄位也不會被擋
--   隊長／副隊長跟球隊管理員是兩件事（players.badge 和 memberships.role），同一個人可以兩個都是。
--
-- 規則：已經執行過的檔案不要改；要改就新增 0011_xxx.sql。
-- ============================================================

-- ---------- 0. 共用檢查：回傳 null = 沒問題；有問題就回傳 {"status": ...} ----------
-- self：正在編輯的球員（新增時是 null）。o_*：原本的值（新增時是 null），沒改到的欄位不檢查。
create or replace function public.roster_problem(team uuid, self uuid, new_name text, new_jersey text, new_badge text,
                                                 o_name text, o_jersey text, o_badge text)
returns jsonb
language plpgsql stable
set search_path = public
as $$
declare holder text;
begin
    if new_name = '' or char_length(new_name) > 40 then
        return jsonb_build_object('status', 'invalid', 'detail', '姓名要 1–40 字');
    end if;
    if new_name is distinct from o_name
       and exists (select 1 from public.players p where p.team_id = team and p.name = new_name and p.id is distinct from self) then
        return jsonb_build_object('status', 'taken', 'detail', '名單上已經有「' || new_name || '」了');
    end if;

    if new_jersey is distinct from o_jersey and new_jersey is not null then
        if new_jersey !~ '^[0-9]{1,3}$' then
            return jsonb_build_object('status', 'invalid', 'detail', '背號只能是 0–999 的數字');
        end if;
        select p.name into holder from public.players p
         where p.team_id = team and p.jersey_number = new_jersey and p.id is distinct from self limit 1;
        if found then
            return jsonb_build_object('status', 'taken', 'detail', '背號 ' || new_jersey || ' 已經是「' || holder || '」在用');
        end if;
    end if;

    if new_badge is distinct from o_badge and new_badge is not null then
        if new_badge not in ('C', 'VC') then
            return jsonb_build_object('status', 'invalid', 'detail', '隊長標記只能是 C 或 VC');
        end if;
        select p.name into holder from public.players p
         where p.team_id = team and p.badge = new_badge and p.id is distinct from self limit 1;
        if found then
            return jsonb_build_object('status', 'taken', 'detail',
                case new_badge when 'C' then '隊長' when 'VC' then '副隊長' end || '目前是「' || holder || '」，請先把他的標記拿掉');
        end if;
    end if;
    return null;
end $$;

-- 背號整理：去掉空白；空的 = null；純數字就去掉前面的 0（07 → 7）；其他原樣交給 roster_problem 擋
create or replace function public.clean_jersey(raw text)
returns text
language sql immutable
set search_path = public
as $$
    select case
        when nullif(trim(coalesce(raw, '')), '') is null then null
        when trim(raw) ~ '^[0-9]{1,3}$' then (trim(raw)::int)::text
        else trim(raw)
    end
$$;

-- ---------- 1. 新增球員 ----------
create or replace function public.add_player(team uuid, name text, jersey text default null, badge text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    n text := trim(coalesce(name, ''));
    j text := public.clean_jersey(jersey);
    b text := nullif(trim(coalesce(badge, '')), '');
    problem jsonb;
    pid uuid;
begin
    if auth.uid() is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    if not exists (select 1 from public.teams where id = team) then return jsonb_build_object('status', 'not_found'); end if;
    if not public.can_manage(team) then return jsonb_build_object('status', 'forbidden'); end if;
    if (select count(*) from public.players p where p.team_id = team) >= 80 then
        return jsonb_build_object('status', 'invalid', 'detail', '名單最多 80 人，請先刪掉離隊的人');
    end if;
    problem := public.roster_problem(team, null, n, j, b, null, null, null);
    if problem is not null then return problem; end if;
    insert into public.players (team_id, name, jersey_number, badge) values (team, n, j, b) returning id into pid;
    return jsonb_build_object('status', 'ok', 'id', pid);
end $$;

-- ---------- 2. 改球員的姓名、背號、隊長／副隊長 ----------
create or replace function public.edit_player(player uuid, name text, jersey text default null, badge text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    p record;
    n text := trim(coalesce(name, ''));
    j text := public.clean_jersey(jersey);
    b text := nullif(trim(coalesce(badge, '')), '');
    problem jsonb;
begin
    if auth.uid() is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    select * into p from public.players where id = player;
    -- 別隊的人連「有沒有這個球員」都不告訴他
    if not found or not public.is_member(p.team_id) and not public.is_admin() then
        return jsonb_build_object('status', 'not_found');
    end if;
    if not public.can_manage(p.team_id) then return jsonb_build_object('status', 'forbidden'); end if;
    problem := public.roster_problem(p.team_id, p.id, n, j, b, p.name, p.jersey_number, p.badge);
    if problem is not null then return problem; end if;
    update public.players set name = n, jersey_number = j, badge = b where id = player;
    return jsonb_build_object('status', 'ok');
end $$;

-- ---------- 權限 ----------
revoke all on function
    public.roster_problem(uuid, uuid, text, text, text, text, text, text), public.clean_jersey(text),
    public.add_player(uuid, text, text, text), public.edit_player(uuid, text, text, text)
from public, anon;
-- 小工具只給資料庫內部用
revoke all on function public.roster_problem(uuid, uuid, text, text, text, text, text, text), public.clean_jersey(text)
from authenticated;

grant execute on function public.add_player(uuid, text, text, text), public.edit_player(uuid, text, text, text)
to authenticated;
