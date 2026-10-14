-- v2.10：執行 0014_security.sql 之前先跑這個（Supabase → SQL Editor）。只有讀取，不會改任何資料。
-- 每一列的 bad 都要是 0。不是 0 的話先不要跑 0014，把結果貼給助手：
-- 0014 的上限用 NOT VALID，舊資料不會讓 migration 失敗，但那幾筆舊資料之後只要被修改（例如改背號）就會被擋下。
select 'players_name_len' as rule, count(*) as bad from public.players
 where not coalesce(char_length(btrim(name)) between 1 and 40, true)
union all
select 'players_nickname_len', count(*) from public.players where not coalesce(char_length(nickname) <= 40, true)
union all
select 'players_message_len', count(*) from public.players where not coalesce(char_length(message) <= 1000, true)
union all
select 'players_jersey_len', count(*) from public.players where not coalesce(char_length(jersey_number) <= 3, true)
union all
select 'players_positions_ok', count(*) from public.players
 where not coalesce(
        cardinality(good_positions) <= 10 and cardinality(bad_positions) <= 10
        and array_to_string(good_positions || bad_positions, ',', '?')
            ~ '^([A-Z]{2,3}(/[A-Z]{2,3})?)?(,[A-Z]{2,3}(/[A-Z]{2,3})?)*$'
        and not ('' = any(good_positions || bad_positions))
        and not (good_positions && bad_positions), true)
union all
select 'teams_name_len', count(*) from public.teams where not coalesce(char_length(btrim(name)) between 1 and 40, true)
union all
select 'teams_season_len', count(*) from public.teams where not coalesce(char_length(season) <= 20, true)
union all
select 'teams_league_name_len', count(*) from public.teams where not coalesce(char_length(league_name) <= 40, true)
union all
select 'fixtures_text_len', count(*) from public.fixtures
 where not coalesce(
        char_length(home) <= 40 and char_length(away) <= 40 and char_length(referee) <= 40
        and char_length(note) <= 500
        and cardinality(linesmen) <= 4 and char_length(array_to_string(linesmen, ',')) <= 200, true);
