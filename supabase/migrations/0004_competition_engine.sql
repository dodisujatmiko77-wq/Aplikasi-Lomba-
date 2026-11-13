-- =====================================================================
-- LOMBA RANGKING 1 — 0004: MESIN LOMBA
-- Skor, login peserta, snapshot realtime, submit jawaban atomik,
-- kontrol operator, eliminasi, tie-breaker, laporan.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PENILAIAN
-- skor = dasar + bonus × (sisa waktu / total waktu)   — hanya untuk jawaban benar
-- ---------------------------------------------------------------------
create or replace function public.calculate_score(
  p_is_correct boolean, p_base numeric, p_bonus numeric, p_penalty numeric,
  p_total_ms numeric, p_remaining_ms numeric,
  p_rounding_mode text default 'round', p_decimals integer default 2
) returns numeric
language plpgsql immutable as $$
declare v_raw numeric; v_f numeric := power(10::numeric, coalesce(p_decimals, 2));
begin
  if p_is_correct then
    v_raw := p_base + p_bonus * greatest(0, least(1, p_remaining_ms / nullif(p_total_ms, 0)));
  else
    v_raw := -coalesce(p_penalty, 0);
  end if;
  return case coalesce(p_rounding_mode, 'round')
           when 'floor' then floor(v_raw * v_f) / v_f
           when 'ceil'  then ceil(v_raw * v_f) / v_f
           else round(v_raw, coalesce(p_decimals, 2)) end;
end $$;

-- Normalisasi jawaban singkat (selalu di server).
create or replace function public._normalize_answer(p_text text, p_case_sensitive boolean, p_ignore_whitespace boolean)
returns text language sql immutable as $$
  select case when p_case_sensitive then t else lower(t) end
  from (select case when p_ignore_whitespace
                    then regexp_replace(coalesce(p_text, ''), '\s+', '', 'g')
                    else regexp_replace(trim(coalesce(p_text, '')), '\s+', ' ', 'g') end as t) x
$$;

