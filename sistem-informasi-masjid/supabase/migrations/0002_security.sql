-- =====================================================================
-- SISTEM INFORMASI MASJID — 0002: Fungsi, trigger, dan Row Level Security
-- =====================================================================
-- Peran:
--   super_admin   : semua akses + manajemen pengguna
--   admin_masjid  : seluruh data masjidnya (termasuk keuangan & pengaturan)
--   operator      : konten informasi saja (pengumuman, slideshow, kegiatan, ayat & hadis)
-- Layar TV (anon)  : hanya membaca konten aktif; TIDAK bisa membaca transaksi keuangan,
--                    data pengguna, maupun daftar perangkat.

-- ---------------------------------------------------------------------
-- Fungsi pembantu peran (security definer agar tidak rekursif terhadap RLS users)
-- ---------------------------------------------------------------------
create or replace function public.app_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid() and is_active
$$;

create or replace function public.app_mosque_id() returns uuid
language sql stable security definer set search_path = public as $$
  select mosque_id from public.users where id = auth.uid() and is_active
$$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() = 'super_admin', false)
$$;

-- Anggota aktif (peran apa pun) pada masjid tsb.
create or replace function public.staff_of(p_mosque_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() = 'super_admin'
               or (public.app_role() is not null and public.app_mosque_id() = p_mosque_id), false)
$$;

-- Pengelola (Super Admin / Admin Masjid) pada masjid tsb.
create or replace function public.manages_mosque(p_mosque_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() = 'super_admin'
               or (public.app_role() = 'admin_masjid' and public.app_mosque_id() = p_mosque_id), false)
$$;

-- ---------------------------------------------------------------------
-- Pengguna baru: buat profil. Akun PERTAMA otomatis menjadi Super Admin aktif;
-- akun berikutnya tidak aktif sampai diaktifkan Super Admin.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_first  boolean;
  v_mosque uuid;
begin
  perform pg_advisory_xact_lock(74201);
  select not exists (select 1 from public.users) into v_first;
  select id into v_mosque from public.mosque_profiles order by created_at limit 1;
  insert into public.users (id, mosque_id, full_name, email, role, is_active)
  values (new.id, v_mosque, coalesce(new.raw_user_meta_data ->> 'full_name', ''), coalesce(new.email, ''),
          case when v_first then 'super_admin'::public.user_role else 'operator'::public.user_role end, v_first)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.has_users() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users)
$$;

-- Penjaga kolom sensitif: hanya Super Admin yang boleh mengubah peran/status/masjid/email,
-- dan Super Admin aktif terakhir tidak boleh hilang.
create or replace function public.guard_users() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_super_admin() then
    if tg_op = 'DELETE' then
      raise exception 'Hanya Super Admin yang dapat menghapus pengguna' using errcode = '42501';
    end if;
    if new.role is distinct from old.role or new.is_active is distinct from old.is_active
       or new.mosque_id is distinct from old.mosque_id or new.email is distinct from old.email then
      raise exception 'Hanya Super Admin yang dapat mengubah peran atau status pengguna' using errcode = '42501';
    end if;
  end if;
  if old.role = 'super_admin' and old.is_active
     and (tg_op = 'DELETE' or new.role <> 'super_admin' or not new.is_active)
     and not exists (select 1 from public.users where role = 'super_admin' and is_active and id <> old.id) then
    raise exception 'Harus ada minimal satu Super Admin aktif' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists trg_guard_users on public.users;
create trigger trg_guard_users before update or delete on public.users
  for each row execute function public.guard_users();

