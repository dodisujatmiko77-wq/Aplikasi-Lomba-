-- =====================================================================
-- LOMBA RANGKING 1 — 0002: FUNGSI BANTU, TRIGGER, RLS, STORAGE
-- =====================================================================

-- ---------------------------------------------------------------------
-- Fungsi bantu otorisasi (dipakai kebijakan RLS dan semua RPC)
-- ---------------------------------------------------------------------
create or replace function public._is_api_role() returns boolean
language sql stable as $$ select current_user in ('authenticated', 'anon') $$;

create or replace function public.current_role_key() returns text
language sql stable security definer set search_path = public as $$
  select r.key from profiles p join roles r on r.id = p.role_id
  where p.id = auth.uid() and p.is_active
$$;

create or replace function public.is_active_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.is_active)
$$;

create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_key() = 'superadmin', false)
$$;

create or replace function public.can_access_event(p_event_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_superadmin() or (
    public.is_active_admin() and exists (
      select 1 from admin_assignments a where a.admin_id = auth.uid() and a.event_id = p_event_id))
$$;

-- p_perm: 'participants' | 'questions' | 'control' | 'reports'
create or replace function public.has_event_permission(p_event_id uuid, p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_superadmin() or (
    public.is_active_admin() and exists (
      select 1 from admin_assignments a
      where a.admin_id = auth.uid() and a.event_id = p_event_id
        and case p_perm
              when 'participants' then a.can_manage_participants
              when 'questions'    then a.can_manage_questions
              when 'control'      then a.can_control_competition
              when 'reports'      then a.can_view_reports
              else false end))
$$;

create or replace function public.session_event_id(p_session_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select event_id from competition_sessions where id = p_session_id
$$;

create or replace function public.round_event_id(p_round_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select s.event_id from competition_rounds r join competition_sessions s on s.id = r.session_id
  where r.id = p_round_id
$$;

create or replace function public.question_event_id(p_question_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select event_id from questions where id = p_question_id
$$;

create or replace function public.package_event_id(p_package_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select event_id from question_packages where id = p_package_id
$$;

create or replace function public.participant_visible(p_participant_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_superadmin() or exists (
    select 1 from event_participants ep
    where ep.participant_id = p_participant_id and public.can_access_event(ep.event_id))
$$;

-- ---------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------
create or replace function public._audit(
  p_action text, p_entity text, p_entity_id uuid, p_event_id uuid, p_details jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs (actor_id, actor_label, action, entity, entity_id, event_id, details)
  values (
    auth.uid(),
    coalesce((select nullif(full_name, '') from profiles where id = auth.uid()),
             (select email from profiles where id = auth.uid()),
             case when auth.uid() is null then 'sistem' else 'tidak dikenal' end),
    p_action, p_entity, p_entity_id, p_event_id, coalesce(p_details, '{}'::jsonb));
end $$;

create or replace function public._audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_event uuid;
  v_details jsonb;
begin
  v_event := case when tg_table_name = 'events' then (v_row ->> 'id')::uuid
                  else nullif(v_row ->> 'event_id', '')::uuid end;
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('lama', v_old -> n.key, 'baru', n.value)), '{}'::jsonb)
      into v_details
    from jsonb_each(v_new) n
    where n.value is distinct from v_old -> n.key and n.key not in ('updated_at');
    if v_details = '{}'::jsonb then return null; end if;
  else
    v_details := v_row - 'created_at' - 'updated_at';
  end if;
  perform public._audit(lower(tg_op), tg_table_name,
                        case when v_row ? 'id' then (v_row ->> 'id')::uuid end, v_event, v_details);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['events', 'event_settings', 'districts', 'education_levels', 'participants',
                           'event_participants', 'questions', 'question_packages', 'admin_assignments',
                           'profiles', 'announcements', 'question_categories']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public._audit_row_change()', 'trg_audit_' || t, t);
  end loop;
end $$;

create or replace function public._audit_app_settings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public._audit(lower(tg_op), 'app_settings', null, null,
                        jsonb_build_object('key', coalesce(new.key, old.key), 'nilai', case when tg_op <> 'DELETE' then new.value end));
  return null;
end $$;
create trigger trg_audit_app_settings after insert or update or delete on public.app_settings
  for each row execute function public._audit_app_settings();

-- ---------------------------------------------------------------------
-- Trigger umum
-- ---------------------------------------------------------------------
create or replace function public._set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'events', 'event_settings', 'participants', 'questions',
                           'question_packages', 'competition_sessions', 'app_settings']
  loop
    execute format('create trigger %I before update on public.%I
                    for each row execute function public._set_updated_at()', 'trg_updated_' || t, t);
  end loop;
end $$;

-- Profil otomatis untuk setiap akun Supabase Auth baru: role admin, NONAKTIF sampai diaktifkan superadmin.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.roles (key, name) values ('admin', 'Admin') on conflict (key) do nothing;
    insert into public.profiles (id, role_id, full_name, email, is_active)
    values (new.id, (select id from public.roles where key = 'admin'),
            coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email, false)
    on conflict (id) do nothing;
  exception when others then
    -- Pembuatan akun Auth tidak boleh diblokir oleh profil; bootstrap_superadmin akan membuat profil bila belum ada.
    raise warning 'handle_new_user gagal untuk %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Bootstrap Superadmin pertama. HANYA dapat dijalankan dari SQL Editor (role postgres);
-- tidak dapat dipanggil lewat API. Lihat docs/DEPLOYMENT.md.
create or replace function public.bootstrap_superadmin(p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if public._is_api_role() or session_user in ('authenticator', 'authenticated', 'anon') then
    raise exception 'bootstrap_superadmin hanya boleh dijalankan dari SQL Editor';
  end if;
  if exists (select 1 from profiles p join roles r on r.id = p.role_id where r.key = 'superadmin' and p.is_active) then
    raise exception 'Superadmin sudah ada. Gunakan menu Manajemen Admin untuk menambah superadmin lain.';
  end if;
  insert into roles (key, name) values ('superadmin', 'Superadmin'), ('admin', 'Admin') on conflict (key) do nothing;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Akun % belum ada. Buat dulu di Supabase Dashboard > Authentication > Users.', p_email;
  end if;
  insert into profiles (id, role_id, full_name, email, is_active)
  values (v_user, (select id from roles where key = 'superadmin'), 'Superadmin', lower(trim(p_email)), true)
  on conflict (id) do update set role_id = excluded.role_id, is_active = true;
  perform public._audit('bootstrap_superadmin', 'profiles', v_user, null, jsonb_build_object('email', p_email));
  return 'Superadmin aktif: ' || p_email;
end $$;

-- Pelindung profil: hanya superadmin yang boleh mengubah role / status aktif.
create or replace function public._guard_profiles() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if public._is_api_role() and not public.is_superadmin() then
    if new.role_id is distinct from old.role_id or new.is_active is distinct from old.is_active
       or new.email is distinct from old.email or new.id is distinct from old.id then
      raise exception 'Tidak diizinkan mengubah role atau status akun' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_profiles before update on public.profiles
  for each row execute function public._guard_profiles();

-- Setiap event otomatis memiliki baris konfigurasi.
create or replace function public._event_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare d jsonb := coalesce((select value from app_settings where key = 'default_scoring'), '{}'::jsonb);
begin
  insert into event_settings (event_id, base_points, speed_bonus, wrong_penalty, duration_seconds,
                              lead_seconds, rounding_mode, rounding_decimals)
  values (new.id,
          coalesce((d ->> 'base_points')::numeric, 100), coalesce((d ->> 'speed_bonus')::numeric, 50),
          coalesce((d ->> 'wrong_penalty')::numeric, 0), coalesce((d ->> 'duration_seconds')::int, 20),
          coalesce((d ->> 'lead_seconds')::int, 3), coalesce(d ->> 'rounding_mode', 'round'),
          coalesce((d ->> 'rounding_decimals')::int, 2))
  on conflict (event_id) do nothing;
  return new;
end $$;
create trigger trg_event_after_insert after insert on public.events
  for each row execute function public._event_after_insert();

-- ---------------------------------------------------------------------
-- Pelindung kolom mesin lomba: klien tidak dapat mengubah status/waktu secara langsung.
-- PENTING: fungsi pelindung sengaja SECURITY INVOKER. Dengan begitu current_user adalah
-- 'authenticated' saat klien menulis langsung ke tabel, dan pemilik fungsi saat penulisan
-- datang dari RPC mesin lomba (SECURITY DEFINER) — hanya jalur kedua yang boleh mengubah status.
-- ---------------------------------------------------------------------
create or replace function public._random_code(p_len int) returns text
language sql volatile set search_path = public, extensions as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1), '')
  from generate_series(1, p_len)
$$;

create or replace function public._guard_sessions() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.code is null or new.code = '' then
      loop
        new.code := public._random_code(6);
        exit when not exists (select 1 from competition_sessions where code = new.code);
      end loop;
    end if;
    if public._is_api_role() then
      new.status := 'draft'; new.display_screen := 'waiting';
      new.current_round_id := null; new.current_question_id := null; new.results_published := false;
      new.opened_at := null; new.started_at := null; new.paused_at := null;
      new.finished_at := null; new.winners_announced_at := null;
      new.created_by := auth.uid();
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if public._is_api_role() and (
         new.status is distinct from old.status or new.display_screen is distinct from old.display_screen
      or new.current_round_id is distinct from old.current_round_id
      or new.current_question_id is distinct from old.current_question_id
      or new.results_published is distinct from old.results_published
      or new.opened_at is distinct from old.opened_at or new.started_at is distinct from old.started_at
      or new.paused_at is distinct from old.paused_at or new.finished_at is distinct from old.finished_at
      or new.winners_announced_at is distinct from old.winners_announced_at
      or new.event_id is distinct from old.event_id or new.code is distinct from old.code
      or (new.education_level_id is distinct from old.education_level_id and old.status <> 'draft')) then
      raise exception 'Status sesi hanya dapat diubah melalui kontrol pertandingan' using errcode = '42501';
    end if;
    return new;
  else
    if public._is_api_role() and old.status not in ('draft', 'cancelled') and not public.is_superadmin() then
      raise exception 'Sesi yang sudah dibuka hanya dapat dihapus oleh Superadmin' using errcode = '42501';
    end if;
    return old;
  end if;
end $$;
create trigger trg_guard_sessions before insert or update or delete on public.competition_sessions
  for each row execute function public._guard_sessions();

create or replace function public._guard_rounds() returns trigger
language plpgsql security invoker set search_path = public as $$
declare es event_settings;
begin
  if tg_op = 'INSERT' then
    select e.* into es from event_settings e
      join competition_sessions s on s.event_id = e.event_id where s.id = new.session_id;
    new.base_points       := coalesce(new.base_points, es.base_points, 100);
    new.speed_bonus       := coalesce(new.speed_bonus, es.speed_bonus, 50);
    new.wrong_penalty     := coalesce(new.wrong_penalty, es.wrong_penalty, 0);
    new.duration_seconds  := coalesce(new.duration_seconds, es.duration_seconds, 20);
    new.lead_seconds      := coalesce(new.lead_seconds, es.lead_seconds, 3);
    new.rounding_mode     := coalesce(new.rounding_mode, es.rounding_mode, 'round');
    new.rounding_decimals := coalesce(new.rounding_decimals, es.rounding_decimals, 2);
    if new.sequence is null then
      select coalesce(max(sequence), 0) + 1 into new.sequence from competition_rounds where session_id = new.session_id;
    end if;
    if public._is_api_role() then
      new.status := 'pending'; new.started_at := null; new.finished_at := null;
      if (select status from competition_sessions where id = new.session_id) in ('finished', 'cancelled') then
        raise exception 'Sesi sudah selesai' using errcode = '42501';
      end if;
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if public._is_api_role() and (old.status <> 'pending' or new.status <> 'pending'
        or new.session_id is distinct from old.session_id
        or new.started_at is not null or new.finished_at is not null) then
      raise exception 'Babak yang sudah berjalan tidak dapat diubah' using errcode = '42501';
    end if;
    return new;
  else
    -- Saat sesi dihapus (cascade), baris induk sudah tidak ada → izinkan.
    if public._is_api_role() and old.status <> 'pending'
       and exists (select 1 from competition_sessions where id = old.session_id) then
      raise exception 'Babak yang sudah berjalan tidak dapat dihapus' using errcode = '42501';
    end if;
    return old;
  end if;
end $$;
create trigger trg_guard_rounds before insert or update or delete on public.competition_rounds
  for each row execute function public._guard_rounds();

create or replace function public._guard_competition_questions() returns trigger
language plpgsql security invoker set search_path = public as $$
declare r competition_rounds; v_event uuid; q questions;
begin
  if tg_op = 'INSERT' then
    select * into r from competition_rounds where id = new.round_id;
    select event_id into v_event from competition_sessions where id = r.session_id;
    select * into q from questions where id = new.question_id;
    if q.event_id is distinct from v_event then
      raise exception 'Soal bukan milik event ini' using errcode = '23514';
    end if;
    if not exists (select 1 from question_options o where o.question_id = q.id and o.is_correct) then
      raise exception 'Soal belum memiliki kunci jawaban' using errcode = '23514';
    end if;
    new.duration_seconds := coalesce(new.duration_seconds, r.duration_seconds);
    if new.sequence is null then
      select coalesce(max(sequence), 0) + 1 into new.sequence from competition_questions where round_id = new.round_id;
    end if;
    -- Urutan opsi ditetapkan sekali di server agar monitor & semua HP menampilkan urutan yang sama.
    if q.type = 'short_answer' then
      new.option_order := '{}';
    else
      select coalesce(array_agg(o.id order by case when r.shuffle_options and q.type = 'multiple_choice'
                                                   then random() else o.sort_order end, o.id), '{}')
        into new.option_order
      from question_options o where o.question_id = q.id;
    end if;
    if public._is_api_role() then
      if r.status <> 'pending' then
        raise exception 'Soal hanya dapat ditambahkan ke babak yang belum dimulai' using errcode = '42501';
      end if;
      new.status := 'pending'; new.started_at := null; new.deadline_at := null; new.paused_at := null;
      new.closed_at := null; new.revealed_at := null; new.cancelled_at := null; new.cancel_reason := null;
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if public._is_api_role() and (old.status <> 'pending' or new.status <> 'pending'
        or new.round_id is distinct from old.round_id or new.question_id is distinct from old.question_id
        or new.option_order is distinct from old.option_order
        or new.started_at is not null or new.deadline_at is not null) then
      raise exception 'Soal tayang hanya dapat diubah melalui kontrol pertandingan' using errcode = '42501';
    end if;
    return new;
  else
    if public._is_api_role() and old.status <> 'pending'
       and exists (select 1 from competition_rounds where id = old.round_id) then
      raise exception 'Soal yang sudah tayang tidak dapat dihapus' using errcode = '42501';
    end if;
    return old;
  end if;
end $$;
create trigger trg_guard_competition_questions before insert or update or delete on public.competition_questions
  for each row execute function public._guard_competition_questions();

create or replace function public._guard_session_participants() returns trigger
language plpgsql security invoker set search_path = public as $$
declare s competition_sessions;
begin
  select * into s from competition_sessions where id = coalesce(new.session_id, old.session_id);
  if tg_op = 'INSERT' then
    if not exists (select 1 from event_participants ep join participants p on p.id = ep.participant_id
                   where ep.event_id = s.event_id and ep.participant_id = new.participant_id
                     and p.education_level_id = s.education_level_id and p.is_active
                     and ep.registration_status = 'verified'
                     and ep.participation_status in ('registered', 'active')) then
      raise exception 'Peserta harus terverifikasi pada event dan jenjang sesi ini' using errcode = '23514';
    end if;
    if public._is_api_role() then new.joined_at := null; new.last_seen_at := null; end if;
    if s.status in ('finished', 'cancelled') then
      raise exception 'Sesi sudah selesai' using errcode = '42501';
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if public._is_api_role() then
      raise exception 'Data kehadiran dikelola sistem' using errcode = '42501';
    end if;
    return new;
  else
    if public._is_api_role() and s.id is not null and s.status not in ('draft', 'open') then
      raise exception 'Peserta tidak dapat dikeluarkan setelah lomba berjalan' using errcode = '42501';
    end if;
    return old;
  end if;
end $$;
create trigger trg_guard_session_participants before insert or update or delete on public.session_participants
  for each row execute function public._guard_session_participants();

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- roles / profiles / penugasan
create policy roles_select on public.roles for select to authenticated using (true);

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_superadmin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_superadmin())
  with check (id = auth.uid() or public.is_superadmin());

create policy assignments_select on public.admin_assignments for select to authenticated
  using (admin_id = auth.uid() or public.is_superadmin());
create policy assignments_write on public.admin_assignments for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- master data
create policy districts_select on public.districts for select to authenticated using (public.is_active_admin());
create policy districts_write on public.districts for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());
create policy levels_select on public.education_levels for select to authenticated using (public.is_active_admin());
create policy levels_write on public.education_levels for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- event
create policy events_select on public.events for select to authenticated using (public.can_access_event(id));
create policy events_write on public.events for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());
create policy event_settings_select on public.event_settings for select to authenticated
  using (public.can_access_event(event_id));
create policy event_settings_update on public.event_settings for update to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- peserta (INSERT/DELETE peserta & seluruh kredensial hanya lewat RPC)
create policy participants_select on public.participants for select to authenticated
  using (public.participant_visible(id));
create policy participants_update on public.participants for update to authenticated
  using (public.is_superadmin() or exists (
    select 1 from public.event_participants ep
    where ep.participant_id = participants.id and public.has_event_permission(ep.event_id, 'participants')))
  with check (true);
create policy event_participants_select on public.event_participants for select to authenticated
  using (public.can_access_event(event_id));
create policy event_participants_write on public.event_participants for all to authenticated
  using (public.has_event_permission(event_id, 'participants'))
  with check (public.has_event_permission(event_id, 'participants'));

-- bank soal (struktur soal + opsi ditulis lewat RPC admin_save_question)
create policy categories_select on public.question_categories for select to authenticated using (public.is_active_admin());
create policy categories_insert on public.question_categories for insert to authenticated with check (public.is_active_admin());
create policy categories_update on public.question_categories for update to authenticated
  using (public.is_active_admin()) with check (public.is_active_admin());
create policy categories_delete on public.question_categories for delete to authenticated using (public.is_superadmin());

create policy questions_select on public.questions for select to authenticated using (public.can_access_event(event_id));
create policy questions_update on public.questions for update to authenticated
  using (public.has_event_permission(event_id, 'questions'))
  with check (public.has_event_permission(event_id, 'questions'));
create policy questions_delete on public.questions for delete to authenticated
  using (public.has_event_permission(event_id, 'questions'));
create policy options_select on public.question_options for select to authenticated
  using (public.can_access_event(public.question_event_id(question_id)));

create policy packages_select on public.question_packages for select to authenticated using (public.can_access_event(event_id));
create policy packages_write on public.question_packages for all to authenticated
  using (public.has_event_permission(event_id, 'questions'))
  with check (public.has_event_permission(event_id, 'questions'));
create policy package_questions_select on public.package_questions for select to authenticated
  using (public.can_access_event(public.package_event_id(package_id)));
create policy package_questions_write on public.package_questions for all to authenticated
  using (public.has_event_permission(public.package_event_id(package_id), 'questions'))
  with check (public.has_event_permission(public.package_event_id(package_id), 'questions')
              and public.question_event_id(question_id) = public.package_event_id(package_id));

-- kompetisi
create policy sessions_select on public.competition_sessions for select to authenticated using (public.can_access_event(event_id));
create policy sessions_write on public.competition_sessions for all to authenticated
  using (public.has_event_permission(event_id, 'control'))
  with check (public.has_event_permission(event_id, 'control'));

create policy session_participants_select on public.session_participants for select to authenticated
  using (public.can_access_event(public.session_event_id(session_id)));
create policy session_participants_insert on public.session_participants for insert to authenticated
  with check (public.has_event_permission(public.session_event_id(session_id), 'control'));
create policy session_participants_delete on public.session_participants for delete to authenticated
  using (public.has_event_permission(public.session_event_id(session_id), 'control'));

create policy rounds_select on public.competition_rounds for select to authenticated
  using (public.can_access_event(public.session_event_id(session_id)));
create policy rounds_write on public.competition_rounds for all to authenticated
  using (public.has_event_permission(public.session_event_id(session_id), 'control'))
  with check (public.has_event_permission(public.session_event_id(session_id), 'control'));

create policy cq_select on public.competition_questions for select to authenticated
  using (public.can_access_event(public.round_event_id(round_id)));
create policy cq_write on public.competition_questions for all to authenticated
  using (public.has_event_permission(public.round_event_id(round_id), 'control'))
  with check (public.has_event_permission(public.round_event_id(round_id), 'control'));

-- hasil: HANYA BACA. Tidak ada kebijakan tulis → tidak dapat dimanipulasi dari klien mana pun.
create policy answers_select on public.participant_answers for select to authenticated
  using (public.can_access_event(public.round_event_id(
    (select cq.round_id from public.competition_questions cq where cq.id = competition_question_id))));
create policy scores_select on public.scores for select to authenticated
  using (public.can_access_event(public.round_event_id(round_id)));
create policy leaderboards_select on public.leaderboards for select to authenticated
  using (public.can_access_event(public.session_event_id(session_id)));

-- pengumuman, audit, pengaturan
create policy announcements_select on public.announcements for select to authenticated
  using (public.is_superadmin() or (event_id is not null and public.can_access_event(event_id)));
create policy announcements_write on public.announcements for all to authenticated
  using (public.is_superadmin() or (event_id is not null and public.has_event_permission(event_id, 'control')))
  with check (public.is_superadmin() or (event_id is not null and public.has_event_permission(event_id, 'control')));

create policy audit_select on public.audit_logs for select to authenticated
  using (public.is_superadmin() or (event_id is not null and public.can_access_event(event_id)));

create policy app_settings_select on public.app_settings for select to authenticated using (public.is_active_admin());
create policy app_settings_write on public.app_settings for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- participant_credentials, participant_sessions, rate_limits: RLS aktif TANPA kebijakan → tertutup total.

-- ---------------------------------------------------------------------
-- HAK AKSES TABEL
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, public;
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on public.participant_credentials, public.participant_sessions, public.rate_limits from authenticated;
revoke insert, update, delete on public.participant_answers, public.scores, public.leaderboards, public.audit_logs from authenticated;

-- ---------------------------------------------------------------------
-- STORAGE (foto peserta, gambar soal, logo). Baca publik, tulis hanya admin aktif.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('participant-photos', 'participant-photos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
           ('question-images', 'question-images', true, 3145728, array['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
           ('branding', 'branding', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
    on conflict (id) do nothing;

    execute $p$drop policy if exists lr1_storage_read on storage.objects$p$;
    execute $p$drop policy if exists lr1_storage_insert on storage.objects$p$;
    execute $p$drop policy if exists lr1_storage_update on storage.objects$p$;
    execute $p$drop policy if exists lr1_storage_delete on storage.objects$p$;
    execute $p$create policy lr1_storage_read on storage.objects for select
      using (bucket_id in ('participant-photos', 'question-images', 'branding'))$p$;
    execute $p$create policy lr1_storage_insert on storage.objects for insert to authenticated
      with check (bucket_id in ('participant-photos', 'question-images', 'branding') and public.is_active_admin())$p$;
    execute $p$create policy lr1_storage_update on storage.objects for update to authenticated
      using (bucket_id in ('participant-photos', 'question-images', 'branding') and public.is_active_admin())$p$;
    execute $p$create policy lr1_storage_delete on storage.objects for delete to authenticated
      using (bucket_id in ('participant-photos', 'question-images', 'branding') and public.is_active_admin())$p$;
  end if;
end $$;
