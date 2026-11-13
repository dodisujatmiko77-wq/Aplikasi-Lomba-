-- Tiruan minimal lingkungan Supabase untuk pengujian di PostgreSQL biasa.
-- TIDAK untuk dijalankan di Supabase.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login password 'authenticator' noinherit;
  end if;
end $$;
grant anon, authenticated, service_role to authenticator;

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated;
create schema if not exists auth;
grant usage on schema auth to anon, authenticated;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;

-- Tiruan realtime.send: mencatat broadcast agar dapat diperiksa oleh pengujian.
create schema if not exists realtime;
create table if not exists realtime.messages (
  id bigserial primary key, topic text, event text, payload jsonb, private boolean, inserted_at timestamptz default now()
);
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language sql as $$
  insert into realtime.messages (topic, event, payload, private) values (topic, event, payload, private)
$$;
