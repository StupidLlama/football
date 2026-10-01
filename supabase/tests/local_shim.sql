-- 只給「本機測試」用：在一般 PostgreSQL 上模擬 Supabase 內建的東西（auth.users、auth.uid()、角色）。
-- 真的 Supabase 已經有這些，不要在 Supabase 上執行這個檔案。
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                         (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;
-- Supabase 預設會把 public 的資料表權限給這些角色，再靠 RLS 擋
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