-- ---------------------------------------------------------------------
-- 2. REALTIME (broadcast sinyal perubahan) & RATE LIMIT
-- ---------------------------------------------------------------------
create or replace function public._notify(p_session_id uuid, p_event text, p_payload jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then return; end if;
  select code into v_code from competition_sessions where id = p_session_id;
  begin
    execute 'select realtime.send($1, $2, $3, false)'
      using coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('at', clock_timestamp()), p_event, 'live:' || v_code;
  exception when others then null; -- realtime tidak boleh menggagalkan transaksi lomba
  end;
end $$;

create or replace function public._rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_hits integer; v_now timestamptz := clock_timestamp();
begin
  insert into rate_limits as rl (key, window_start, hits) values (p_key, v_now, 1)
  on conflict (key) do update set
    hits = case when rl.window_start < v_now - make_interval(secs => p_window_seconds) then 1 else rl.hits + 1 end,
    window_start = case when rl.window_start < v_now - make_interval(secs => p_window_seconds) then v_now else rl.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;

create or replace function public._client_ip() returns text
language plpgsql stable as $$
declare v text;
begin
  begin
    v := nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for';
  exception when others then v := null;
  end;
  return coalesce(nullif(trim(split_part(coalesce(v, ''), ',', 1)), ''), 'lokal');
end $$;

-- ---------------------------------------------------------------------
-- 3. AUTENTIKASI PESERTA (kode + PIN → token sesi)
-- ---------------------------------------------------------------------
create or replace function public._participant_from_token(p_token text) returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select ps.participant_id from participant_sessions ps
  where ps.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and ps.revoked_at is null and ps.expires_at > now()
$$;

create or replace function public.participant_login(p_code text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_p participants; v_c participant_credentials; v_token text; v_left int;
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
    perform crypt(p_pin, gen_salt('bf', 8)); -- samakan waktu respons agar kode valid tidak bisa ditebak
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

  update participant_credentials set failed_attempts = 0, locked_until = null where id = v_c.id;
  -- Satu perangkat aktif per peserta: login baru mencabut sesi lama.
  update participant_sessions set revoked_at = now() where participant_id = v_p.id and revoked_at is null;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into participant_sessions (participant_id, token_hash, expires_at)
  values (v_p.id, encode(digest(v_token, 'sha256'), 'hex'), now() + interval '18 hours');

  return jsonb_build_object('ok', true, 'token', v_token, 'participant', public._participant_public(v_p.id));
end $$;

create or replace function public._participant_public(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'code', p.code, 'number', p.participant_number, 'name', p.full_name,
                            'school', p.school, 'photo_url', p.photo_url, 'level', l.name, 'district', d.name)
  from participants p
  join education_levels l on l.id = p.education_level_id
  join districts d on d.id = p.district_id
  where p.id = p_id
$$;

create or replace function public.participant_logout(p_token text) returns void
language sql security definer set search_path = public, extensions as $$
  update participant_sessions set revoked_at = now()
  where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') and revoked_at is null
$$;

-- ---------------------------------------------------------------------
-- 4. KLASEMEN — satu-satunya sumber urutan ranking
--    finalis → belum tereliminasi → poin → benar → waktu benar → tie-break
--    (mode kecepatan: waktu benar didahulukan sebelum jumlah benar)
-- ---------------------------------------------------------------------
create or replace function public._leaderboard_ranked(p_session_id uuid)
returns table (
  participant_id uuid, rank integer, tied boolean,
  total_points numeric, correct_count integer, wrong_count integer, unanswered_count integer,
  correct_response_ms bigint, total_response_ms bigint,
  tiebreak_points numeric, tiebreak_response_ms bigint, is_finalist boolean, is_eliminated boolean
)
language sql stable security definer set search_path = public as $$
  with cfg as (
    select coalesce((select r.mode = 'speed' from competition_rounds r
                     where r.session_id = p_session_id and r.status <> 'pending' and r.mode <> 'tiebreak'
                     order by r.sequence desc limit 1), false) as speed)
  select l.participant_id,
         (row_number() over (order by
            l.is_finalist desc, l.is_eliminated asc, l.total_points desc,
            case when cfg.speed then l.correct_response_ms end asc nulls last,
            l.correct_count desc, l.correct_response_ms asc,
            l.tiebreak_points desc, l.tiebreak_response_ms asc,
            p.participant_number asc, p.id asc))::integer,
         count(*) over (partition by l.is_finalist, l.is_eliminated, l.total_points, l.correct_count,
                                     l.correct_response_ms, l.tiebreak_points, l.tiebreak_response_ms) > 1,
         l.total_points, l.correct_count, l.wrong_count, l.unanswered_count,
         l.correct_response_ms, l.total_response_ms,
         l.tiebreak_points, l.tiebreak_response_ms, l.is_finalist, l.is_eliminated
  from leaderboards l
  join participants p on p.id = l.participant_id
  cross join cfg
  where l.session_id = p_session_id
$$;

-- Hitung ulang agregat babak dari jawaban (otoritatif; dipanggil saat soal ditutup / dibatalkan).
create or replace function public._recompute_round(p_round_id uuid) returns void
language sql security definer set search_path = public as $$
  update scores sc set
    total_points = a.tp, correct_count = a.c, wrong_count = a.w, unanswered_count = a.u,
    correct_response_ms = a.cms, total_response_ms = a.tms, updated_at = now()
  from (
    select s.id,
           coalesce(sum(pa.points), 0) as tp,
           count(pa.id) filter (where pa.is_correct) as c,
           count(pa.id) filter (where not pa.is_correct) as w,
           count(cq.id) filter (where pa.id is null and cq.status in ('closed', 'revealed')
                                  and (s.eliminated_at_sequence is null or cq.sequence <= s.eliminated_at_sequence)) as u,
           coalesce(sum(pa.response_time_ms) filter (where pa.is_correct), 0) as cms,
           coalesce(sum(pa.response_time_ms), 0) as tms
    from scores s
    left join competition_questions cq
           on cq.round_id = s.round_id and cq.status in ('active', 'closed', 'revealed')
    left join participant_answers pa
           on pa.competition_question_id = cq.id and pa.participant_id = s.participant_id
    where s.round_id = p_round_id
    group by s.id) a
  where sc.id = a.id
$$;

create or replace function public._rebuild_leaderboard(p_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into leaderboards (session_id, participant_id)
  select p_session_id, sp.participant_id from session_participants sp where sp.session_id = p_session_id
  on conflict (session_id, participant_id) do nothing;

  with rs as (
    select r.id, r.sequence, r.mode, r.reset_scores from competition_rounds r
    where r.session_id = p_session_id and r.status <> 'pending'),
  starts as (
    -- Skor dihitung sejak babak "reset" terakhir yang diikuti peserta tersebut.
    select l.participant_id,
           coalesce((select max(rs.sequence) from rs
                     join scores s on s.round_id = rs.id and s.participant_id = l.participant_id
                     where rs.reset_scores and rs.mode <> 'tiebreak'), 0) as start_seq
    from leaderboards l where l.session_id = p_session_id),
  agg as (
    select st.participant_id,
           coalesce(sum(x.total_points) filter (where x.mode <> 'tiebreak'), 0) as tp,
           coalesce(sum(x.correct_count) filter (where x.mode <> 'tiebreak'), 0) as c,
           coalesce(sum(x.wrong_count) filter (where x.mode <> 'tiebreak'), 0) as w,
           coalesce(sum(x.unanswered_count) filter (where x.mode <> 'tiebreak'), 0) as u,
           coalesce(sum(x.correct_response_ms) filter (where x.mode <> 'tiebreak'), 0) as cms,
           coalesce(sum(x.total_response_ms) filter (where x.mode <> 'tiebreak'), 0) as tms,
           coalesce(sum(x.total_points) filter (where x.mode = 'tiebreak'), 0) as tbp,
           coalesce(sum(x.correct_response_ms) filter (where x.mode = 'tiebreak'), 0) as tbms,
           coalesce(bool_or(x.mode = 'final'), false) as fin
    from starts st
    left join lateral (
      select s.*, rs.mode from scores s join rs on rs.id = s.round_id
      where s.participant_id = st.participant_id and rs.sequence >= st.start_seq) x on true
    group by st.participant_id),
  elim as (
    select distinct on (s.participant_id) s.participant_id, s.is_eliminated
    from scores s join rs on rs.id = s.round_id
    where rs.mode <> 'tiebreak'
    order by s.participant_id, rs.sequence desc)
  update leaderboards l set
    total_points = agg.tp, correct_count = agg.c, wrong_count = agg.w, unanswered_count = agg.u,
    correct_response_ms = agg.cms, total_response_ms = agg.tms,
    tiebreak_points = agg.tbp, tiebreak_response_ms = agg.tbms,
    is_finalist = agg.fin, is_eliminated = coalesce(elim.is_eliminated, false), updated_at = now()
  from agg left join elim on elim.participant_id = agg.participant_id
  where l.session_id = p_session_id and l.participant_id = agg.participant_id;

  update leaderboards l set rank = r.rank
  from public._leaderboard_ranked(p_session_id) r
  where l.session_id = p_session_id and l.participant_id = r.participant_id and l.rank is distinct from r.rank;
end $$;

create or replace function public._leaderboard_json(p_session_id uuid, p_limit integer default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row order by rnk), '[]'::jsonb) from (
    select r.rank as rnk, jsonb_build_object(
      'rank', r.rank, 'tied', r.tied, 'participant_id', p.id, 'number', p.participant_number,
      'name', p.full_name, 'school', p.school, 'district', d.name, 'photo_url', p.photo_url,
      'points', r.total_points, 'correct', r.correct_count, 'wrong', r.wrong_count,
      'unanswered', r.unanswered_count, 'correct_ms', r.correct_response_ms, 'total_ms', r.total_response_ms,
      'avg_ms', case when r.correct_count > 0 then round(r.correct_response_ms::numeric / r.correct_count) end,
      'tiebreak_points', r.tiebreak_points, 'tiebreak_ms', r.tiebreak_response_ms,
      'is_finalist', r.is_finalist, 'is_eliminated', r.is_eliminated) as row
    from public._leaderboard_ranked(p_session_id) r
    join participants p on p.id = r.participant_id
    join districts d on d.id = p.district_id
    where p_limit is null or r.rank <= p_limit) z
$$;

-- ---------------------------------------------------------------------
-- 5. PAYLOAD SOAL PUBLIK — kunci jawaban hanya disertakan bila p_reveal = true
-- ---------------------------------------------------------------------
create or replace function public._question_payload(p_cq_id uuid, p_reveal boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', cq.id, 'sequence', cq.sequence,
    'total', (select count(*) from competition_questions x where x.round_id = cq.round_id and x.status <> 'cancelled'),
    'type', q.type, 'text', q.question_text, 'image_url', q.image_url,
    'category', (select c.name from question_categories c where c.id = q.category_id),
    'difficulty', q.difficulty, 'status', cq.status, 'duration_seconds', cq.duration_seconds,
    'started_at', cq.started_at, 'deadline_at', cq.deadline_at, 'paused_at', cq.paused_at,
    'options', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', o.id, 'label', chr(64 + u.ord::int), 'text', o.option_text)
        || case when p_reveal then jsonb_build_object(
             'is_correct', o.is_correct,
             'count', (select count(*) from participant_answers pa
                       where pa.competition_question_id = cq.id and pa.selected_option_id = o.id))
           else '{}'::jsonb end
        order by u.ord)
      from unnest(cq.option_order) with ordinality as u(oid, ord)
      join question_options o on o.id = u.oid), '[]'::jsonb),
    'reveal', case when p_reveal then jsonb_build_object(
      'correct_text', (select o.option_text from question_options o
                       where o.question_id = q.id and o.is_correct order by o.sort_order limit 1),
      'correct_label', (select chr(64 + u.ord::int) from unnest(cq.option_order) with ordinality as u(oid, ord)
                        join question_options o on o.id = u.oid where o.is_correct limit 1),
      'accepted', case when q.type = 'short_answer' then (
        select jsonb_agg(o.option_text order by o.sort_order) from question_options o where o.question_id = q.id) end,
      'explanation', q.explanation,
      'answered', (select count(*) from participant_answers pa where pa.competition_question_id = cq.id),
      'correct_count', (select count(*) from participant_answers pa where pa.competition_question_id = cq.id and pa.is_correct),
      'fastest', (select jsonb_build_object('name', p.full_name, 'school', p.school, 'ms', pa.response_time_ms, 'points', pa.points)
                  from participant_answers pa join participants p on p.id = pa.participant_id
                  where pa.competition_question_id = cq.id and pa.is_correct
                  order by pa.response_time_ms, pa.answered_at limit 1)
    ) end)
  from competition_questions cq join questions q on q.id = cq.question_id
  where cq.id = p_cq_id
$$;

