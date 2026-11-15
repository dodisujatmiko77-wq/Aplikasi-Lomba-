-- =====================================================================
-- 0007 — Satu peserta = satu perangkat.
-- Perangkat pertama yang berhasil masuk "mengunci" akun. Login dari perangkat lain
-- ditolak (DEVICE_LOCKED) sampai Superadmin/Admin mereset perangkat peserta tersebut.
-- Percobaan dari perangkat lain dicatat agar dapat ditinjau panitia.
-- =====================================================================

alter table public.participant_credentials
  add column if not exists bound_device_id    text,
  add column if not exists bound_at           timestamptz,
  add column if not exists bound_device_label text,
  add column if not exists blocked_attempts   integer not null default 0,
  add column if not exists last_blocked_at    timestamptz,
  add column if not exists last_blocked_label text;

-- PIN diganti (reset PIN, kartu baru, ubah peserta, impor) = kredensial baru → kunci perangkat dilepas.
create or replace function public._clear_device_on_pin_change() returns trigger
language plpgsql as $$
begin
  if new.pin_hash is distinct from old.pin_hash then
    new.bound_device_id := null; new.bound_at := null; new.bound_device_label := null;
    new.blocked_attempts := 0; new.last_blocked_at := null; new.last_blocked_label := null;
  end if;
  return new;
end $$;
drop trigger if exists participant_credentials_clear_device on public.participant_credentials;
create trigger participant_credentials_clear_device before update on public.participant_credentials
  for each row execute function public._clear_device_on_pin_change();

-- Login peserta: kode + PIN + identitas perangkat.
drop function if exists public.participant_login(text, text);
create or replace function public.participant_login(p_code text, p_pin text, p_device text default null, p_device_label text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_p participants; v_c participant_credentials; v_token text; v_left int;
  v_label text := left(coalesce(nullif(trim(p_device_label), ''), 'Perangkat tidak dikenal'), 80);
begin
  if v_code = '' or coalesce(p_pin, '') = '' or length(v_code) > 20 or length(p_pin) > 12 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CREDENTIALS', 'message', 'Kode peserta atau PIN salah');
  end if;
  if not public._rate_limit('login-ip:' || public._client_ip(), 300, 60)
     or not public._rate_limit('login-kode:' || v_code, 10, 60) then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED', 'message', 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.');
  end if;

  select * into v_p from participants where code = v_code;
  if found then
    select * into v_c from participant_credentials where participant_id = v_p.id for update;
  end if;
  if v_c.id is null then
    perform crypt(p_pin, gen_salt('bf', 8));
    return jsonb_build_object('ok', false, 'code', 'INVALID_CREDENTIALS', 'message', 'Kode peserta atau PIN salah');
  end if;
  if v_c.locked_until is not null and v_c.locked_until > now() then
    return jsonb_build_object('ok', false, 'code', 'LOCKED',
      'message', format('Akun terkunci sementara. Coba lagi dalam %s detik.', ceil(extract(epoch from v_c.locked_until - now()))::int));
  end if;
  if not v_p.is_active then
    return jsonb_build_object('ok', false, 'code', 'INACTIVE', 'message', 'Akun peserta tidak aktif. Hubungi panitia.');
  end if;

  if v_c.pin_hash <> crypt(p_pin, v_c.pin_hash) then
    v_left := 4 - v_c.failed_attempts;
    update participant_credentials set
      failed_attempts = case when v_left <= 0 then 0 else failed_attempts + 1 end,
      locked_until = case when v_left <= 0 then now() + interval '5 minutes' else null end
    where id = v_c.id;
    return jsonb_build_object('ok', false, 'code', 'INVALID_CREDENTIALS',
      'message', case when v_left <= 0 then 'PIN salah 5 kali. Akun dikunci 5 menit.'
                      else format('Kode peserta atau PIN salah (sisa %s percobaan)', v_left) end);
  end if;

  -- PIN benar. Identitas perangkat wajib ada (klien lama tanpa identitas ditolak).
  if p_device is null or p_device !~ '^[A-Za-z0-9_-]{16,100}$' then
    return jsonb_build_object('ok', false, 'code', 'DEVICE_REQUIRED',
      'message', 'Aplikasi perlu diperbarui. Pasang APK terbaru dari panitia atau muat ulang halaman.');
  end if;

  -- Satu perangkat per peserta: perangkat pertama mengunci akun; perangkat lain ditolak.
  if v_c.bound_device_id is not null and v_c.bound_device_id <> p_device then
    update participant_credentials
       set blocked_attempts = blocked_attempts + 1, last_blocked_at = now(), last_blocked_label = v_label
     where id = v_c.id;
    return jsonb_build_object('ok', false, 'code', 'DEVICE_LOCKED',
      'message', 'Akun ini sudah terkunci pada perangkat lain. Hubungi panitia untuk mereset perangkat.');
  end if;

  update participant_credentials set
    failed_attempts = 0, locked_until = null,
    bound_device_id = p_device,
    bound_at = coalesce(bound_at, now()),
    bound_device_label = case when bound_device_id is null then v_label else bound_device_label end
  where id = v_c.id;

  -- Perangkat yang sama masuk lagi (mis. aplikasi dibuka ulang): sesi lama diganti.
  update participant_sessions set revoked_at = now() where participant_id = v_p.id and revoked_at is null;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into participant_sessions (participant_id, token_hash, expires_at)
  values (v_p.id, encode(digest(v_token, 'sha256'), 'hex'), now() + interval '18 hours');

  return jsonb_build_object('ok', true, 'token', v_token, 'participant', public._participant_public(v_p.id));
