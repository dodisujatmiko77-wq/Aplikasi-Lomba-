-- Verifikasi keamanan pasca-deploy. Jalankan di Supabase SQL Editor SETELAH semua migrasi + seed.
-- Setiap baris hasil harus berstatus OK. Baris GAGAL berarti ada celah yang harus ditutup sebelum lomba.
with
t as (select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'),
anon_tables as (select distinct table_name from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'),
public_fns as (
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
allowed(name) as (values ('participant_login'), ('participant_logout'), ('participant_get_state'), ('submit_answer'),
                         ('get_live_state'), ('get_public_results'), ('get_landing_data'))
select 'RLS aktif di semua tabel public' as pemeriksaan,
       case when count(*) filter (where not relrowsecurity) = 0 then 'OK' else 'GAGAL: ' || string_agg(relname, ', ') filter (where not relrowsecurity) end as hasil
from t
union all
select 'role anon tidak punya hak pada tabel apa pun',
       case when count(*) = 0 then 'OK' else 'GAGAL: ' || string_agg(table_name, ', ') end from anon_tables
union all
select 'hanya RPC publik yang dapat dipanggil anon',
       case when count(*) = 0 then 'OK' else 'GAGAL: ' || string_agg(proname, ', ') end
from public_fns where proname not in (select name from allowed)
union all
select 'seluruh 7 RPC publik tersedia',
       case when (select count(*) from public_fns where proname in (select name from allowed)) = 7 then 'OK' else 'GAGAL' end
union all
select 'kredensial/sesi/rate-limit tertutup dari role authenticated',
       case when not exists (select 1 from information_schema.role_table_grants
                             where grantee = 'authenticated' and table_schema = 'public'
                               and table_name in ('participant_credentials', 'participant_sessions', 'rate_limits')) then 'OK' else 'GAGAL' end
union all
select 'skor/jawaban/klasemen/audit tidak dapat ditulis dari klien',
       case when not exists (select 1 from information_schema.role_table_grants
                             where grantee = 'authenticated' and table_schema = 'public'
                               and table_name in ('participant_answers', 'scores', 'leaderboards', 'audit_logs')
                               and privilege_type in ('INSERT', 'UPDATE', 'DELETE')) then 'OK' else 'GAGAL' end
union all
select 'fungsi internal (_close_question, dst.) tidak dapat dipanggil anon/authenticated',
       case when not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                             where n.nspname = 'public' and p.proname in ('_close_question', '_rebuild_leaderboard', '_question_payload', '_upsert_participant', '_notify', '_leaderboard_ranked', '_recompute_round')
                               and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))) then 'OK' else 'GAGAL' end
union all
select 'seed: 3 jenjang & >= 15 kecamatan & 2 role',
       case when (select count(*) from education_levels) >= 3 and (select count(*) from districts) >= 15 and (select count(*) from roles) = 2 then 'OK' else 'GAGAL' end
union all
select 'tidak ada akun superadmin tertanam di seed (jalankan bootstrap_superadmin sendiri)',
       'INFO: ' || (select count(*) from profiles p join roles r on r.id = p.role_id where r.key = 'superadmin')::text || ' superadmin aktif saat ini'
order by 1;