-- Hapus pengguna (Super Admin). Menghapus akun auth; profil ikut terhapus (cascade).
create or replace function public.admin_delete_user(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'Hanya Super Admin yang dapat menghapus pengguna' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Tidak dapat menghapus akun sendiri' using errcode = '23514';
  end if;
  delete from public.users where id = p_user_id;
  begin
    delete from auth.users where id = p_user_id;
  exception when insufficient_privilege then
    null; -- profil sudah dihapus sehingga akun tidak lagi memiliki akses apa pun
  end;
end $$;

-- ---------------------------------------------------------------------
-- Masjid baru: siapkan baris pengaturan + satu layar utama
-- ---------------------------------------------------------------------
create or replace function public.init_mosque() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_code text := 'utama';
begin
  insert into public.prayer_schedules (mosque_id) values (new.id) on conflict (mosque_id) do nothing;
  insert into public.display_settings (mosque_id) values (new.id) on conflict (mosque_id) do nothing;
  if exists (select 1 from public.display_devices where code = v_code) then
    v_code := 'layar-' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  insert into public.display_devices (mosque_id, name, code, location) values (new.id, 'Layar Utama', v_code, 'Ruang utama');
  return new;
end $$;

drop trigger if exists trg_init_mosque on public.mosque_profiles;
create trigger trg_init_mosque after insert on public.mosque_profiles
  for each row execute function public.init_mosque();

-- ---------------------------------------------------------------------
-- Sinyal sinkronisasi: setiap perubahan data menaikkan display_settings.data_version.
-- Layar TV cukup berlangganan realtime pada SATU tabel (display_settings) untuk tahu
-- kapan harus memuat ulang — termasuk untuk data yang tidak boleh dibaca anon (keuangan).
-- ---------------------------------------------------------------------
create or replace function public.bump_data_version() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_mosque uuid;
begin
  v_mosque := ((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> tg_argv[0])::uuid;
  update public.display_settings set data_version = data_version + 1 where mosque_id = v_mosque;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['prayer_schedules', 'announcements', 'slideshow_contents', 'mosque_events',
                           'financial_transactions', 'donation_accounts', 'islamic_contents']
  loop
    execute format('drop trigger if exists trg_bump on public.%I', t);
    execute format('create trigger trg_bump after insert or update or delete on public.%I for each row execute function public.bump_data_version(''mosque_id'')', t);
  end loop;
end $$;

drop trigger if exists trg_bump on public.mosque_profiles;
create trigger trg_bump after update on public.mosque_profiles
  for each row execute function public.bump_data_version('id');

-- Perangkat: heartbeat (last_seen_at/screen_info) TIDAK memicu sinkronisasi.
drop trigger if exists trg_bump on public.display_devices;
create trigger trg_bump after insert or delete or update of name, code, layout, font_scale, is_active, mosque_id
  on public.display_devices for each row execute function public.bump_data_version('mosque_id');

create or replace function public.bump_own_version() returns trigger
language plpgsql as $$
begin
  if new.data_version = old.data_version then
    new.data_version := old.data_version + 1;
  end if;
  return new;
end $$;

drop trigger if exists trg_bump_own on public.display_settings;
create trigger trg_bump_own before update on public.display_settings
  for each row execute function public.bump_own_version();

-- ---------------------------------------------------------------------
-- RPC untuk layar TV
-- ---------------------------------------------------------------------
-- Heartbeat + identitas layar berdasarkan kode. Mengembalikan null bila kode tidak dikenal.
create or replace function public.display_heartbeat(p_code text, p_info text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.display_devices;
begin
  update public.display_devices
     set last_seen_at = now(), screen_info = left(coalesce(p_info, ''), 200)
   where code = lower(btrim(p_code))
  returning * into v;
  if not found then
    return null;
  end if;
  return jsonb_build_object('id', v.id, 'mosque_id', v.mosque_id, 'name', v.name, 'code', v.code,
                            'layout', v.layout, 'font_scale', v.font_scale, 'is_active', v.is_active);
end $$;

-- Ringkasan keuangan (agregat saja, tanpa rincian transaksi).
-- Publik hanya bila admin mengaktifkan "Tampilkan laporan keuangan di layar".
create or replace function public.get_finance_summary(p_mosque_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_public boolean;
  v_month  date := date_trunc('month', current_date)::date;
  v_result jsonb;
begin
  select show_slide_finance into v_public from public.display_settings where mosque_id = p_mosque_id;
  if not coalesce(v_public, false) and not public.manages_mosque(p_mosque_id) then
    return null;
  end if;
  select jsonb_build_object(
    'income_total',  coalesce(sum(amount) filter (where type = 'income'), 0),
    'expense_total', coalesce(sum(amount) filter (where type = 'expense'), 0),
    'balance',       coalesce(sum(case when type = 'income' then amount else -amount end), 0),
    'month_income',  coalesce(sum(amount) filter (where type = 'income' and transaction_date >= v_month), 0),
    'month_expense', coalesce(sum(amount) filter (where type = 'expense' and transaction_date >= v_month), 0),
    'week_infak',    coalesce(sum(amount) filter (where type = 'income' and category ilike '%infak%'
                                                   and transaction_date > current_date - 7), 0),
    'last_date',     max(transaction_date)
  ) into v_result
  from public.financial_transactions where mosque_id = p_mosque_id;

  return v_result || jsonb_build_object('monthly', coalesce((
    select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'income', i, 'expense', e) order by m)
    from (
      select g.m,
             coalesce(sum(f.amount) filter (where f.type = 'income'), 0)  as i,
             coalesce(sum(f.amount) filter (where f.type = 'expense'), 0) as e
      from generate_series(v_month - interval '5 months', v_month, interval '1 month') as g(m)
      left join public.financial_transactions f
        on f.mosque_id = p_mosque_id and date_trunc('month', f.transaction_date) = g.m
      group by g.m
    ) s), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- Hak akses dasar (RLS di bawah tetap menjadi penentu)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on public.mosque_profiles, public.prayer_schedules, public.display_settings, public.announcements,
                public.slideshow_contents, public.mosque_events, public.donation_accounts, public.islamic_contents
  to anon;
revoke all on public.financial_transactions, public.users, public.display_devices from anon;

grant select, insert, update, delete on
  public.mosque_profiles, public.users, public.prayer_schedules, public.display_settings, public.display_devices,
  public.announcements, public.slideshow_contents, public.mosque_events, public.financial_transactions,
  public.donation_accounts, public.islamic_contents
  to authenticated;

revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.display_heartbeat(text, text), public.get_finance_summary(uuid), public.has_users(),
  public.app_role(), public.app_mosque_id(), public.is_super_admin(), public.staff_of(uuid), public.manages_mosque(uuid)
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.mosque_profiles        enable row level security;
alter table public.users                  enable row level security;
alter table public.prayer_schedules       enable row level security;
alter table public.display_settings       enable row level security;
alter table public.display_devices        enable row level security;
alter table public.announcements          enable row level security;
alter table public.slideshow_contents     enable row level security;
alter table public.mosque_events          enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.donation_accounts      enable row level security;
alter table public.islamic_contents       enable row level security;

-- Hapus kebijakan lama (agar migrasi dapat dijalankan ulang)
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies
            where schemaname = 'public' and tablename in ('mosque_profiles', 'users', 'prayer_schedules', 'display_settings',
              'display_devices', 'announcements', 'slideshow_contents', 'mosque_events', 'financial_transactions',
              'donation_accounts', 'islamic_contents')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Profil masjid, jadwal salat, pengaturan display: publik boleh membaca; hanya pengelola yang mengubah.
create policy mosque_read   on public.mosque_profiles for select using (true);
create policy mosque_update on public.mosque_profiles for update to authenticated
  using (public.manages_mosque(id)) with check (public.manages_mosque(id));
create policy mosque_insert on public.mosque_profiles for insert to authenticated with check (public.is_super_admin());
create policy mosque_delete on public.mosque_profiles for delete to authenticated using (public.is_super_admin());

create policy prayer_read   on public.prayer_schedules for select using (true);
create policy prayer_update on public.prayer_schedules for update to authenticated
  using (public.manages_mosque(mosque_id)) with check (public.manages_mosque(mosque_id));

create policy settings_read   on public.display_settings for select using (true);
create policy settings_update on public.display_settings for update to authenticated
  using (public.manages_mosque(mosque_id)) with check (public.manages_mosque(mosque_id));

-- Perangkat display: hanya staf yang melihat; pengelola yang mengubah. Layar memakai RPC display_heartbeat.
create policy devices_read  on public.display_devices for select to authenticated using (public.staff_of(mosque_id));
create policy devices_write on public.display_devices for all to authenticated
  using (public.manages_mosque(mosque_id)) with check (public.manages_mosque(mosque_id));

-- Konten informasi: publik membaca yang aktif; seluruh staf masjid boleh mengelola.
create policy announcements_read  on public.announcements for select using (is_active or public.staff_of(mosque_id));
create policy announcements_write on public.announcements for all to authenticated
  using (public.staff_of(mosque_id)) with check (public.staff_of(mosque_id));

create policy slides_read  on public.slideshow_contents for select using (is_active or public.staff_of(mosque_id));
create policy slides_write on public.slideshow_contents for all to authenticated
  using (public.staff_of(mosque_id)) with check (public.staff_of(mosque_id));

create policy events_read  on public.mosque_events for select using (is_active or public.staff_of(mosque_id));
create policy events_write on public.mosque_events for all to authenticated
  using (public.staff_of(mosque_id)) with check (public.staff_of(mosque_id));

create policy islamic_read  on public.islamic_contents for select using (is_active or public.staff_of(mosque_id));
create policy islamic_write on public.islamic_contents for all to authenticated
  using (public.staff_of(mosque_id)) with check (public.staff_of(mosque_id));

-- Rekening donasi: publik membaca yang aktif; hanya pengelola yang mengubah.
create policy donation_read  on public.donation_accounts for select using (is_active or public.manages_mosque(mosque_id));
create policy donation_write on public.donation_accounts for all to authenticated
  using (public.manages_mosque(mosque_id)) with check (public.manages_mosque(mosque_id));

-- Transaksi keuangan: HANYA pengelola. Tidak ada akses anon maupun operator.
create policy finance_all on public.financial_transactions for all to authenticated
  using (public.manages_mosque(mosque_id)) with check (public.manages_mosque(mosque_id));

-- Pengguna: setiap orang melihat profilnya sendiri; Super Admin melihat & mengelola semua.
create policy users_read   on public.users for select to authenticated using (id = auth.uid() or public.is_super_admin());
create policy users_update on public.users for update to authenticated
  using (id = auth.uid() or public.is_super_admin()) with check (id = auth.uid() or public.is_super_admin());
create policy users_delete on public.users for delete to authenticated using (public.is_super_admin());