-- ---------------------------------------------------------------------
-- 6. PENUTUPAN SOAL (idempoten) + ELIMINASI OTOMATIS
-- ---------------------------------------------------------------------
create or replace function public._close_question(p_cq_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare cq competition_questions; r competition_rounds;
begin
  -- UPDATE ini menunggu semua submit yang sedang memegang kunci FOR SHARE selesai.
  update competition_questions set status = 'closed', closed_at = clock_timestamp(), paused_at = null
   where id = p_cq_id and status = 'active' returning * into cq;
  if not found then return false; end if;
  select * into r from competition_rounds where id = cq.round_id;

  perform public._recompute_round(r.id);

  if r.elimination_rule = 'wrong_count' then
    update scores set is_eliminated = true, eliminated_at = now(), eliminated_at_sequence = cq.sequence,
           elimination_auto = true,
           elimination_reason = format('Mencapai batas %s kesalahan', r.elimination_wrong_limit)
     where round_id = r.id and not is_eliminated
       and wrong_count + case when r.count_unanswered_as_wrong then unanswered_count else 0 end >= r.elimination_wrong_limit;
  elsif r.elimination_rule = 'score_threshold' and cq.sequence >= r.elimination_after_question then
    update scores set is_eliminated = true, eliminated_at = now(), eliminated_at_sequence = cq.sequence,
           elimination_auto = true,
           elimination_reason = format('Skor di bawah ambang %s', r.elimination_score_threshold)
     where round_id = r.id and not is_eliminated and total_points < r.elimination_score_threshold;
  end if;

  perform public._rebuild_leaderboard(r.session_id);
  update competition_sessions set display_screen = 'processing'
   where id = r.session_id and current_question_id = cq.id;
  perform public._notify(r.session_id, 'state', jsonb_build_object('reason', 'closed'));
  return true;
end $$;

-- Penutupan "malas": snapshot pertama setelah deadline menutup soal. Urutan kunci: sesi → soal.
create or replace function public._auto_close(p_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_cq uuid;
begin
  if not exists (select 1 from competition_sessions s join competition_questions cq on cq.id = s.current_question_id
                 where s.id = p_session_id and s.status = 'running' and cq.status = 'active'
                   and cq.paused_at is null and cq.deadline_at + interval '300 milliseconds' < clock_timestamp()) then
    return;
  end if;
  select s.current_question_id into v_cq from competition_sessions s
   where s.id = p_session_id and s.status = 'running' for update skip locked;
  if v_cq is null then return; end if;
  perform public._close_question(v_cq);
end $$;

-- ---------------------------------------------------------------------
-- 7. SNAPSHOT STATE (dipakai monitor, peserta, dan panel operator)
-- ---------------------------------------------------------------------
create or replace function public._session_snapshot(p_session_id uuid, p_with_leaderboard boolean, p_limit integer default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s competition_sessions; e events; r competition_rounds; cq competition_questions;
  v_now timestamptz := clock_timestamp(); v_question jsonb; v_upcoming jsonb; v_limit int; v_notice text;
begin
  select * into s from competition_sessions where id = p_session_id;
  select * into e from events where id = s.event_id;
  if s.current_round_id is not null then select * into r from competition_rounds where id = s.current_round_id; end if;
  if s.current_question_id is not null then select * into cq from competition_questions where id = s.current_question_id; end if;
  v_limit := coalesce(p_limit, (select leaderboard_size from event_settings where event_id = s.event_id), 10);

  if cq.id is not null then
    if cq.status = 'cancelled' then
      v_notice := 'Soal dibatalkan oleh operator';
    elsif cq.status = 'active' and (v_now < cq.started_at or s.status = 'paused') then
      -- Soal belum boleh terlihat (hitung mundur / jeda).
      v_upcoming := jsonb_build_object('id', cq.id, 'sequence', cq.sequence, 'starts_at', cq.started_at,
                                       'duration_seconds', cq.duration_seconds,
                                       'total', (select count(*) from competition_questions x
                                                 where x.round_id = cq.round_id and x.status <> 'cancelled'));
    elsif cq.status in ('active', 'closed', 'revealed') then
      v_question := public._question_payload(cq.id, cq.status = 'revealed');
    end if;
  end if;

  return jsonb_build_object(
    'server_now', v_now,
    'session', jsonb_build_object(
      'id', s.id, 'code', s.code, 'name', s.name, 'status', s.status, 'display_screen', s.display_screen,
      'results_published', s.results_published, 'scheduled_at', s.scheduled_at,
      'event_name', e.name, 'organizer', e.organizer, 'logo_url', e.logo_url, 'location', e.location,
      'level', (select name from education_levels where id = s.education_level_id)),
    'round', case when r.id is not null then jsonb_build_object(
      'id', r.id, 'name', r.name, 'mode', r.mode, 'sequence', r.sequence, 'status', r.status,
      'elimination_rule', r.elimination_rule, 'base_points', r.base_points, 'speed_bonus', r.speed_bonus) end,
    'question', v_question,
    'upcoming', v_upcoming,
    'notice', v_notice,
    'counts', jsonb_build_object(
      'participants', (select count(*) from session_participants sp where sp.session_id = s.id),
      'online', (select count(*) from session_participants sp
                 where sp.session_id = s.id and sp.last_seen_at > v_now - interval '45 seconds'),
      'active', case when r.id is not null
                     then (select count(*) from scores sc where sc.round_id = r.id and not sc.is_eliminated)
                     else (select count(*) from session_participants sp where sp.session_id = s.id) end,
      'eliminated', case when r.id is not null
                         then (select count(*) from scores sc where sc.round_id = r.id and sc.is_eliminated) else 0 end,
      'answered', case when cq.id is not null and cq.status <> 'cancelled'
                       then (select count(*) from participant_answers pa where pa.competition_question_id = cq.id) else 0 end),
    'leaderboard', case when p_with_leaderboard then public._leaderboard_json(s.id, v_limit) end,
    'winners', case when s.display_screen = 'podium' or s.winners_announced_at is not null
                    then public._leaderboard_json(s.id, 3) end);
end $$;

-- Monitor publik: /live/:sessionCode
create or replace function public.get_live_state(p_code text, p_limit integer default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from competition_sessions
   where code = upper(trim(coalesce(p_code, ''))) and status <> 'cancelled';
  if v_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Sesi tidak ditemukan');
  end if;
  perform public._auto_close(v_id);
  return jsonb_build_object('ok', true) || public._session_snapshot(v_id, true, case when p_limit is null then null else least(greatest(p_limit, 3), 100) end);
end $$;

-- State peserta: /peserta
create or replace function public.participant_get_state(p_token text, p_session_code text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_pid uuid := public._participant_from_token(p_token);
  v_sid uuid; s competition_sessions; cq competition_questions; sc scores;
  v_snap jsonb; v_answer jsonb; v_me jsonb; v_sessions jsonb; pa participant_answers; v_settled boolean;
begin
  if v_pid is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'Sesi login berakhir. Silakan masuk kembali.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('code', x.code, 'name', x.name, 'status', x.status,
                                               'event_name', x.event_name, 'scheduled_at', x.scheduled_at)
                            order by x.prio, x.created_at desc), '[]'::jsonb)
    into v_sessions
  from (select cs.code, cs.name, cs.status, cs.scheduled_at, cs.created_at, ev.name as event_name,
               case cs.status when 'running' then 0 when 'paused' then 0 when 'open' then 1 else 2 end as prio
        from session_participants sp
        join competition_sessions cs on cs.id = sp.session_id
        join events ev on ev.id = cs.event_id
        where sp.participant_id = v_pid and cs.status in ('open', 'running', 'paused', 'finished')) x;

  select cs.id into v_sid
  from session_participants sp join competition_sessions cs on cs.id = sp.session_id
  where sp.participant_id = v_pid and cs.status in ('open', 'running', 'paused', 'finished')
    and (p_session_code is null or cs.code = upper(trim(p_session_code)))
  order by case cs.status when 'running' then 0 when 'paused' then 0 when 'open' then 1 else 2 end, cs.created_at desc
  limit 1;

  if v_sid is null then
    return jsonb_build_object('ok', true, 'server_now', clock_timestamp(),
                              'participant', public._participant_public(v_pid), 'sessions', v_sessions, 'session', null);
  end if;

  -- Kehadiran (dibatasi agar tidak menulis pada setiap polling)
  update session_participants set joined_at = coalesce(joined_at, now()), last_seen_at = now()
   where session_id = v_sid and participant_id = v_pid
     and (last_seen_at is null or last_seen_at < now() - interval '12 seconds');

  perform public._auto_close(v_sid);
  select * into s from competition_sessions where id = v_sid;
  v_snap := public._session_snapshot(v_sid, s.display_screen in ('leaderboard', 'podium') or s.status = 'finished', 10);

  if s.current_question_id is not null then
    select * into cq from competition_questions where id = s.current_question_id;
    select * into pa from participant_answers where competition_question_id = cq.id and participant_id = v_pid;
    if pa.id is not null and cq.status <> 'cancelled' then
      v_answer := jsonb_build_object('submitted', true, 'option_id', pa.selected_option_id, 'answer_text', pa.answer_text,
                                     'answered_at', pa.answered_at, 'response_time_ms', pa.response_time_ms)
        || case when cq.status = 'revealed'
                then jsonb_build_object('is_correct', pa.is_correct, 'points', pa.points) else '{}'::jsonb end;
    end if;
  end if;
  if s.current_round_id is not null then
    select * into sc from scores where round_id = s.current_round_id and participant_id = v_pid;
  end if;

  -- Peringkat & poin pribadi hanya dikirim bila tidak ada soal yang hasilnya belum dibuka.
  v_settled := cq.id is null or cq.status in ('pending', 'revealed', 'cancelled');
  v_me := jsonb_build_object(
    'on_roster', s.current_round_id is null or sc.id is not null,
    'is_eliminated', coalesce(sc.is_eliminated, false),
    'elimination_reason', sc.elimination_reason);
  if v_settled then
    v_me := v_me || coalesce((
      select jsonb_build_object('rank', r.rank, 'points', r.total_points, 'correct', r.correct_count,
                                'wrong', r.wrong_count, 'unanswered', r.unanswered_count)
      from public._leaderboard_ranked(v_sid) r where r.participant_id = v_pid), '{}'::jsonb);
  end if;

  return jsonb_build_object('ok', true, 'participant', public._participant_public(v_pid),
                            'sessions', v_sessions, 'my_answer', v_answer, 'me', v_me) || v_snap;
end $$;

-- ---------------------------------------------------------------------
-- 8. SUBMIT JAWABAN — satu transaksi atomik
-- ---------------------------------------------------------------------
create or replace function public.submit_answer(
  p_token text, p_competition_question_id uuid,
  p_option_id uuid default null, p_answer_text text default null, p_idempotency_key text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_now timestamptz := clock_timestamp();           -- (7) waktu server, dicatat paling awal
  v_pid uuid; cq competition_questions; r competition_rounds; s competition_sessions; q questions;
  sc scores; pa participant_answers;
  v_correct boolean; v_ms integer; v_points numeric; v_text text := nullif(trim(coalesce(p_answer_text, '')), '');
  v_key text := coalesce(nullif(p_idempotency_key, ''), '');
begin
  -- (1) identitas peserta
  v_pid := public._participant_from_token(p_token);
  if v_pid is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'Sesi login berakhir. Silakan masuk kembali.');
  end if;
  if length(v_key) < 8 or length(v_key) > 80 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST', 'message', 'Permintaan tidak valid');
  end if;
  if not public._rate_limit('submit:' || v_pid::text, 12, 10) then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED', 'message', 'Terlalu banyak permintaan');
  end if;

  -- (2,3) sesi & soal. FOR SHARE: penutupan soal menunggu submit ini; submit setelah penutupan melihat status baru.
  select * into cq from competition_questions where id = p_competition_question_id for share;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Soal tidak ditemukan');
  end if;
  select * into r from competition_rounds where id = cq.round_id;
  select * into s from competition_sessions where id = r.session_id;

  -- (5) jawaban ganda / replay idempoten — dicek lebih dulu agar kirim ulang karena jaringan tetap sukses
  select * into sc from scores where round_id = r.id and participant_id = v_pid for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_PARTICIPANT', 'message', 'Anda tidak terdaftar pada babak ini');
  end if;
  select * into pa from participant_answers where competition_question_id = cq.id and participant_id = v_pid;
  if found then
    if pa.idempotency_key = v_key then
      return jsonb_build_object('ok', true, 'replay', true, 'answered_at', pa.answered_at,
                                'response_time_ms', pa.response_time_ms);
    end if;
    return jsonb_build_object('ok', false, 'code', 'ALREADY_ANSWERED', 'message', 'Jawaban sudah dikirim dan tidak dapat diubah');
  end if;

  if s.status = 'paused' or cq.paused_at is not null then
    return jsonb_build_object('ok', false, 'code', 'PAUSED', 'message', 'Lomba sedang dijeda');
  end if;
  if s.status <> 'running' or s.current_question_id is distinct from cq.id or cq.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'NOT_ACTIVE', 'message', 'Soal sudah ditutup');
  end if;
  -- (4) deadline
  if v_now < cq.started_at then
    return jsonb_build_object('ok', false, 'code', 'NOT_STARTED', 'message', 'Soal belum dimulai');
  end if;
  if v_now > cq.deadline_at then
    return jsonb_build_object('ok', false, 'code', 'DEADLINE_PASSED', 'message', 'Waktu habis. Jawaban tidak diterima.');
  end if;
  if sc.is_eliminated then
    return jsonb_build_object('ok', false, 'code', 'ELIMINATED', 'message', 'Anda sudah tereliminasi pada babak ini');
  end if;

  -- (6) kunci jawaban
  select * into q from questions where id = cq.question_id;
  if q.type = 'short_answer' then
    if v_text is null or length(v_text) > 200 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_ANSWER', 'message', 'Jawaban tidak valid');
    end if;
    p_option_id := null;
    v_correct := exists (
      select 1 from question_options o where o.question_id = q.id and o.is_correct
        and public._normalize_answer(o.option_text, q.case_sensitive, q.ignore_whitespace)
          = public._normalize_answer(v_text, q.case_sensitive, q.ignore_whitespace));
  else
    if p_option_id is null or not (p_option_id = any (cq.option_order)) then
      return jsonb_build_object('ok', false, 'code', 'INVALID_ANSWER', 'message', 'Pilihan jawaban tidak valid');
    end if;
    v_text := null;
    select o.is_correct into v_correct from question_options o where o.id = p_option_id and o.question_id = q.id;
    v_correct := coalesce(v_correct, false);
  end if;

  -- (8) skor
  v_ms := greatest(0, round(extract(epoch from (v_now - cq.started_at)) * 1000))::integer;
  v_points := public.calculate_score(v_correct, r.base_points, r.speed_bonus, r.wrong_penalty,
                                     cq.duration_seconds * 1000,
                                     extract(epoch from (cq.deadline_at - v_now)) * 1000,
                                     r.rounding_mode, r.rounding_decimals);

  -- (9) simpan. UNIQUE (competition_question_id, participant_id) = jaring terakhir.
  begin
    insert into participant_answers (competition_question_id, participant_id, selected_option_id, answer_text,
                                     is_correct, response_time_ms, points, answered_at, idempotency_key)
    values (cq.id, v_pid, p_option_id, v_text, v_correct, v_ms, v_points, v_now, v_key);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_ANSWERED', 'message', 'Jawaban sudah dikirim dan tidak dapat diubah');
  end;

  -- (10) agregasi
  update scores set
    total_points = total_points + v_points,
    correct_count = correct_count + (case when v_correct then 1 else 0 end),
    wrong_count = wrong_count + (case when v_correct then 0 else 1 end),
    correct_response_ms = correct_response_ms + (case when v_correct then v_ms else 0 end),
    total_response_ms = total_response_ms + v_ms, updated_at = v_now
  where id = sc.id;

  if r.mode = 'tiebreak' then
    update leaderboards set tiebreak_points = tiebreak_points + v_points,
           tiebreak_response_ms = tiebreak_response_ms + (case when v_correct then v_ms else 0 end), updated_at = v_now
     where session_id = s.id and participant_id = v_pid;
  else
    update leaderboards set
      total_points = total_points + v_points,
      correct_count = correct_count + (case when v_correct then 1 else 0 end),
      wrong_count = wrong_count + (case when v_correct then 0 else 1 end),
      correct_response_ms = correct_response_ms + (case when v_correct then v_ms else 0 end),
      total_response_ms = total_response_ms + v_ms, updated_at = v_now
    where session_id = s.id and participant_id = v_pid;
  end if;

  perform public._notify(s.id, 'progress', jsonb_build_object(
    'cq', cq.id,
    'answered', (select count(*) from participant_answers x where x.competition_question_id = cq.id)));

  -- Benar/salah TIDAK dikembalikan: hasil baru terlihat setelah operator membuka jawaban.
  return jsonb_build_object('ok', true, 'replay', false, 'answered_at', v_now, 'response_time_ms', v_ms);
end $$;

-- ---------------------------------------------------------------------
-- 9. KONTROL OPERATOR — setiap aksi memvalidasi izin & status pertandingan
-- ---------------------------------------------------------------------
create or replace function public._lock_session(p_session_id uuid) returns competition_sessions
language plpgsql security definer set search_path = public as $$
declare s competition_sessions;
begin
  select * into s from competition_sessions where id = p_session_id for update;
  if not found then raise exception 'Sesi tidak ditemukan'; end if;
  perform public._require(public.has_event_permission(s.event_id, 'control'), 'Anda tidak memiliki izin mengontrol pertandingan ini');
  return s;
end $$;

create or replace function public.open_session(p_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s competition_sessions := public._lock_session(p_session_id);
begin
  if s.status <> 'draft' then raise exception 'Sesi sudah dibuka (status: %)', s.status; end if;
  if not exists (select 1 from session_participants where session_id = s.id) then
    raise exception 'Tambahkan peserta ke sesi terlebih dahulu';
  end if;
  if not exists (select 1 from competition_rounds where session_id = s.id) then
    raise exception 'Buat minimal satu babak terlebih dahulu';
  end if;
  update competition_sessions set status = 'open', opened_at = now(), display_screen = 'waiting' where id = s.id;
  perform public._rebuild_leaderboard(s.id);
  perform public._audit('open_session', 'competition_sessions', s.id, s.event_id);
  perform public._notify(s.id, 'state', jsonb_build_object('reason', 'open'));
end $$;

-- Tetapkan roster babak secara manual (finalis pilihan operator) — tercatat di audit log.
create or replace function public.set_round_roster(p_round_id uuid, p_participant_ids uuid[], p_reason text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare r competition_rounds; s competition_sessions; v_n int;
begin
  select * into r from competition_rounds where id = p_round_id;
  if not found then raise exception 'Babak tidak ditemukan'; end if;
  s := public._lock_session(r.session_id);
  if r.status <> 'pending' then raise exception 'Roster hanya dapat diubah sebelum babak dimulai'; end if;
  if coalesce(array_length(p_participant_ids, 1), 0) = 0 then raise exception 'Pilih minimal satu peserta'; end if;
  if exists (select 1 from unnest(p_participant_ids) u(id)
             where not exists (select 1 from session_participants sp where sp.session_id = s.id and sp.participant_id = u.id)) then
    raise exception 'Ada peserta yang bukan anggota sesi ini';
  end if;
  delete from scores where round_id = r.id;
  insert into scores (round_id, participant_id) select r.id, u.id from (select distinct unnest(p_participant_ids) as id) u;
  get diagnostics v_n = row_count;
  update competition_rounds set participant_scope = 'manual' where id = r.id;
  perform public._audit('set_round_roster', 'competition_rounds', r.id, s.event_id, jsonb_build_object(
    'babak', r.name, 'alasan', p_reason,
    'peserta', (select jsonb_agg(p.full_name order by p.full_name) from participants p where p.id = any (p_participant_ids))));
  return v_n;
end $$;

create or replace function public.start_round(p_round_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r competition_rounds; s competition_sessions; v_prev uuid; v_n int;
begin
  select * into r from competition_rounds where id = p_round_id;
  if not found then raise exception 'Babak tidak ditemukan'; end if;
  s := public._lock_session(r.session_id);
  if s.status not in ('open', 'running') then raise exception 'Sesi harus dibuka terlebih dahulu (status: %)', s.status; end if;
  if r.status <> 'pending' then raise exception 'Babak sudah dimulai atau selesai'; end if;
  if exists (select 1 from competition_rounds where session_id = s.id and status = 'active') then
    raise exception 'Akhiri babak yang sedang berjalan terlebih dahulu';
  end if;
  if not exists (select 1 from competition_questions where round_id = r.id and status = 'pending') then
    raise exception 'Babak belum memiliki soal';
  end if;

  perform public._rebuild_leaderboard(s.id);

  if r.participant_scope <> 'manual' then
    delete from scores where round_id = r.id;
    if r.participant_scope = 'top_n' then
      insert into scores (round_id, participant_id)
      select r.id, x.participant_id from public._leaderboard_ranked(s.id) x where x.rank <= r.top_n;
    else
      if r.participant_scope = 'survivors' then
        select id into v_prev from competition_rounds
         where session_id = s.id and status = 'finished' and mode <> 'tiebreak' order by sequence desc limit 1;
      end if;
      insert into scores (round_id, participant_id)
      select r.id, sp.participant_id
      from session_participants sp
      join event_participants ep on ep.event_id = s.event_id and ep.participant_id = sp.participant_id
      where sp.session_id = s.id and ep.participation_status in ('registered', 'active')
        and (v_prev is null or exists (select 1 from scores ps
                                       where ps.round_id = v_prev and ps.participant_id = sp.participant_id
                                         and not ps.is_eliminated));
    end if;
  end if;
  select count(*) into v_n from scores where round_id = r.id;
  if v_n = 0 then raise exception 'Tidak ada peserta yang memenuhi syarat untuk babak ini'; end if;

  update competition_rounds set status = 'active', started_at = now() where id = r.id;
  update competition_sessions set status = 'running', started_at = coalesce(started_at, now()),
         current_round_id = r.id, current_question_id = null, display_screen = 'waiting'
   where id = s.id;
  perform public._rebuild_leaderboard(s.id);
  perform public._audit('start_round', 'competition_rounds', r.id, s.event_id,
                        jsonb_build_object('babak', r.name, 'mode', r.mode, 'jumlah_peserta', v_n, 'cakupan', r.participant_scope));
  perform public._notify(s.id, 'state', jsonb_build_object('reason', 'round_started'));
end $$;

create or replace function public.next_question(p_session_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare s competition_sessions := public._lock_session(p_session_id);
        r competition_rounds; cur competition_questions; nxt competition_questions; v_start timestamptz;
begin
  if s.status <> 'running' then raise exception 'Lomba tidak sedang berjalan (status: %)', s.status; end if;
  select * into r from competition_rounds where id = s.current_round_id and status = 'active';
  if not found then raise exception 'Mulai babak terlebih dahulu'; end if;
  if s.current_question_id is not null then
    select * into cur from competition_questions where id = s.current_question_id;
    if cur.status = 'active' then raise exception 'Soal nomor % masih berjalan. Tutup dulu.', cur.sequence; end if;
  end if;
  select * into nxt from competition_questions
   where round_id = r.id and status = 'pending' order by sequence limit 1 for update;
  if not found then raise exception 'Semua soal pada babak ini sudah ditayangkan'; end if;

  v_start := clock_timestamp() + make_interval(secs => r.lead_seconds);
  update competition_questions set status = 'active', started_at = v_start,
         deadline_at = v_start + make_interval(secs => nxt.duration_seconds), paused_at = null
   where id = nxt.id;
  update competition_sessions set current_question_id = nxt.id, display_screen = 'question' where id = s.id;
  perform public._audit('show_question', 'competition_questions', nxt.id, s.event_id, jsonb_build_object('nomor', nxt.sequence));
  perform public._notify(s.id, 'state', jsonb_build_object('reason', 'question', 'starts_at', v_start));
  return nxt.id;
end $$;

create or replace function public.close_question(p_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s competition_sessions := public._lock_session(p_session_id);
begin
  if s.current_question_id is null or not public._close_question(s.current_question_id) then
    raise exception 'Tidak ada soal yang sedang berjalan';
  end if;
  perform public._audit('close_question', 'competition_questions', s.current_question_id, s.event_id);
end $$;

create or replace function public.reveal_answer(p_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s competition_sessions := public._lock_session(p_session_id); cq competition_questions;
begin
  select * into cq from competition_questions where id = s.current_question_id;
  if not found then raise exception 'Belum ada soal yang ditayangkan'; end if;
  if cq.status = 'active' then
    if clock_timestamp() <= cq.deadline_at then raise exception 'Soal masih berjalan. Tutup soal terlebih dahulu.'; end if;
    perform public._close_question(cq.id);
  elsif cq.status <> 'closed' then
    raise exception 'Jawaban sudah dibuka atau soal dibatalkan';
  end if;
  update competition_questions set status = 'revealed', revealed_at = now() where id = cq.id;
  update competition_sessions set display_screen = 'result' where id = s.id;
  perform public._audit('reveal_answer', 'competition_questions', cq.id, s.event_id, jsonb_build_object('nomor', cq.sequence));
  perform public._notify(s.id, 'state', jsonb_build_object('reason', 'revealed'));
end $$;

create or replace function public.cancel_question(p_session_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare s competition_sessions := public._lock_session(p_session_id); cq competition_questions;
begin
  update competition_questions set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason, paused_at = null
   where id = s.current_question_id and status in ('active', 'closed', 'revealed') returning * into cq;
  if not found then raise exception 'Tidak ada soal yang dapat dibatalkan'; end if;
  -- Peserta yang tereliminasi otomatis karena soal ini dikembalikan.
  update scores set is_eliminated = false, eliminated_at = null, eliminated_at_sequence = null,
         elimination_auto = null, elimination_reason = null
   where round_id = cq.round_id and is_eliminated and elimination_auto and eliminated_at_sequence = cq.sequence;
  perform public._recompute_round(cq.round_id);
  perform public._rebuild_leaderboard(s.id);
  update competition_sessions set display_screen = 'waiting' where id = s.id;
  perform public._audit('cancel_question', 'competition_questions', cq.id, s.event_id,
                        jsonb_build_object('nomor', cq.sequence, 'alasan', p_reason));
  perform public._notify(s.id, 'state', jsonb_build_object('reason', 'cancelled'));
end $$;

create or replace function public.set_display(p_session_id uuid, p_screen text) returns void
language plpgsql security definer set search_path = public as $$
declare s competition_sessions := public._lock_session(p_session_id); v_status text;
begin
  if p_screen not in ('waiting', 'question', 'result', 'leaderboard') then raise exception 'Tampilan tidak dikenal'; end if;
  if s.status in ('draft', 'cancelled') then raise exception 'Sesi belum dibuka'; end if;
  select status into v_status from competition_questions where id = s.current_question_id;
  if v_status = 'active' and p_screen <> 'question' then
    raise exception 'Tampilan tidak dapat diganti selama soal berjalan';
  end if;
  if p_screen = 'result' and v_status is distinct from 'revealed' then raise exception 'Jawaban belum dibuka'; end if;
  if p_screen = 'question' and v_status is null then raise exception 'Belum ada soal'; end if;
  if v_status = 'closed' and p_screen = 'question' then p_screen := 'processing'; end if;
  update competition_sessions set display_screen = p_screen where id = s.id;
  perform public._notify(s.id, 'state', jsonb_build_object('reason', 'display'));
end $$;

create or replace function public.pause_session(p_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s competition_sessions := public._lock_session(p_session_id);
begin
  if s.status <> 'running' then raise exception 'Hanya lomba yang sedang berjalan yang dapat dijeda'; end if;
  update competition_questions set paused_at = clock_timestamp()
   where id = s.current_question_id and status = 'active';
  update competition_sessions set status = 'paused', paused_at = clock_timestamp() where id = s.id;
  perform public._audit('pause_session', 'competition_sessions', s.id, s.event_id);
  perform public._notify(s.id, 'state', jsonb_build_object('reason', 'paused'));
end $$;

create or replace function public.resume_session(p_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s competition_sessions := public._lock_session(p_session_id); v_now timestamptz := clock_timestamp();
begin
  if s.status <> 'paused' then raise exception 'Lomba tidak sedang dijeda'; end if;
  -- Waktu jeda tidak mengurangi waktu menjawab: started_at & deadline_at digeser sebesar lama jeda.
  update competition_questions set
    started_at = started_at + (v_now - paused_at), deadline_at = deadline_at + (v_now - paused_at), paused_at = null
  where id = s.current_question_id and status = 'active' and paused_at is not null;
  update competition_sessions set status = 'running', paused_at = null where id = s.id;
  perform public._audit('resume_session', 'competition_sessions', s.id, s.event_id);
  perform public._notify(s.id, 'state', jsonb_build_object('reason', 'resumed'));
end $$;

create or replace function public.end_round(p_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s competition_sessions := public._lock_session(p_session_id); r competition_rounds;
begin
  select * into r from competition_rounds where id = s.current_round_id and status = 'active';
  if not found then raise exception 'Tidak ada babak yang sedang berjalan'; end if;
  if exists (select 1 from competition_questions where id = s.current_question_id and status = 'active') then
    raise exception 'Tutup soal yang sedang berjalan terlebih dahulu';
  end if;
  update competition_rounds set status = 'finished', finished_at = now() where id = r.id;
  perform public._recompute_round(r.id);
  perform public._rebuild_leaderboard(s.id);
  update competition_sessions set current_question_id = null, display_screen = 'leaderboard',
         status = case when status = 'paused' then 'running' else status end, paused_at = null
   where id = s.id;
  perform public._audit('end_round', 'competition_rounds', r.id, s.event_id, jsonb_build_object('babak', r.name));
  perform public._notify(s.id, 'state', jsonb_build_object('reason', 'round_ended'));
end $$;

create or replace function public.eliminate_participant(p_session_id uuid, p_participant_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare s competition_sessions := public._lock_session(p_session_id); r competition_rounds; v_seq int;
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Alasan eliminasi wajib diisi'; end if;
  select * into r from competition_rounds where id = s.current_round_id and status = 'active';
  if not found then raise exception 'Tidak ada babak yang sedang berjalan'; end if;
  select coalesce(max(sequence), 0) into v_seq from competition_questions
   where round_id = r.id and status in ('active', 'closed', 'revealed');
  update scores set is_eliminated = true, eliminated_at = now(), eliminated_at_sequence = v_seq,
         elimination_auto = false, elimination_reason = trim(p_reason)
   where round_id = r.id and participant_id = p_participant_id and not is_eliminated;
  if not found then raise exception 'Peserta tidak ada pada babak ini atau sudah tereliminasi'; end if;
  update leaderboards set is_eliminated = true where session_id = s.id and participant_id = p_participant_id;
  perform public._audit('eliminate_participant', 'participants', p_participant_id, s.event_id,
    jsonb_build_object('babak', r.name, 'alasan', trim(p_reason),
                       'peserta', (select full_name from participants where id = p_participant_id)));
  perform public._notify(s.id, 'state', jsonb_build_object('reason', 'elimination'));
end $$;

create or replace function public.reinstate_participant(p_session_id uuid, p_participant_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare s competition_sessions := public._lock_session(p_session_id); r competition_rounds;
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Alasan wajib diisi'; end if;
  select * into r from competition_rounds where id = s.current_round_id and status = 'active';
  if not found then raise exception 'Tidak ada babak yang sedang berjalan'; end if;
  update scores set is_eliminated = false, eliminated_at = null, eliminated_at_sequence = null,
         elimination_auto = null, elimination_reason = null
   where round_id = r.id and participant_id = p_participant_id and is_eliminated;
  if not found then raise exception 'Peserta tidak dalam status tereliminasi'; end if;
  update leaderboards set is_eliminated = false where session_id = s.id and participant_id = p_participant_id;
  perform public._audit('reinstate_participant', 'participants', p_participant_id, s.event_id,
    jsonb_build_object('babak', r.name, 'alasan', trim(p_reason),
                       'peserta', (select full_name from participants where id = p_participant_id)));
  perform public._notify(s.id, 'state', jsonb_build_object('reason', 'elimination'));
end $$;

-- Soal tambahan untuk peserta yang seri.
create or replace function public.create_tiebreak_round(
  p_session_id uuid, p_participant_ids uuid[], p_question_ids uuid[], p_name text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare s competition_sessions := public._lock_session(p_session_id); v_round uuid; v_seq int; v_qid uuid; v_i int := 0;
begin
  if s.status not in ('open', 'running') then raise exception 'Sesi tidak aktif'; end if;
  if exists (select 1 from competition_rounds where session_id = s.id and status = 'active') then
    raise exception 'Akhiri babak yang sedang berjalan terlebih dahulu';
  end if;
  if coalesce(array_length(p_participant_ids, 1), 0) < 2 then raise exception 'Pilih minimal dua peserta yang seri'; end if;
  if coalesce(array_length(p_question_ids, 1), 0) < 1 then raise exception 'Pilih minimal satu soal tambahan'; end if;
  select coalesce(max(sequence), 0) + 1 into v_seq from competition_rounds where session_id = s.id;
  insert into competition_rounds (session_id, sequence, name, mode, participant_scope)
  values (s.id, v_seq, coalesce(nullif(trim(p_name), ''), 'Soal Tambahan (Tie Breaker)'), 'tiebreak', 'manual')
  returning id into v_round;
  insert into scores (round_id, participant_id)
  select v_round, sp.participant_id from session_participants sp
   where sp.session_id = s.id and sp.participant_id = any (p_participant_ids);
  foreach v_qid in array p_question_ids loop
    v_i := v_i + 1;
    insert into competition_questions (round_id, question_id, sequence) values (v_round, v_qid, v_i);
  end loop;
  perform public._audit('create_tiebreak', 'competition_rounds', v_round, s.event_id, jsonb_build_object(
    'peserta', (select jsonb_agg(full_name) from participants where id = any (p_participant_ids)),
    'jumlah_soal', v_i));
  return v_round;
end $$;

create or replace function public.announce_winners(p_session_id uuid, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s competition_sessions := public._lock_session(p_session_id); v_winners jsonb;
begin
  if s.status not in ('running', 'paused', 'finished') then raise exception 'Lomba belum berjalan'; end if;
  if exists (select 1 from competition_rounds where session_id = s.id and status = 'active') then
    raise exception 'Akhiri babak yang sedang berjalan terlebih dahulu';
  end if;
  if not exists (select 1 from competition_rounds where session_id = s.id and status = 'finished') then
    raise exception 'Belum ada babak yang selesai';
  end if;
  perform public._rebuild_leaderboard(s.id);
  if not p_force and exists (select 1 from public._leaderboard_ranked(s.id) x where x.rank <= 3 and x.tied) then
    raise exception 'SERI: masih ada nilai seri pada tiga besar. Jalankan soal tambahan terlebih dahulu.';
  end if;
  update competition_sessions set status = 'finished', finished_at = coalesce(finished_at, now()),
         winners_announced_at = now(), results_published = true, display_screen = 'podium',
         current_question_id = null, paused_at = null
   where id = s.id;
  v_winners := public._leaderboard_json(s.id, 3);
  insert into announcements (event_id, session_id, type, title, body, is_published, created_by)
  values (s.event_id, s.id, 'winner', 'Pemenang ' || s.name,
          (select string_agg(format('Juara %s: %s (%s) — %s poin', w ->> 'rank', w ->> 'name', w ->> 'school', w ->> 'points'),
                             E'\n' order by (w ->> 'rank')::int) from jsonb_array_elements(v_winners) w),
          true, auth.uid());
  perform public._audit('announce_winners', 'competition_sessions', s.id, s.event_id,
                        jsonb_build_object('pemenang', v_winners, 'paksa', p_force));
  perform public._notify(s.id, 'state', jsonb_build_object('reason', 'winners'));
  return v_winners;
end $$;

create or replace function public.set_results_published(p_session_id uuid, p_published boolean) returns void
language plpgsql security definer set search_path = public as $$
declare s competition_sessions := public._lock_session(p_session_id);
begin
  update competition_sessions set results_published = p_published where id = s.id;
  perform public._audit('set_results_published', 'competition_sessions', s.id, s.event_id, jsonb_build_object('publik', p_published));
  perform public._notify(s.id, 'state', jsonb_build_object('reason', 'published'));
end $$;

create or replace function public.cancel_session(p_session_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare s competition_sessions := public._lock_session(p_session_id);
begin
  if s.status = 'finished' then raise exception 'Sesi yang sudah selesai tidak dapat dibatalkan'; end if;
  update competition_sessions set status = 'cancelled', finished_at = now() where id = s.id;
  perform public._audit('cancel_session', 'competition_sessions', s.id, s.event_id, jsonb_build_object('alasan', p_reason));
  perform public._notify(s.id, 'state', jsonb_build_object('reason', 'cancelled'));
end $$;

-- ---------------------------------------------------------------------
-- 10. PANEL OPERATOR & LAPORAN
-- ---------------------------------------------------------------------
create or replace function public.admin_get_control_state(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s competition_sessions; v_cur jsonb;
begin
  select * into s from competition_sessions where id = p_session_id;
  if not found then raise exception 'Sesi tidak ditemukan'; end if;
  perform public._require(public.can_access_event(s.event_id));
  perform public._auto_close(s.id);
  select * into s from competition_sessions where id = p_session_id;
  if s.current_question_id is not null then
    v_cur := public._question_payload(s.current_question_id, true);
  end if;
  return public._session_snapshot(s.id, true, 1000)
    || jsonb_build_object(
      'can_control', public.has_event_permission(s.event_id, 'control'),
      'current', v_cur,
      'rounds', coalesce((
        select jsonb_agg(to_jsonb(r) || jsonb_build_object(
          'roster', (select count(*) from scores sc where sc.round_id = r.id),
          'questions', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', cq.id, 'question_id', cq.question_id, 'sequence', cq.sequence, 'status', cq.status,
              'duration_seconds', cq.duration_seconds, 'text', q.question_text, 'type', q.type,
              'answered', (select count(*) from participant_answers pa where pa.competition_question_id = cq.id),
              'correct', (select count(*) from participant_answers pa where pa.competition_question_id = cq.id and pa.is_correct))
              order by cq.sequence)
            from competition_questions cq join questions q on q.id = cq.question_id
            where cq.round_id = r.id), '[]'::jsonb)) order by r.sequence)
        from competition_rounds r where r.session_id = s.id), '[]'::jsonb));
end $$;

-- Laporan hasil. p_round_id NULL = klasemen sesi; terisi = hasil satu babak.
create or replace function public.admin_get_session_report(p_session_id uuid, p_round_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s competition_sessions; v_rows jsonb;
begin
  select * into s from competition_sessions where id = p_session_id;
  if not found then raise exception 'Sesi tidak ditemukan'; end if;
  perform public._require(public.has_event_permission(s.event_id, 'reports'));

  if p_round_id is null then
    v_rows := public._leaderboard_json(s.id, null);
  else
    select coalesce(jsonb_agg(x.row order by x.rnk), '[]'::jsonb) into v_rows from (
      select row_number() over (order by sc.is_eliminated, sc.total_points desc, sc.correct_count desc,
                                         sc.correct_response_ms, p.participant_number) as rnk,
             jsonb_build_object(
               'rank', row_number() over (order by sc.is_eliminated, sc.total_points desc, sc.correct_count desc,
                                                   sc.correct_response_ms, p.participant_number),
               'participant_id', p.id, 'number', p.participant_number, 'name', p.full_name, 'school', p.school,
               'district', d.name, 'photo_url', p.photo_url, 'points', sc.total_points, 'correct', sc.correct_count,
               'wrong', sc.wrong_count, 'unanswered', sc.unanswered_count, 'correct_ms', sc.correct_response_ms,
               'total_ms', sc.total_response_ms,
               'avg_ms', case when sc.correct_count > 0 then round(sc.correct_response_ms::numeric / sc.correct_count) end,
               'is_eliminated', sc.is_eliminated, 'elimination_reason', sc.elimination_reason,
               'is_finalist', false, 'tiebreak_points', 0, 'tiebreak_ms', 0, 'tied', false) as row
      from scores sc
      join participants p on p.id = sc.participant_id
      join districts d on d.id = p.district_id
      where sc.round_id = p_round_id) x;
  end if;

  return jsonb_build_object(
    'session', jsonb_build_object('id', s.id, 'name', s.name, 'code', s.code, 'status', s.status,
      'finished_at', s.finished_at, 'results_published', s.results_published,
      'event_id', s.event_id, 'event_name', (select name from events where id = s.event_id),
      'organizer', (select organizer from events where id = s.event_id),
      'location', (select location from events where id = s.event_id),
      'level', (select name from education_levels where id = s.education_level_id)),
    'rounds', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'mode', r.mode,
                                                            'sequence', r.sequence, 'status', r.status) order by r.sequence)
                        from competition_rounds r where r.session_id = s.id), '[]'::jsonb),
    'rows', v_rows);
end $$;

-- Riwayat jawaban per soal.
create or replace function public.admin_get_answer_history(p_session_id uuid, p_round_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s competition_sessions;
begin
  select * into s from competition_sessions where id = p_session_id;
  if not found then raise exception 'Sesi tidak ditemukan'; end if;
  perform public._require(public.has_event_permission(s.event_id, 'reports'));
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'round', r.name, 'round_sequence', r.sequence, 'sequence', cq.sequence, 'question_status', cq.status,
      'question', q.question_text, 'participant_id', p.id, 'number', p.participant_number, 'name', p.full_name,
      'school', p.school, 'district', d.name,
      'answer', coalesce(o.option_text, pa.answer_text), 'is_correct', pa.is_correct,
      'response_time_ms', pa.response_time_ms, 'points', pa.points, 'answered_at', pa.answered_at)
      order by r.sequence, cq.sequence, pa.response_time_ms)
    from participant_answers pa
    join competition_questions cq on cq.id = pa.competition_question_id
    join competition_rounds r on r.id = cq.round_id
    join questions q on q.id = cq.question_id
    join participants p on p.id = pa.participant_id
    join districts d on d.id = p.district_id
    left join question_options o on o.id = pa.selected_option_id
    where r.session_id = s.id and (p_round_id is null or r.id = p_round_id)), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- 11. DATA PUBLIK (landing page & hasil)
-- ---------------------------------------------------------------------
create or replace function public.get_public_results(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s competition_sessions;
begin
  select * into s from competition_sessions where code = upper(trim(coalesce(p_code, ''))) and status <> 'cancelled';
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Sesi tidak ditemukan'); end if;
  if not s.results_published then
    return jsonb_build_object('ok', false, 'code', 'NOT_PUBLISHED', 'message', 'Hasil belum diumumkan');
  end if;
  return jsonb_build_object('ok', true,
    'session', jsonb_build_object('code', s.code, 'name', s.name, 'finished_at', s.finished_at,
      'event_name', (select name from events where id = s.event_id),
      'organizer', (select organizer from events where id = s.event_id),
      'level', (select name from education_levels where id = s.education_level_id)),
    'rows', public._leaderboard_json(s.id, null));
end $$;

create or replace function public.get_landing_data() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'app', coalesce((select jsonb_object_agg(key, value) from app_settings where is_public), '{}'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'name', e.name, 'description', e.description, 'location', e.location,
        'organizer', e.organizer, 'logo_url', e.logo_url, 'start_date', e.start_date, 'end_date', e.end_date,
        'status', e.status,
        'participants', (select count(*) from event_participants ep where ep.event_id = e.id),
        'sessions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'code', s.code, 'name', s.name, 'status', s.status, 'scheduled_at', s.scheduled_at,
            'level', (select name from education_levels where id = s.education_level_id),
            'results_published', s.results_published,
            'winners', case when s.results_published then public._leaderboard_json(s.id, 3) end)
            order by s.scheduled_at nulls last, s.created_at)
          from competition_sessions s where s.event_id = e.id and s.status not in ('draft', 'cancelled')), '[]'::jsonb))
        order by e.start_date desc nulls last)
      from events e where e.is_public and e.status <> 'archived'), '[]'::jsonb),
    'announcements', coalesce((
      select jsonb_agg(x.a) from (
        select jsonb_build_object('id', a.id, 'type', a.type, 'title', a.title, 'body', a.body,
                                  'scheduled_at', a.scheduled_at, 'created_at', a.created_at) as a
        from announcements a join events e on e.id = a.event_id
        where a.is_published and e.is_public
        order by a.created_at desc limit 12) x), '[]'::jsonb))
$$;

-- ---------------------------------------------------------------------
-- 12. HAK EKSEKUSI & REALTIME
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

-- publik (anon) — hanya RPC berikut yang terbuka tanpa login admin
grant execute on function
  public.participant_login(text, text), public.participant_logout(text),
  public.participant_get_state(text, text), public.submit_answer(text, uuid, uuid, text, text),
  public.get_live_state(text, integer), public.get_public_results(text), public.get_landing_data()
to anon, authenticated;

grant execute on function
  public._is_api_role(), public.current_role_key(), public.is_active_admin(), public.is_superadmin(),
  public.can_access_event(uuid), public.has_event_permission(uuid, text),
  public.session_event_id(uuid), public.round_event_id(uuid), public.question_event_id(uuid),
  public.package_event_id(uuid), public.participant_visible(uuid),
  public.admin_set_profile(uuid, text, boolean, text),
  public.admin_save_participant(uuid, jsonb), public.admin_import_participants(uuid, jsonb),
  public.admin_reset_pins(uuid, uuid[]), public.admin_delete_participant(uuid, uuid),
  public.admin_save_question(jsonb), public.admin_import_questions(uuid, jsonb),
  public.admin_add_questions_to_round(uuid, uuid[], boolean), public.admin_dashboard_stats(),
  public._random_code(integer),
  public.calculate_score(boolean, numeric, numeric, numeric, numeric, numeric, text, integer),
  public.open_session(uuid), public.set_round_roster(uuid, uuid[], text), public.start_round(uuid),
  public.next_question(uuid), public.close_question(uuid), public.reveal_answer(uuid),
  public.cancel_question(uuid, text), public.set_display(uuid, text),
  public.pause_session(uuid), public.resume_session(uuid), public.end_round(uuid),
  public.eliminate_participant(uuid, uuid, text), public.reinstate_participant(uuid, uuid, text),
  public.create_tiebreak_round(uuid, uuid[], uuid[], text), public.announce_winners(uuid, boolean),
  public.set_results_published(uuid, boolean), public.cancel_session(uuid, text),
  public.admin_get_control_state(uuid), public.admin_get_session_report(uuid, uuid),
  public.admin_get_answer_history(uuid, uuid)
to authenticated;

-- Fungsi yang dibuat setelah migrasi ini tidak otomatis terbuka untuk publik.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Postgres Changes (opsional, untuk dashboard admin). Sinyal utama memakai Broadcast.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.competition_sessions; exception when others then null; end;
    begin alter publication supabase_realtime add table public.leaderboards; exception when others then null; end;
  end if;
end $$;