end $$;

-- Reset perangkat oleh Superadmin/Admin (hak akses "participants" pada event).
create or replace function public.admin_reset_devices(p_event_id uuid, p_participant_ids uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer := 0; v_id uuid; v_names text[] := '{}';
begin
  perform public._require(public.has_event_permission(p_event_id, 'participants'));
  for v_id in
    select ep.participant_id from event_participants ep
    where ep.event_id = p_event_id and ep.participant_id = any (p_participant_ids)
  loop
    update participant_credentials
       set bound_device_id = null, bound_at = null, bound_device_label = null,
           blocked_attempts = 0, last_blocked_at = null, last_blocked_label = null
     where participant_id = v_id;
    update participant_sessions set revoked_at = now() where participant_id = v_id and revoked_at is null;
    v_n := v_n + 1;
    if v_n <= 20 then v_names := v_names || (select full_name from participants where id = v_id); end if;
  end loop;
  perform public._audit('reset_device', 'participants', null, p_event_id,
                        jsonb_build_object('jumlah', v_n, 'peserta', to_jsonb(v_names)));
  return v_n;
end $$;

-- Status perangkat peserta pada satu event (untuk halaman Data Peserta).
create or replace function public.admin_device_status(p_event_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require(public.has_event_permission(p_event_id, 'participants'));
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'participant_id', c.participant_id, 'bound', c.bound_device_id is not null,
      'bound_at', c.bound_at, 'label', c.bound_device_label,
      'blocked_attempts', c.blocked_attempts, 'last_blocked_at', c.last_blocked_at, 'last_blocked_label', c.last_blocked_label))
    from participant_credentials c
    join event_participants ep on ep.participant_id = c.participant_id and ep.event_id = p_event_id
    where c.bound_device_id is not null or c.blocked_attempts > 0
  ), '[]'::jsonb);
end $$;

revoke execute on function
  public.participant_login(text, text, text, text), public.admin_reset_devices(uuid, uuid[]), public.admin_device_status(uuid),
  public._clear_device_on_pin_change()
from public, anon, authenticated;
grant execute on function public.participant_login(text, text, text, text) to anon, authenticated;
grant execute on function public.admin_reset_devices(uuid, uuid[]), public.admin_device_status(uuid) to authenticated;
