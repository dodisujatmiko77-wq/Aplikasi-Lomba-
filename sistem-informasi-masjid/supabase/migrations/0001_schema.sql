-- =====================================================================
-- SISTEM INFORMASI MASJID — 0001: Skema tabel, relasi, index, timestamp
-- Jalankan berurutan di Supabase > SQL Editor (0001 → 0004).
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('super_admin', 'admin_masjid', 'operator');
  end if;
end $$;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 1. Profil masjid
-- ---------------------------------------------------------------------
create table if not exists public.mosque_profiles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 120),
  logo_url    text,
  logo_path   text,
  address     text not null default '',
  city        text not null default '',
  province    text not null default '',
  history     text not null default '',
  vision      text not null default '',
  mission     text not null default '',
  phone       text not null default '',
  email       text not null default '',
  website     text not null default '',
  -- [{ "name": "...", "position": "Ketua DKM", "phone": "08..." }]
  contacts    jsonb not null default '[]'::jsonb check (jsonb_typeof(contacts) = 'array'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. Pengguna (profil aplikasi, terhubung ke auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  mosque_id   uuid references public.mosque_profiles (id) on delete set null,
  full_name   text not null default '',
  email       text not null default '',
  role        public.user_role not null default 'operator',
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists users_mosque_idx on public.users (mosque_id);

-- ---------------------------------------------------------------------
-- 3. Jadwal salat (satu baris pengaturan per masjid)
-- ---------------------------------------------------------------------
create table if not exists public.prayer_schedules (
  id                    uuid primary key default gen_random_uuid(),
  mosque_id             uuid not null unique references public.mosque_profiles (id) on delete cascade,
  mode                  text not null default 'auto' check (mode in ('auto', 'manual')),
  location_name         text not null default 'Jakarta Pusat',
  latitude              numeric(9, 6) not null default -6.175392 check (latitude between -90 and 90),
  longitude             numeric(9, 6) not null default 106.827153 check (longitude between -180 and 180),
  timezone              text not null default 'WIB' check (timezone in ('WIB', 'WITA', 'WIT')),
  calc_method           text not null default 'kemenag'
                        check (calc_method in ('kemenag', 'singapore', 'mwl', 'egyptian', 'karachi', 'umm_al_qura')),
  madhab                text not null default 'syafii' check (madhab in ('syafii', 'hanafi')),
  ihtiyat_minutes       int not null default 2 check (ihtiyat_minutes between 0 and 10),
  imsak_offset          int not null default 10 check (imsak_offset between 0 and 30),
  duha_offset           int not null default 28 check (duha_offset between 10 and 60),
  -- koreksi menit per waktu: { "subuh": 1, "magrib": -1, ... }
  corrections           jsonb not null default '{}'::jsonb check (jsonb_typeof(corrections) = 'object'),
  -- jadwal manual "HH:MM" per waktu (dipakai bila mode = manual)
  manual_times          jsonb not null default
    '{"imsak":"04:20","subuh":"04:30","terbit":"05:45","duha":"06:13","zuhur":"12:00","asar":"15:15","magrib":"18:00","isya":"19:10"}'::jsonb
    check (jsonb_typeof(manual_times) = 'object'),
  -- jeda adzan → iqamah (menit) per salat
  iqamah_minutes        jsonb not null default '{"subuh":10,"zuhur":10,"asar":10,"magrib":7,"isya":10}'::jsonb
    check (jsonb_typeof(iqamah_minutes) = 'object'),
  adzan_minutes         int not null default 4 check (adzan_minutes between 1 and 15),
  salat_minutes         int not null default 12 check (salat_minutes between 1 and 60),
  jumat_minutes         int not null default 45 check (jumat_minutes between 10 and 120),
  prayer_mode_enabled   boolean not null default true,   -- layar penuh saat masuk waktu salat
  salat_screen_enabled  boolean not null default true,   -- layar tenang saat salat berlangsung
  countdown_enabled     boolean not null default true,
  notify_sound          boolean not null default true,
  hijri_offset          int not null default 0 check (hijri_offset between -3 and 3),
  -- imam per salat: { "subuh": "Ust. ...", ... }
  imams                 jsonb not null default '{}'::jsonb check (jsonb_typeof(imams) = 'object'),
  khatib_jumat          text not null default '',
  imam_jumat            text not null default '',
  muazin_jumat          text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. Pengaturan display (satu baris per masjid)
-- ---------------------------------------------------------------------
create table if not exists public.display_settings (
  id                        uuid primary key default gen_random_uuid(),
  mosque_id                 uuid not null unique references public.mosque_profiles (id) on delete cascade,
  layout                    text not null default 'classic' check (layout in ('classic', 'side')),
  theme                     text not null default 'dark' check (theme in ('dark', 'light')),
  primary_color             text not null default '#047857' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  accent_color              text not null default '#d4af37' check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  font_scale                numeric(3, 2) not null default 1.00 check (font_scale between 0.80 and 1.40),
  running_text_enabled      boolean not null default true,
  running_text_speed        int not null default 110 check (running_text_speed between 30 and 400),  -- piksel/detik
  slideshow_enabled         boolean not null default true,
  slideshow_duration        int not null default 12 check (slideshow_duration between 3 and 300),    -- detik
  show_info_panel           boolean not null default true,
  info_panel_duration       int not null default 12 check (info_panel_duration between 5 and 120),
  show_slide_announcements  boolean not null default true,
  show_slide_events         boolean not null default true,
  show_slide_finance        boolean not null default false,  -- ringkasan keuangan tampil ke publik bila aktif
  show_slide_islamic        boolean not null default true,
  show_slide_donation       boolean not null default true,
  special_mode              text not null default 'auto'
                            check (special_mode in ('auto', 'normal', 'ramadan', 'idulfitri', 'iduladha')),
  friday_mode_enabled       boolean not null default true,
  eid_greeting              text not null default '',
  auto_fullscreen           boolean not null default true,
  refresh_interval          int not null default 30 check (refresh_interval between 10 and 3600),     -- detik
  data_version              bigint not null default 0,       -- sinyal sinkronisasi realtime ke layar
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. Perangkat display (multi display)
-- ---------------------------------------------------------------------
create table if not exists public.display_devices (
  id            uuid primary key default gen_random_uuid(),
  mosque_id     uuid not null references public.mosque_profiles (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 2 and 60),
  code          text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{1,29}$'),
  location      text not null default '',
  layout        text check (layout is null or layout in ('classic', 'side')),          -- null = ikut pengaturan umum
  font_scale    numeric(3, 2) check (font_scale is null or font_scale between 0.80 and 1.40),
  is_active     boolean not null default true,
  last_seen_at  timestamptz,
  screen_info   text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists display_devices_mosque_idx on public.display_devices (mosque_id);

-- ---------------------------------------------------------------------
-- 6. Pengumuman & running text
-- ---------------------------------------------------------------------
create table if not exists public.announcements (
  id                    uuid primary key default gen_random_uuid(),
  mosque_id             uuid not null references public.mosque_profiles (id) on delete cascade,
  title                 text not null check (char_length(btrim(title)) between 3 and 150),
  content               text not null default '' check (char_length(content) <= 1000),
  category              text not null default 'pengumuman'
                        check (category in ('pengumuman', 'kegiatan', 'kebersihan', 'infak', 'pesan_islami')),
  priority              smallint not null default 2 check (priority between 1 and 3),  -- 1 = tinggi
  start_date            date,
  end_date              date,
  show_in_running_text  boolean not null default true,
  show_on_slide         boolean not null default false,
  is_active             boolean not null default true,
  created_by            uuid references public.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (start_date is null or end_date is null or end_date >= start_date)
);
create index if not exists announcements_mosque_idx on public.announcements (mosque_id, is_active, priority);

-- ---------------------------------------------------------------------
-- 7. Konten slideshow (gambar/poster/video)
-- ---------------------------------------------------------------------
create table if not exists public.slideshow_contents (
  id                uuid primary key default gen_random_uuid(),
  mosque_id         uuid not null references public.mosque_profiles (id) on delete cascade,
  title             text not null check (char_length(btrim(title)) between 3 and 150),
  category          text not null default 'poster_kajian'
                    check (category in ('poster_kajian', 'jadwal_pengajian', 'ramadan', 'keuangan', 'dokumentasi', 'qurban', 'ucapan', 'lainnya')),
  media_type        text not null check (media_type in ('image', 'video')),
  media_url         text not null check (char_length(media_url) > 0),
  storage_path      text,
  caption           text not null default '',
  duration_seconds  int check (duration_seconds is null or duration_seconds between 3 and 600), -- null = durasi umum
  sort_order        int not null default 0,
  start_date        date,
  end_date          date,
  is_active         boolean not null default true,
  created_by        uuid references public.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (start_date is null or end_date is null or end_date >= start_date)
);
create index if not exists slideshow_mosque_idx on public.slideshow_contents (mosque_id, is_active, sort_order);

-- ---------------------------------------------------------------------
-- 8. Kegiatan masjid & kajian rutin
-- ---------------------------------------------------------------------
create table if not exists public.mosque_events (
  id           uuid primary key default gen_random_uuid(),
  mosque_id    uuid not null references public.mosque_profiles (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 3 and 150),
  category     text not null default 'kajian'
               check (category in ('kajian', 'kegiatan', 'ramadan', 'qurban', 'phbi', 'sosial')),
  is_routine   boolean not null default false,
  weekday      smallint check (weekday is null or weekday between 0 and 6),  -- 0 = Ahad (untuk kegiatan rutin)
  event_date   date,
  start_time   time not null,
  end_time     time,
  location     text not null default '',
  speaker      text not null default '',
  description  text not null default '' check (char_length(description) <= 1000),
  is_active    boolean not null default true,
  created_by   uuid references public.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check ((is_routine and weekday is not null) or (not is_routine and event_date is not null))
);
create index if not exists mosque_events_mosque_idx on public.mosque_events (mosque_id, is_active, event_date);

-- ---------------------------------------------------------------------
-- 9. Keuangan (rahasia: hanya Super Admin & Admin Masjid)
-- ---------------------------------------------------------------------
create table if not exists public.financial_transactions (
  id                uuid primary key default gen_random_uuid(),
  mosque_id         uuid not null references public.mosque_profiles (id) on delete cascade,
  type              text not null check (type in ('income', 'expense')),
  category          text not null check (char_length(btrim(category)) between 2 and 60),
  amount            numeric(14, 2) not null check (amount > 0),
  transaction_date  date not null default current_date,
  description       text not null default '' check (char_length(description) <= 300),
  created_by        uuid references public.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists financial_mosque_date_idx on public.financial_transactions (mosque_id, transaction_date desc);

-- ---------------------------------------------------------------------
-- 10. Rekening donasi & QR
-- ---------------------------------------------------------------------
create table if not exists public.donation_accounts (
  id              uuid primary key default gen_random_uuid(),
  mosque_id       uuid not null references public.mosque_profiles (id) on delete cascade,
  label           text not null default 'Infak & Sedekah' check (char_length(btrim(label)) between 2 and 80),
  bank_name       text not null default '',
  account_number  text not null default '',
  account_holder  text not null default '',
  qr_content      text not null default '',   -- tautan donasi / string QRIS → dirender menjadi QR
  qris_image_url  text,                        -- atau unggah gambar QRIS resmi
  qris_image_path text,
  sort_order      int not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (account_number <> '' or qr_content <> '' or qris_image_url is not null)
);
create index if not exists donation_accounts_mosque_idx on public.donation_accounts (mosque_id, is_active, sort_order);

-- ---------------------------------------------------------------------
-- 11. Konten islami (ayat, hadis, doa, kutipan)
-- ---------------------------------------------------------------------
create table if not exists public.islamic_contents (
  id           uuid primary key default gen_random_uuid(),
  mosque_id    uuid not null references public.mosque_profiles (id) on delete cascade,
  type         text not null default 'ayat' check (type in ('ayat', 'hadis', 'doa', 'kutipan')),
  arabic_text  text not null default '',
  translation  text not null check (char_length(btrim(translation)) between 5 and 800),
  source       text not null check (char_length(btrim(source)) between 2 and 120),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists islamic_contents_mosque_idx on public.islamic_contents (mosque_id, is_active);

-- ---------------------------------------------------------------------
-- Timestamp otomatis
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['mosque_profiles', 'users', 'prayer_schedules', 'display_settings', 'display_devices', 'announcements',
                           'slideshow_contents', 'mosque_events', 'financial_transactions', 'donation_accounts', 'islamic_contents']
  loop
    execute format('drop trigger if exists trg_updated_at on public.%I', t);
    execute format('create trigger trg_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
