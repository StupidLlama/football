-- ============================================================
-- v2.2 Next.js 網站
--   1. 網站在瀏覽器裡直接連 Supabase（不經過 FastAPI），所以把「登入的人可以對哪張表做什麼」寫清楚。
--      Supabase 預設把 public 的表「全部權限」給 authenticated（連 TRUNCATE 都有，而 TRUNCATE 不受 RLS 管），
--      這裡先全部收回，再只給 RLS 規則用得到的權限。每一列能不能看、能不能改，還是由 RLS 決定。
--   2. submit_self_rating：球員送出能力表（21 項分數 + 擅長位置 + 弱腳 + 暱稱 + 給球隊的話），一次存好。
--
-- 規則：已經執行過的檔案不要改；要改就新增 0005_xxx.sql。
-- ============================================================

-- ---------- 1. 資料表權限 ----------
revoke all on public.teams, public.memberships, public.players, public.ability_ratings,
              public.fixtures, public.duties from authenticated;

-- teams：大家看；教練只能改名稱、賽季、聯賽隊名（Team ID 要用 reset_team_code 重設）
grant select on public.teams to authenticated;
grant update (name, season, league_name) on public.teams to authenticated;

-- memberships：只能看（加入、離隊、認領都走資料庫函式）
grant select on public.memberships to authenticated;

-- players：看；教練新增、刪除；改資料（球員只能改自己的介紹欄位，players_guard 會擋）
grant select, insert, update, delete on public.players to authenticated;

-- ability_ratings：看；新增（自己的，或教練幫忙）；教練刪除。不能修改歷史紀錄
grant select, insert, delete on public.ability_ratings to authenticated;

-- 賽程、裁判任務：大家看，教練改
grant select, insert, update, delete on public.fixtures, public.duties to authenticated;

-- ---------- 2. 球員送出能力表 ----------
-- 每次送出都新增一筆（保留歷史，之後做進步追蹤）；網站顯示最新一筆。
-- 能力清單在 config/settings.toml，這裡只檢查格式：key 是英文小寫、分數是 1–5 的整數。
create or replace function public.submit_self_rating(team uuid, scores jsonb,
                                                     good text[] default '{}', bad text[] default '{}',
                                                     weak_side text default '', nickname text default null,
                                                     message text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    m record;
    k text;
    v jsonb;
    n int := 0;
    pos_re constant text := '^[A-Z]{2,3}(/[A-Z]{2,3})?$';
    now_at timestamptz := clock_timestamp();
begin
    if auth.uid() is null then return jsonb_build_object('status', 'unauthenticated'); end if;
    select * into m from public.memberships where team_id = team and user_id = auth.uid();
    if not found then return jsonb_build_object('status', 'not_member'); end if;
    if m.player_id is null then return jsonb_build_object('status', 'not_linked'); end if;

    -- 能力分數
    if scores is null or jsonb_typeof(scores) <> 'object' then
        return jsonb_build_object('status', 'invalid', 'detail', '能力分數格式不對');
    end if;
    for k, v in select * from jsonb_each(scores) loop
        n := n + 1;
        if k !~ '^[a-z][a-z0-9_]{0,29}$' or jsonb_typeof(v) <> 'number'
           or (v #>> '{}')::numeric not in (1, 2, 3, 4, 5) then
            return jsonb_build_object('status', 'invalid', 'detail', '每項能力要是 1–5 分');
        end if;
    end loop;
    if n not between 1 and 40 then
        return jsonb_build_object('status', 'invalid', 'detail', '能力數量不對');
    end if;

    -- 位置、弱腳、文字
    good := coalesce(good, '{}');
    bad := coalesce(bad, '{}');
    if cardinality(good) > 10 or cardinality(bad) > 10
       or exists (select 1 from unnest(good || bad) p where p is null or p !~ pos_re)
       or good && bad then
        return jsonb_build_object('status', 'invalid', 'detail', '位置格式不對，或同一個位置同時選了擅長和不擅長');
    end if;
    if coalesce(weak_side, '') not in ('', 'left', 'right') then
        return jsonb_build_object('status', 'invalid', 'detail', '弱腳只能是左、右或不確定');
    end if;
    if char_length(coalesce(nickname, '')) > 20 or char_length(coalesce(message, '')) > 300 then
        return jsonb_build_object('status', 'invalid', 'detail', '暱稱最多 20 字、給球隊的話最多 300 字');
    end if;

    -- 連按兩次「送出」只算一次
    if exists (select 1 from public.ability_ratings r
               where r.player_id = m.player_id and r.submitted_at > now_at - interval '10 seconds') then
        return jsonb_build_object('status', 'too_fast');
    end if;

    insert into public.ability_ratings (team_id, player_id, scores, source, submitted_at)
    values (team, m.player_id, scores, 'form', now_at);
    update public.players p
       set good_positions = good, bad_positions = bad, weak_side = coalesce(submit_self_rating.weak_side, ''),
           nickname = coalesce(trim(submit_self_rating.nickname), p.nickname),
           message = coalesce(trim(submit_self_rating.message), p.message)
     where p.id = m.player_id;
    return jsonb_build_object('status', 'ok', 'submitted_at', now_at);
end $$;

-- ---------- 權限：函式只給登入的人呼叫 ----------
revoke all on function public.submit_self_rating(uuid, jsonb, text[], text[], text, text, text) from public, anon;

grant execute on function public.submit_self_rating(uuid, jsonb, text[], text[], text, text, text) to authenticated;
