-- =====================================================================
-- LOMBA RANGKING 1 — 0003: FUNGSI MANAJEMEN (admin, peserta, bank soal)
-- =====================================================================

create or replace function public._require(p_ok boolean, p_message text default 'Akses ditolak') returns void
language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception '%', p_message using errcode = '42501'; end if;
end $$;

-- ---------------------------------------------------------------------
-- Manajemen admin (Superadmin)
-- ---------------------------------------------------------------------
create or replace function public.admin_set_profile(
  p_user_id uuid, p_full_name text default null, p_is_active boolean default null, p_role_key text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_role uuid; v_target profiles;
begin
  perform public._require(public.is_superadmin(), 'Hanya Superadmin');
  select * into v_target from profiles where id = p_user_id for update;
  if not found then raise exception 'Akun tidak ditemukan'; end if;
  if p_role_key is not null then
    select id into v_role from roles where key = p_role_key;
    if v_role is null then raise exception 'Role tidak dikenal'; end if;
  end if;
  if p_user_id = auth.uid() and (p_is_active is false or (p_role_key is not null and p_role_key <> 'superadmin')) then
    raise exception 'Anda tidak dapat menonaktifkan atau menurunkan akun sendiri';
  end if;
  update profiles set
    full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
    is_active = coalesce(p_is_active, is_active),
    role_id   = coalesce(v_role, role_id)
  where id = p_user_id;
  return (select to_jsonb(p) from profiles p where p.id = p_user_id);
end $$;

-- ---------------------------------------------------------------------
-- Peserta
-- ---------------------------------------------------------------------
create or replace function public._gen_pin() returns text
language sql volatile set search_path = public, extensions as $$
  select lpad(((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0')
$$;

create or replace function public._hash_pin(p_pin text) returns text
language sql volatile set search_path = public, extensions as $$
  select crypt(p_pin, gen_salt('bf', 8))
$$;

-- Simpan satu peserta ke event. Mengembalikan PIN HANYA bila PIN baru dibuat / diganti.
create or replace function public._upsert_participant(p_event_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_level uuid; v_district uuid; v_code text; v_pin text := nullif(trim(p ->> 'pin'), '');
  v_number text := nullif(trim(p ->> 'participant_number'), '');
  v_name text := nullif(trim(p ->> 'full_name'), '');
  v_new_pin boolean := false; v_created boolean := false;
begin
  if v_name is null then raise exception 'Nama lengkap wajib diisi'; end if;
  if v_number is null then raise exception 'Nomor peserta wajib diisi'; end if;

  v_level := nullif(p ->> 'education_level_id', '')::uuid;
  if v_level is null and nullif(trim(p ->> 'level'), '') is not null then
    select id into v_level from education_levels
    where upper(code) = upper(trim(p ->> 'level')) or lower(name) = lower(trim(p ->> 'level'))
       or (upper(trim(p ->> 'level')) in ('SMA', 'SMK', 'SMA/SMK') and upper(code) = 'SMA') limit 1;
  end if;
  if v_level is null then raise exception 'Jenjang tidak dikenal: %', coalesce(p ->> 'level', '-'); end if;

  v_district := nullif(p ->> 'district_id', '')::uuid;
  if v_district is null and nullif(trim(p ->> 'district'), '') is not null then
    select id into v_district from districts
    where lower(name) = lower(trim(p ->> 'district')) or lower(code) = lower(trim(p ->> 'district')) limit 1;
    if v_district is null and public.is_superadmin() then
      insert into districts (name, sort_order)
      values (trim(p ->> 'district'), (select coalesce(max(sort_order), 0) + 1 from districts))
      returning id into v_district;
    end if;
  end if;
  if v_district is null then raise exception 'Kecamatan tidak dikenal: %', coalesce(p ->> 'district', '-'); end if;

  if v_pin is not null and v_pin !~ '^[0-9]{4,8}$' then raise exception 'PIN harus 4–8 digit angka'; end if;
  v_code := upper(nullif(trim(p ->> 'code'), ''));

  -- Cocokkan data lama: id → kode → (event, nomor peserta, jenjang)
  if v_id is null and v_code is not null then
    select id into v_id from participants where code = v_code;
  end if;
  if v_id is null then
    select pt.id into v_id from participants pt join event_participants ep on ep.participant_id = pt.id
    where ep.event_id = p_event_id and pt.participant_number = v_number and pt.education_level_id = v_level limit 1;
  end if;

  if v_id is not null then
    if not public.participant_visible(v_id) then raise exception 'Kode peserta % sudah dipakai', v_code; end if;
    update participants set
      participant_number = v_number, full_name = v_name,
      school = coalesce(trim(p ->> 'school'), school),
      education_level_id = v_level, district_id = v_district,
      photo_url = case when p ? 'photo_url' then nullif(p ->> 'photo_url', '') else photo_url end,
      is_active = coalesce((p ->> 'is_active')::boolean, is_active)
    where id = v_id returning code into v_code;
  else
    if v_code is null then
      loop
        v_code := 'R' || public._random_code(5);
        exit when not exists (select 1 from participants where code = v_code);
      end loop;
    end if;
    insert into participants (participant_number, code, full_name, school, education_level_id, district_id, photo_url)
    values (v_number, v_code, v_name, coalesce(trim(p ->> 'school'), ''), v_level, v_district, nullif(p ->> 'photo_url', ''))
    returning id into v_id;
    v_created := true;
  end if;

  if not exists (select 1 from participant_credentials where participant_id = v_id) then
    v_pin := coalesce(v_pin, public._gen_pin()); v_new_pin := true;
    insert into participant_credentials (participant_id, pin_hash) values (v_id, public._hash_pin(v_pin));
  elsif v_pin is not null then
    v_new_pin := true;
    update participant_credentials
       set pin_hash = public._hash_pin(v_pin), failed_attempts = 0, locked_until = null, pin_updated_at = now()
     where participant_id = v_id;
    update participant_sessions set revoked_at = now() where participant_id = v_id and revoked_at is null;
  end if;

  insert into event_participants (event_id, participant_id, registration_status, participation_status, verified_by, verified_at)
  values (p_event_id, v_id,
          coalesce(nullif(p ->> 'registration_status', ''), 'verified'),
          coalesce(nullif(p ->> 'participation_status', ''), 'registered'),
          auth.uid(), now())
  on conflict (event_id, participant_id) do update set
    registration_status  = coalesce(nullif(p ->> 'registration_status', ''), event_participants.registration_status),
    participation_status = coalesce(nullif(p ->> 'participation_status', ''), event_participants.participation_status);

  return jsonb_build_object('id', v_id, 'code', v_code, 'created', v_created,
                            'pin', case when v_new_pin then v_pin end);
end $$;

create or replace function public.admin_save_participant(p_event_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public._require(public.has_event_permission(p_event_id, 'participants'));
  return public._upsert_participant(p_event_id, p_data);
end $$;

-- Import massal (dari Excel). Baris gagal tidak membatalkan baris lain.
create or replace function public.admin_import_participants(p_event_id uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_row jsonb; v_i int := 0; v_out jsonb := '[]'::jsonb; v_res jsonb;
begin
  perform public._require(public.has_event_permission(p_event_id, 'participants'));
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'Data import harus berupa daftar (maksimal 1000 baris)';
  end if;
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1;
    begin
      v_res := public._upsert_participant(p_event_id, v_row);
      v_out := v_out || jsonb_build_array(
        jsonb_build_object('row', v_i, 'ok', true, 'full_name', v_row ->> 'full_name',
                           'participant_number', v_row ->> 'participant_number') || v_res);
    exception when others then
      v_out := v_out || jsonb_build_array(jsonb_build_object('row', v_i, 'ok', false, 'error', sqlerrm,
                                                             'full_name', v_row ->> 'full_name'));
    end;
  end loop;
  perform public._audit('import_participants', 'participants', null, p_event_id,
                        jsonb_build_object('jumlah_baris', v_i));
  return v_out;
end $$;

-- Reset PIN (mengembalikan PIN baru satu kali; sesi login lama dicabut).
create or replace function public.admin_reset_pins(p_event_id uuid, p_participant_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_pin text; v_out jsonb := '[]'::jsonb;
begin
  perform public._require(public.has_event_permission(p_event_id, 'participants'));
  for v_id in
    select ep.participant_id from event_participants ep
    where ep.event_id = p_event_id and ep.participant_id = any (p_participant_ids)
  loop
    v_pin := public._gen_pin();
    insert into participant_credentials (participant_id, pin_hash) values (v_id, public._hash_pin(v_pin))
    on conflict (participant_id) do update
      set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, pin_updated_at = now();
    update participant_sessions set revoked_at = now() where participant_id = v_id and revoked_at is null;
    v_out := v_out || (select jsonb_build_object('id', p.id, 'code', p.code, 'pin', v_pin,
                                                 'full_name', p.full_name, 'participant_number', p.participant_number)
                       from participants p where p.id = v_id);
  end loop;
  perform public._audit('reset_pin', 'participants', null, p_event_id,
                        jsonb_build_object('jumlah', jsonb_array_length(v_out)));
  return v_out;
end $$;

create or replace function public.admin_delete_participant(p_event_id uuid, p_participant_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require(public.has_event_permission(p_event_id, 'participants'));
  if exists (select 1 from participant_answers a
             join competition_questions cq on cq.id = a.competition_question_id
             join competition_rounds r on r.id = cq.round_id
             join competition_sessions s on s.id = r.session_id
             where a.participant_id = p_participant_id and s.event_id = p_event_id) then
    raise exception 'Peserta sudah memiliki riwayat jawaban. Ubah status keikutsertaan menjadi mundur/diskualifikasi.';
  end if;
  delete from session_participants sp using competition_sessions s
   where sp.session_id = s.id and s.event_id = p_event_id and sp.participant_id = p_participant_id;
  delete from event_participants where event_id = p_event_id and participant_id = p_participant_id;
  if not exists (select 1 from event_participants where participant_id = p_participant_id) then
    delete from participants where id = p_participant_id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Bank soal
-- ---------------------------------------------------------------------
create or replace function public._save_question(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_event uuid := nullif(p ->> 'event_id', '')::uuid;
  v_type text := p ->> 'type';
  v_cat uuid := nullif(p ->> 'category_id', '')::uuid;
  v_level uuid := nullif(p ->> 'education_level_id', '')::uuid;
  v_opts jsonb := coalesce(p -> 'options', '[]'::jsonb);
  v_opt jsonb; v_i int := 0; v_n int; v_correct int; v_keep uuid[] := '{}'; v_oid uuid; v_locked boolean;
begin
  if v_id is not null then
    select event_id into v_event from questions where id = v_id;
    if v_event is null then raise exception 'Soal tidak ditemukan'; end if;
  end if;
  perform public._require(public.has_event_permission(v_event, 'questions'));
  if v_type not in ('multiple_choice', 'true_false', 'short_answer') then raise exception 'Tipe soal tidak valid'; end if;
  if nullif(trim(p ->> 'question_text'), '') is null then raise exception 'Teks soal wajib diisi'; end if;

  if v_cat is null and nullif(trim(p ->> 'category'), '') is not null then
    insert into question_categories (name) values (trim(p ->> 'category'))
    on conflict (name) do update set name = excluded.name returning id into v_cat;
  end if;
  if v_level is null and nullif(trim(p ->> 'level'), '') is not null then
    select id into v_level from education_levels
    where upper(code) = upper(trim(p ->> 'level')) or lower(name) = lower(trim(p ->> 'level'))
       or (upper(trim(p ->> 'level')) in ('SMA', 'SMK', 'SMA/SMK') and upper(code) = 'SMA') limit 1;
    if v_level is null then raise exception 'Jenjang tidak dikenal: %', p ->> 'level'; end if;
  end if;

  -- Validasi kunci jawaban
  select count(*), count(*) filter (where (o ->> 'is_correct')::boolean)
    into v_n, v_correct
  from jsonb_array_elements(v_opts) o where nullif(trim(o ->> 'text'), '') is not null;
  if v_type = 'multiple_choice' and (v_n < 2 or v_n > 6 or v_correct <> 1) then
    raise exception 'Pilihan ganda memerlukan 2–6 opsi dengan tepat satu kunci jawaban';
  elsif v_type = 'true_false' and (v_n <> 2 or v_correct <> 1) then
    raise exception 'Soal benar/salah memerlukan dua opsi dengan tepat satu kunci jawaban';
  elsif v_type = 'short_answer' and v_n < 1 then
    raise exception 'Jawaban singkat memerlukan minimal satu jawaban yang diterima';
  end if;

  if v_id is null then
    insert into questions (event_id, category_id, education_level_id, type, difficulty, question_text, image_url,
                           explanation, case_sensitive, ignore_whitespace, is_active, created_by)
    values (v_event, v_cat, v_level, v_type, coalesce(nullif(p ->> 'difficulty', ''), 'medium'),
            trim(p ->> 'question_text'), nullif(p ->> 'image_url', ''), nullif(p ->> 'explanation', ''),
            coalesce((p ->> 'case_sensitive')::boolean, false), coalesce((p ->> 'ignore_whitespace')::boolean, true),
            coalesce((p ->> 'is_active')::boolean, true), auth.uid())
    returning id into v_id;
    v_locked := false;
  else
    -- Soal yang sudah ditayangkan: kunci & opsi dikunci agar skor yang sudah dihitung tetap konsisten.
    v_locked := exists (select 1 from competition_questions cq
                        where cq.question_id = v_id and cq.status in ('active', 'closed', 'revealed'));
    update questions set
      category_id = v_cat, education_level_id = v_level,
      type = case when v_locked then type else v_type end,
      difficulty = coalesce(nullif(p ->> 'difficulty', ''), difficulty),
      question_text = trim(p ->> 'question_text'),
      image_url = nullif(p ->> 'image_url', ''), explanation = nullif(p ->> 'explanation', ''),
      case_sensitive = case when v_locked then case_sensitive else coalesce((p ->> 'case_sensitive')::boolean, case_sensitive) end,
      ignore_whitespace = case when v_locked then ignore_whitespace else coalesce((p ->> 'ignore_whitespace')::boolean, ignore_whitespace) end,
      is_active = coalesce((p ->> 'is_active')::boolean, is_active)
    where id = v_id;
  end if;

  if not v_locked then
    for v_opt in select * from jsonb_array_elements(v_opts) loop
      continue when nullif(trim(v_opt ->> 'text'), '') is null;
      v_i := v_i + 1;
      v_oid := nullif(v_opt ->> 'id', '')::uuid;
      if v_oid is not null and exists (select 1 from question_options where id = v_oid and question_id = v_id) then
        update question_options set option_text = trim(v_opt ->> 'text'),
               is_correct = case when v_type = 'short_answer' then true else coalesce((v_opt ->> 'is_correct')::boolean, false) end,
               sort_order = v_i
         where id = v_oid;
      else
        insert into question_options (question_id, option_text, is_correct, sort_order)
        values (v_id, trim(v_opt ->> 'text'),
                case when v_type = 'short_answer' then true else coalesce((v_opt ->> 'is_correct')::boolean, false) end, v_i)
        returning id into v_oid;
      end if;
      v_keep := v_keep || v_oid;
    end loop;
    delete from question_options where question_id = v_id and id <> all (v_keep);
    -- Segarkan urutan opsi pada soal tayang yang belum dimulai.
    update competition_questions cq set option_order = case when v_type = 'short_answer' then '{}'::uuid[] else (
      select coalesce(array_agg(o.id order by case when r.shuffle_options and v_type = 'multiple_choice'
                                                  then random() else o.sort_order end, o.id), '{}')
      from question_options o where o.question_id = v_id) end
    from competition_rounds r
    where r.id = cq.round_id and cq.question_id = v_id and cq.status = 'pending';
  end if;
  return v_id;
end $$;

create or replace function public.admin_save_question(p_data jsonb) returns uuid
language sql security definer set search_path = public as $$ select public._save_question(p_data) $$;

create or replace function public.admin_import_questions(p_event_id uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_row jsonb; v_i int := 0; v_out jsonb := '[]'::jsonb; v_id uuid;
begin
  perform public._require(public.has_event_permission(p_event_id, 'questions'));
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'Data import harus berupa daftar (maksimal 1000 baris)';
  end if;
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1;
    begin
      v_id := public._save_question((v_row - 'id') || jsonb_build_object('event_id', p_event_id));
      v_out := v_out || jsonb_build_object('row', v_i, 'ok', true, 'id', v_id);
    exception when others then
      v_out := v_out || jsonb_build_object('row', v_i, 'ok', false, 'error', sqlerrm);
    end;
  end loop;
  perform public._audit('import_questions', 'questions', null, p_event_id, jsonb_build_object('jumlah_baris', v_i));
  return v_out;
end $$;

-- Tambahkan soal ke babak (urutan diacak di server bila diminta).
create or replace function public.admin_add_questions_to_round(
  p_round_id uuid, p_question_ids uuid[], p_shuffle boolean default false
) returns integer
language plpgsql security definer set search_path = public as $$
declare v_qid uuid; v_n int := 0; v_seq int; v_status text;
begin
  perform public._require(public.has_event_permission(public.round_event_id(p_round_id), 'control'));
  select status into v_status from competition_rounds where id = p_round_id for update;
  if v_status is distinct from 'pending' then raise exception 'Babak sudah dimulai'; end if;
  select coalesce(max(sequence), 0) into v_seq from competition_questions where round_id = p_round_id;
  for v_qid in
    select q.id from unnest(p_question_ids) with ordinality as u(id, ord)
    join questions q on q.id = u.id and q.is_active
    where not exists (select 1 from competition_questions cq where cq.round_id = p_round_id and cq.question_id = q.id)
    order by case when p_shuffle then random() else u.ord end
  loop
    v_seq := v_seq + 1; v_n := v_n + 1;
    insert into competition_questions (round_id, question_id, sequence) values (p_round_id, v_qid, v_seq);
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- Statistik dashboard (SECURITY INVOKER → otomatis mengikuti RLS pemanggil)
-- ---------------------------------------------------------------------
create or replace function public.admin_dashboard_stats() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'events', (select count(*) from events),
    'participants', (select count(*) from participants),
    'districts', (select count(*) from districts where is_active),
    'levels', (select count(*) from education_levels where is_active),
    'questions', (select count(*) from questions),
    'sessions_active', (select count(*) from competition_sessions where status in ('open', 'running', 'paused')),
    'sessions_finished', (select count(*) from competition_sessions where status = 'finished'),
    'sessions_total', (select count(*) from competition_sessions),
    'participants_by_level', coalesce((
      select jsonb_agg(jsonb_build_object('name', l.code, 'total', x.n) order by l.sort_order)
      from education_levels l
      join lateral (select count(*) n from participants p where p.education_level_id = l.id) x on true), '[]'::jsonb),
    'participants_by_district', coalesce((
      select jsonb_agg(jsonb_build_object('name', d.name, 'total', x.n) order by d.sort_order, d.name)
      from districts d
      join lateral (select count(*) n from participants p where p.district_id = d.id) x on true
      where d.is_active), '[]'::jsonb),
    'questions_by_type', coalesce((
      select jsonb_agg(jsonb_build_object('name', t.type, 'total', t.n))
      from (select type, count(*) n from questions group by type) t), '[]'::jsonb),
    'recent_results', coalesce((
      select jsonb_agg(r order by r ->> 'finished_at' desc) from (
        select jsonb_build_object(
          'session_id', s.id, 'name', s.name, 'code', s.code, 'finished_at', s.finished_at,
          'participants', (select count(*) from leaderboards l where l.session_id = s.id),
          'top_points', (select max(l.total_points) from leaderboards l where l.session_id = s.id),
          'avg_points', (select round(avg(l.total_points), 2) from leaderboards l where l.session_id = s.id),
          'winner', (select p.full_name from leaderboards l join participants p on p.id = l.participant_id
                     where l.session_id = s.id and l.rank = 1 limit 1)) r
        from competition_sessions s where s.status = 'finished'
        order by s.finished_at desc nulls last limit 6) z), '[]'::jsonb),
    'recent_activity', coalesce((
      select jsonb_agg(a) from (
        select jsonb_build_object('id', id, 'action', action, 'entity', entity, 'actor', actor_label,
                                  'created_at', created_at) a
        from audit_logs order by created_at desc limit 12) z), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------
-- Hak eksekusi
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public._is_api_role(), public.current_role_key(), public.is_active_admin(), public.is_superadmin(),
  public.can_access_event(uuid), public.has_event_permission(uuid, text),
  public.session_event_id(uuid), public.round_event_id(uuid), public.question_event_id(uuid),
  public.package_event_id(uuid), public.participant_visible(uuid),
  public.admin_set_profile(uuid, text, boolean, text),
  public.admin_save_participant(uuid, jsonb), public.admin_import_participants(uuid, jsonb),
  public.admin_reset_pins(uuid, uuid[]), public.admin_delete_participant(uuid, uuid),
  public.admin_save_question(jsonb), public.admin_import_questions(uuid, jsonb),
  public.admin_add_questions_to_round(uuid, uuid[], boolean),
  public.admin_dashboard_stats(), public._random_code(integer)
to authenticated;
