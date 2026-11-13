-- =====================================================================
-- LOMBA RANGKING 1 — 0001: SKEMA DATABASE
-- Jalankan berurutan di Supabase SQL Editor: 0001 → 0002 → 0003 → 0004 → seed.sql
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- RBAC
-- ---------------------------------------------------------------------
create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique check (key in ('superadmin', 'admin')),
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role_id    uuid not null references public.roles (id),
  full_name  text not null default '',
  email      text,
  is_active  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role_id);

-- ---------------------------------------------------------------------
-- MASTER DATA
-- ---------------------------------------------------------------------
create table public.districts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  code       text,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  constraint districts_name_key unique (name),
  constraint districts_code_key unique (code)
);

create table public.education_levels (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- EVENT
-- ---------------------------------------------------------------------
create table public.events (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null check (length(trim(name)) > 0),
  description               text,
  location                  text,
  organizer                 text,
  logo_url                  text,
  start_date                date,
  end_date                  date,
  status                    text not null default 'draft'
                            check (status in ('draft', 'published', 'ongoing', 'completed', 'archived')),
  is_public                 boolean not null default false,
  participants_per_district integer not null default 3 check (participants_per_district > 0),
  created_by                uuid references public.profiles (id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint events_dates_chk check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.event_settings (
  id                            uuid primary key default gen_random_uuid(),
  event_id                      uuid not null unique references public.events (id) on delete cascade,
  base_points                   numeric(8, 2) not null default 100 check (base_points >= 0),
  speed_bonus                   numeric(8, 2) not null default 50 check (speed_bonus >= 0),
  wrong_penalty                 numeric(8, 2) not null default 0 check (wrong_penalty >= 0),
  duration_seconds              integer not null default 20 check (duration_seconds between 3 and 600),
  lead_seconds                  integer not null default 3 check (lead_seconds between 0 and 30),
  rounding_mode                 text not null default 'round' check (rounding_mode in ('round', 'floor', 'ceil')),
  rounding_decimals             integer not null default 2 check (rounding_decimals between 0 and 4),
  leaderboard_size              integer not null default 10 check (leaderboard_size between 3 and 50),
  updated_at                    timestamptz not null default now()
);

create table public.admin_assignments (
  id                       uuid primary key default gen_random_uuid(),
  admin_id                 uuid not null references public.profiles (id) on delete cascade,
  event_id                 uuid not null references public.events (id) on delete cascade,
  can_manage_participants  boolean not null default true,
  can_manage_questions     boolean not null default true,
  can_control_competition  boolean not null default true,
  can_view_reports         boolean not null default true,
  created_by               uuid references public.profiles (id) on delete set null,
  created_at               timestamptz not null default now(),
  unique (admin_id, event_id)
);
create index admin_assignments_event_idx on public.admin_assignments (event_id);

-- ---------------------------------------------------------------------
-- PESERTA
-- ---------------------------------------------------------------------
create table public.participants (
  id                 uuid primary key default gen_random_uuid(),
  participant_number text not null check (length(trim(participant_number)) > 0),
  code               text not null unique check (code = upper(code) and length(code) between 4 and 20),
  full_name          text not null check (length(trim(full_name)) > 0),
  school             text not null default '',
  education_level_id uuid not null references public.education_levels (id),
  district_id        uuid not null references public.districts (id),
  photo_url          text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index participants_level_idx on public.participants (education_level_id);
create index participants_district_idx on public.participants (district_id);

-- Kredensial: tidak pernah dapat dibaca klien (RLS tanpa kebijakan + tanpa GRANT).
create table public.participant_credentials (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid not null unique references public.participants (id) on delete cascade,
  pin_hash        text not null,
  failed_attempts integer not null default 0,
  locked_until    timestamptz,
  pin_updated_at  timestamptz not null default now()
);

-- Token sesi peserta (hanya hash SHA-256 yang disimpan).
create table public.participant_sessions (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants (id) on delete cascade,
  token_hash     text not null unique,
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  expires_at     timestamptz not null,
  revoked_at     timestamptz
);
create index participant_sessions_participant_idx on public.participant_sessions (participant_id);

create table public.event_participants (
  id                   uuid primary key default gen_random_uuid(),
  event_id             uuid not null references public.events (id) on delete cascade,
  participant_id       uuid not null references public.participants (id) on delete cascade,
  registration_status  text not null default 'pending'
                       check (registration_status in ('pending', 'verified', 'rejected')),
  participation_status text not null default 'registered'
                       check (participation_status in ('registered', 'active', 'withdrawn', 'disqualified')),
  verified_by          uuid references public.profiles (id) on delete set null,
  verified_at          timestamptz,
  created_at           timestamptz not null default now(),
  unique (event_id, participant_id)
);
create index event_participants_participant_idx on public.event_participants (participant_id);

-- ---------------------------------------------------------------------
-- BANK SOAL
-- ---------------------------------------------------------------------
create table public.question_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) > 0),
  description text,
  created_at  timestamptz not null default now()
);

create table public.questions (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references public.events (id) on delete cascade,
  category_id        uuid references public.question_categories (id) on delete set null,
  education_level_id uuid references public.education_levels (id) on delete set null,
  type               text not null check (type in ('multiple_choice', 'true_false', 'short_answer')),
  difficulty         text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  question_text      text not null check (length(trim(question_text)) > 0),
  image_url          text,
  explanation        text,
  case_sensitive     boolean not null default false,
  ignore_whitespace  boolean not null default true,
  is_active          boolean not null default true,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index questions_event_idx on public.questions (event_id, education_level_id);
create index questions_category_idx on public.questions (category_id);

-- Untuk pilihan ganda / benar-salah: daftar opsi, tepat satu is_correct.
-- Untuk jawaban singkat: daftar jawaban yang diterima (semua is_correct = true).
create table public.question_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  option_text text not null check (length(trim(option_text)) > 0),
  is_correct  boolean not null default false,
  sort_order  integer not null default 0
);
create index question_options_question_idx on public.question_options (question_id, sort_order);

create table public.question_packages (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references public.events (id) on delete cascade,
  education_level_id uuid references public.education_levels (id) on delete set null,
  name               text not null check (length(trim(name)) > 0),
  description        text,
  shuffle_questions  boolean not null default false,
  shuffle_options    boolean not null default false,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index question_packages_event_idx on public.question_packages (event_id);

create table public.package_questions (
  id          uuid primary key default gen_random_uuid(),
  package_id  uuid not null references public.question_packages (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  sort_order  integer not null default 0,
  unique (package_id, question_id)
);
create index package_questions_question_idx on public.package_questions (question_id);

-- ---------------------------------------------------------------------
-- KOMPETISI
-- ---------------------------------------------------------------------
create table public.competition_sessions (
  id                    uuid primary key default gen_random_uuid(),
  event_id              uuid not null references public.events (id) on delete cascade,
  education_level_id    uuid not null references public.education_levels (id),
  name                  text not null check (length(trim(name)) > 0),
  code                  text not null unique check (code = upper(code) and length(code) between 4 and 12),
  status                text not null default 'draft'
                        check (status in ('draft', 'open', 'running', 'paused', 'finished', 'cancelled')),
  display_screen        text not null default 'waiting'
                        check (display_screen in ('waiting', 'question', 'processing', 'result', 'leaderboard', 'podium')),
  current_round_id      uuid,
  current_question_id   uuid,
  results_published     boolean not null default false,
  scheduled_at          timestamptz,
  opened_at             timestamptz,
  started_at            timestamptz,
  paused_at             timestamptz,
  finished_at           timestamptz,
  winners_announced_at  timestamptz,
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index competition_sessions_event_idx on public.competition_sessions (event_id, status);

create table public.session_participants (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.competition_sessions (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  joined_at      timestamptz,
  last_seen_at   timestamptz,
  created_at     timestamptz not null default now(),
  unique (session_id, participant_id)
);
create index session_participants_participant_idx on public.session_participants (participant_id);

create table public.competition_rounds (
  id                          uuid primary key default gen_random_uuid(),
  session_id                  uuid not null references public.competition_sessions (id) on delete cascade,
  sequence                    integer not null check (sequence > 0),
  name                        text not null check (length(trim(name)) > 0),
  mode                        text not null default 'normal'
                              check (mode in ('normal', 'speed', 'elimination', 'final', 'tiebreak')),
  status                      text not null default 'pending' check (status in ('pending', 'active', 'finished')),
  -- Penilaian (diisi otomatis dari event_settings bila NULL saat INSERT)
  base_points                 numeric(8, 2) not null check (base_points >= 0),
  speed_bonus                 numeric(8, 2) not null check (speed_bonus >= 0),
  wrong_penalty               numeric(8, 2) not null check (wrong_penalty >= 0),
  duration_seconds            integer not null check (duration_seconds between 3 and 600),
  lead_seconds                integer not null check (lead_seconds between 0 and 30),
  rounding_mode               text not null check (rounding_mode in ('round', 'floor', 'ceil')),
  rounding_decimals           integer not null check (rounding_decimals between 0 and 4),
  shuffle_options             boolean not null default false,
  -- Roster
  participant_scope           text not null default 'all'
                              check (participant_scope in ('all', 'survivors', 'top_n', 'manual')),
  top_n                       integer check (top_n is null or top_n > 0),
  reset_scores                boolean not null default false,
  -- Eliminasi
  elimination_rule            text not null default 'none'
                              check (elimination_rule in ('none', 'wrong_count', 'score_threshold', 'manual')),
  elimination_wrong_limit     integer not null default 1 check (elimination_wrong_limit > 0),
  elimination_score_threshold numeric(10, 2),
  elimination_after_question  integer not null default 1 check (elimination_after_question > 0),
  count_unanswered_as_wrong   boolean not null default true,
  started_at                  timestamptz,
  finished_at                 timestamptz,
  created_at                  timestamptz not null default now(),
  unique (session_id, sequence),
  constraint rounds_topn_chk check (participant_scope <> 'top_n' or top_n is not null),
  constraint rounds_threshold_chk check (elimination_rule <> 'score_threshold' or elimination_score_threshold is not null)
);

create table public.competition_questions (
  id               uuid primary key default gen_random_uuid(),
  round_id         uuid not null references public.competition_rounds (id) on delete cascade,
  question_id      uuid not null references public.questions (id) on delete restrict,
  sequence         integer not null check (sequence > 0),
  status           text not null default 'pending'
                   check (status in ('pending', 'active', 'closed', 'revealed', 'cancelled')),
  duration_seconds integer not null check (duration_seconds between 3 and 600),
  option_order     uuid[] not null default '{}',
  started_at       timestamptz,
  deadline_at      timestamptz,
  paused_at        timestamptz,
  closed_at        timestamptz,
  revealed_at      timestamptz,
  cancelled_at     timestamptz,
  cancel_reason    text,
  created_at       timestamptz not null default now(),
  unique (round_id, sequence),
  unique (round_id, question_id),
  constraint cq_time_chk check (deadline_at is null or started_at is null or deadline_at > started_at)
);
create index competition_questions_question_idx on public.competition_questions (question_id);

alter table public.competition_sessions
  add constraint competition_sessions_current_round_fk
    foreign key (current_round_id) references public.competition_rounds (id) on delete set null,
  add constraint competition_sessions_current_question_fk
    foreign key (current_question_id) references public.competition_questions (id) on delete set null;

-- Satu baris per (soal tayang, peserta) — constraint UNIQUE adalah jaring terakhir anti-jawaban-ganda.
create table public.participant_answers (
  id                      uuid primary key default gen_random_uuid(),
  competition_question_id uuid not null references public.competition_questions (id) on delete cascade,
  participant_id          uuid not null references public.participants (id) on delete cascade,
  selected_option_id      uuid references public.question_options (id) on delete restrict,
  answer_text             text,
  is_correct              boolean not null,
  response_time_ms        integer not null check (response_time_ms >= 0),
  points                  numeric(10, 2) not null,
  answered_at             timestamptz not null,
  idempotency_key         text not null check (length(idempotency_key) between 8 and 80),
  constraint participant_answers_once unique (competition_question_id, participant_id)
);
create index participant_answers_participant_idx on public.participant_answers (participant_id);

-- Roster babak + agregat skor per babak. Sumber data riwayat & tie-breaker.
create table public.scores (
  id                     uuid primary key default gen_random_uuid(),
  round_id               uuid not null references public.competition_rounds (id) on delete cascade,
  participant_id         uuid not null references public.participants (id) on delete cascade,
  total_points           numeric(12, 2) not null default 0,
  correct_count          integer not null default 0 check (correct_count >= 0),
  wrong_count            integer not null default 0 check (wrong_count >= 0),
  unanswered_count       integer not null default 0 check (unanswered_count >= 0),
  correct_response_ms    bigint not null default 0 check (correct_response_ms >= 0),
  total_response_ms      bigint not null default 0 check (total_response_ms >= 0),
  is_eliminated          boolean not null default false,
  eliminated_at          timestamptz,
  eliminated_at_sequence integer,
  elimination_auto       boolean,
  elimination_reason     text,
  updated_at             timestamptz not null default now(),
  unique (round_id, participant_id)
);
create index scores_participant_idx on public.scores (participant_id);

-- Klasemen sesi. `rank` ditetapkan backend (fungsi _rebuild_leaderboard).
create table public.leaderboards (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null references public.competition_sessions (id) on delete cascade,
  participant_id       uuid not null references public.participants (id) on delete cascade,
  total_points         numeric(12, 2) not null default 0,
  correct_count        integer not null default 0,
  wrong_count          integer not null default 0,
  unanswered_count     integer not null default 0,
  correct_response_ms  bigint not null default 0,
  total_response_ms    bigint not null default 0,
  tiebreak_points      numeric(12, 2) not null default 0,
  tiebreak_response_ms bigint not null default 0,
  is_finalist          boolean not null default false,
  is_eliminated        boolean not null default false,
  rank                 integer,
  updated_at           timestamptz not null default now(),
  unique (session_id, participant_id)
);
create index leaderboards_rank_idx on public.leaderboards (session_id, rank);

-- ---------------------------------------------------------------------
-- PENGUMUMAN, AUDIT, PENGATURAN, RATE LIMIT
-- ---------------------------------------------------------------------
create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid references public.events (id) on delete cascade,
  session_id   uuid references public.competition_sessions (id) on delete cascade,
  type         text not null default 'info' check (type in ('info', 'schedule', 'winner')),
  title        text not null check (length(trim(title)) > 0),
  body         text,
  scheduled_at timestamptz,
  is_published boolean not null default false,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index announcements_event_idx on public.announcements (event_id, is_published);

create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid,
  actor_label text,
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  event_id    uuid,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_event_idx on public.audit_logs (event_id, created_at desc);

create table public.app_settings (
  key        text primary key,
  value      jsonb not null,
  is_public  boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  hits         integer not null
);
