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
-- v2.6：模擬 pg_net（Supabase 內建的 HTTP 外掛）。真的 pg_net 會把要送的請求放進 net.http_request_queue，
-- 交易提交後才真的送出；這裡只記下來，讓 rls_test 檢查「新主貼文有排進 Discord 通知、回覆沒有」。
create schema if not exists net;
create table if not exists net.http_request_queue (
  id bigserial primary key, method text, url text, headers jsonb, body bytea, timeout_milliseconds int
);
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
                                         headers jsonb default '{"Content-Type": "application/json"}',
                                         timeout_milliseconds int default 5000)
returns bigint language sql as $$
  insert into net.http_request_queue (method, url, headers, body, timeout_milliseconds)
  values ('POST', url, headers, convert_to(body::text, 'utf8'), timeout_milliseconds) returning id
$$;
-- v2.6：Supabase 預設有 supabase_realtime 這個 publication（Realtime 用）
do $$ begin
  if not exists (select from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
end $$;
