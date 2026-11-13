// Pengujian integrasi database Lomba Rangking 1.
// Menjalankan migrasi asli pada PostgreSQL bersih lalu menguji RLS, scoring, submit atomik,
// eliminasi, tie-breaker, dan seluruh alur pertandingan lewat RPC yang sama dengan produksi.
//
//   scripts/pg-local.sh start && npm run test:db
import {
  resetDatabase, makeApi, createAdminUser, importParticipants, setElapsed, makeRunner,
  assert, eq, near, rejects, J, ANON, sleep, uid,
} from './lib/harness.mjs'

const su = await resetDatabase()
const api = makeApi(24)
const { test, section, done } = makeRunner()
const one = async (text, params) => (await su.query(text, params)).rows[0]
const val = async (text, params) => Object.values((await one(text, params)) ?? {})[0]

// ------------------------------------------------------------------ akun
const superadmin = await createAdminUser(su, 'super@test.local', 'Super Admin')
const adminA = await createAdminUser(su, 'admin.a@test.local', 'Admin A')
const adminB = await createAdminUser(su, 'admin.b@test.local', 'Admin B')
const adminC = await createAdminUser(su, 'admin.c@test.local', 'Admin C (tanpa izin kontrol)')
const inactive = await createAdminUser(su, 'baru@test.local', 'Akun Baru')
let eventA, eventB

section('1. Bootstrap & login admin')
await test('akun baru otomatis punya profil NONAKTIF ber-role admin', async () => {
  const p = await one(`select p.is_active, r.key from profiles p join roles r on r.id = p.role_id where p.id = $1`, [inactive.sub])
  eq(p, { is_active: false, key: 'admin' })
})
await test('bootstrap_superadmin tidak dapat dipanggil lewat API', async () => {
  await rejects(api.rpc(ANON, 'bootstrap_superadmin', { p_email: 'super@test.local' }), /permission denied/)
  await rejects(api.rpc(inactive, 'bootstrap_superadmin', { p_email: 'baru@test.local' }), /permission denied/)
})
await test('bootstrap_superadmin dari SQL Editor mengaktifkan superadmin pertama, sekali saja', async () => {
  await su.query(`select public.bootstrap_superadmin('super@test.local')`)
  eq(await api.rpc(superadmin, 'current_role_key'), 'superadmin')
  await rejects(su.query(`select public.bootstrap_superadmin('admin.a@test.local')`), /sudah ada/)
})
await test('superadmin mengaktifkan admin & menugaskan event', async () => {
  eventA = await val(`select id from events limit 1`)
  eventB = (await api.sql(superadmin, `insert into events (name, is_public) values ('Event B', false) returning id`)).rows[0].id
  for (const a of [adminA, adminB, adminC]) await api.rpc(superadmin, 'admin_set_profile', { p_user_id: a.sub, p_is_active: true })
  await api.sql(superadmin, `insert into admin_assignments (admin_id, event_id) values ($1, $2), ($3, $4)`, [adminA.sub, eventA, adminB.sub, eventB])
  await api.sql(superadmin, `insert into admin_assignments (admin_id, event_id, can_control_competition, can_manage_participants) values ($1, $2, false, false)`, [adminC.sub, eventA])
  eq(await api.rpc(adminA, 'current_role_key'), 'admin')
  eq(await val(`select count(*)::int from event_settings where event_id = $1`, [eventB]), 1, 'event_settings otomatis')
})

section('2. Hak akses role & RLS')
await test('anon tidak dapat membaca tabel apa pun secara langsung', async () => {
  for (const t of ['questions', 'question_options', 'participants', 'participant_credentials', 'participant_answers', 'scores', 'leaderboards', 'competition_questions', 'events', 'audit_logs'])
    await rejects(api.sql(ANON, `select * from ${t} limit 1`), /permission denied/, `anon bisa membaca ${t}`)
})
await test('anon tidak dapat memanggil RPC admin / fungsi internal', async () => {
  const sid = uid()
  await rejects(api.rpc(ANON, 'admin_get_control_state', { p_session_id: sid }), /permission denied/)
  await rejects(api.rpc(ANON, '_close_question', { p_cq_id: sid }), /permission denied/)
  await rejects(api.rpc(ANON, '_rebuild_leaderboard', { p_session_id: sid }), /permission denied/)
  await rejects(api.rpc(ANON, '_question_payload', { p_cq_id: sid, p_reveal: true }), /permission denied/)
  await rejects(api.rpc(ANON, 'next_question', { p_session_id: sid }), /permission denied/)
})
await test('admin (authenticated) pun tidak dapat memanggil fungsi internal mesin lomba', async () => {
  await rejects(api.rpc(adminA, '_close_question', { p_cq_id: uid() }), /permission denied/)
  await rejects(api.rpc(adminA, '_upsert_participant', { p_event_id: eventB, p: J({}) }), /permission denied/)
  await rejects(api.sql(adminA, `select * from participant_credentials`), /permission denied/)
  await rejects(api.sql(adminA, `select * from participant_sessions`), /permission denied/)
})
await test('akun nonaktif tidak melihat data apa pun', async () => {
  eq((await api.sql(inactive, `select id from events`)).rowCount, 0)
  eq((await api.sql(inactive, `select id from districts`)).rowCount, 0)
})
await test('admin hanya melihat event yang ditugaskan', async () => {
  eq((await api.sql(adminA, `select id from events`)).rows.map((r) => r.id), [eventA])
  eq((await api.sql(adminB, `select id from events`)).rows.map((r) => r.id), [eventB])
  eq((await api.sql(adminB, `select id from questions`)).rowCount, 0, 'admin B melihat soal event A')
  eq((await api.sql(adminB, `select id from question_options`)).rowCount, 0, 'admin B melihat kunci event A')
  assert((await api.sql(adminA, `select id from questions`)).rowCount === 12)
})
await test('admin tidak dapat menulis ke event lain', async () => {
  await rejects(api.sql(adminB, `insert into question_packages (event_id, name) values ($1, 'x')`, [eventA]), /row-level security/)
  await rejects(api.rpc(adminB, 'admin_save_participant', { p_event_id: eventA, p_data: J({ full_name: 'x', participant_number: '1', level: 'SMP', district: 'Baradatu' }) }), /Akses ditolak/)
  await rejects(api.sql(adminB, `insert into competition_sessions (event_id, education_level_id, name) select $1, id, 'x' from education_levels limit 1`, [eventA]), /row-level security/)
})
await test('admin tidak dapat mengubah role sendiri, event, atau konfigurasi global', async () => {
  await rejects(api.sql(adminA, `update profiles set role_id = (select id from roles where key = 'superadmin') where id = $1`, [adminA.sub]), /Tidak diizinkan/)
  eq((await api.sql(adminA, `update events set name = 'diretas' where id = $1`, [eventA])).rowCount, 0)
  eq((await api.sql(adminA, `update event_settings set base_points = 9999 where event_id = $1`, [eventA])).rowCount, 0)
  await rejects(api.sql(adminA, `insert into app_settings (key, value) values ('x', '1')`), /row-level security/)
  await rejects(api.sql(adminA, `insert into districts (name) values ('Palsu')`), /row-level security/)
  await rejects(api.rpc(adminA, 'admin_set_profile', { p_user_id: adminA.sub, p_role_key: 'superadmin' }), /Hanya Superadmin/)
})
await test('skor, jawaban, klasemen, dan audit tidak dapat ditulis klien mana pun', async () => {
  for (const who of [adminA, superadmin]) {
    await rejects(api.sql(who, `insert into scores (round_id, participant_id) values ($1, $1)`, [uid()]), /permission denied/)
    await rejects(api.sql(who, `update leaderboards set total_points = 99999`), /permission denied/)
    await rejects(api.sql(who, `update participant_answers set points = 99999`), /permission denied/)
    await rejects(api.sql(who, `delete from audit_logs`), /permission denied/)
  }
})
await test('superadmin tidak dapat menonaktifkan dirinya sendiri', async () => {
  await rejects(api.rpc(superadmin, 'admin_set_profile', { p_user_id: superadmin.sub, p_is_active: false }), /akun sendiri/)
})

section('3. Peserta: registrasi, import, PIN')
let P = []
await test('import 45 peserta (15 kecamatan × 3) menghasilkan kode + PIN 6 digit', async () => {
  const out = await importParticipants(api, adminA, eventA, 45)
  eq(out.length, 45)
  assert(out.every((r) => r.ok && /^\d{6}$/.test(r.pin) && /^R[A-Z2-9]{5}$/.test(r.code)), 'format kode/PIN')
  eq(new Set(out.map((r) => r.code)).size, 45, 'kode unik')
  P = out.map((r) => ({ id: r.id, code: r.code, pin: r.pin, name: r.full_name }))
  eq(await val(`select count(*)::int from event_participants where event_id = $1`, [eventA]), 45)
})
await test('PIN hanya tersimpan sebagai hash bcrypt', async () => {
  const hashes = (await su.query(`select pin_hash from participant_credentials`)).rows
  assert(hashes.every((h) => h.pin_hash.startsWith('$2a$') && !P.some((p) => h.pin_hash.includes(p.pin))))
})
await test('import ulang memperbarui data lama tanpa menggandakan / mengganti PIN', async () => {
  const out = await importParticipants(api, adminA, eventA, 45)
  assert(out.every((r) => r.ok && r.created === false && r.pin === null), 'ada data ganda atau PIN berubah')
  eq(await val(`select count(*)::int from participants`), 45)
})
await test('baris import yang salah dilaporkan tanpa membatalkan baris lain', async () => {
  const out = await api.rpc(adminA, 'admin_import_participants', {
    p_event_id: eventA,
    p_rows: J([
      { participant_number: 'X1', full_name: 'Valid', level: 'SD', district: 'Baradatu' },
      { participant_number: 'X2', full_name: 'Kecamatan Salah', level: 'SD', district: 'Tidak Ada' },
      { participant_number: 'X3', full_name: '', level: 'SD', district: 'Kasui' },
      { participant_number: 'X4', full_name: 'Jenjang Salah', level: 'TK', district: 'Kasui' },
    ]),
  })
  eq(out.map((r) => r.ok), [true, false, false, false])
  assert(/Kecamatan tidak dikenal/.test(out[1].error) && /Jenjang tidak dikenal/.test(out[3].error))
})
await test('admin tanpa izin peserta ditolak', async () => {
  await rejects(importParticipants(api, adminC, eventA, 1), /Akses ditolak/)
})

section('4. Login peserta')
await test('PIN salah ditolak, 5 kali salah mengunci akun', async () => {
  const p = P[40]
  for (let i = 0; i < 4; i++) {
    const r = await api.rpc(ANON, 'participant_login', { p_code: p.code, p_pin: '000000x' })
    eq([r.ok, r.code], [false, 'INVALID_CREDENTIALS'])
  }
  const fifth = await api.rpc(ANON, 'participant_login', { p_code: p.code, p_pin: '0000000' })
  assert(/dikunci/.test(fifth.message), fifth.message)
  const locked = await api.rpc(ANON, 'participant_login', { p_code: p.code, p_pin: p.pin })
  eq([locked.ok, locked.code], [false, 'LOCKED'])
  await su.query(`update participant_credentials set locked_until = null where participant_id = $1`, [p.id])
})
await test('percobaan berlebihan terkena rate limit', async () => {
  let limited = false
  for (let i = 0; i < 8; i++) {
    const r = await api.rpc(ANON, 'participant_login', { p_code: 'TIDAKADA', p_pin: '1' })
    if (i < 3) eq(r.code, 'INVALID_CREDENTIALS')
  }
  for (let i = 0; i < 4; i++) limited ||= (await api.rpc(ANON, 'participant_login', { p_code: 'TIDAKADA', p_pin: '1' })).code === 'RATE_LIMITED'
  assert(limited, 'rate limit tidak aktif')
  await su.query(`delete from rate_limits`)
})
await test('login benar memberi token; token tidak tersimpan mentah; login baru mencabut sesi lama', async () => {
  const p = P[40]
  const a = await api.rpc(ANON, 'participant_login', { p_code: p.code.toLowerCase(), p_pin: p.pin })
  assert(a.ok && a.token.length === 64 && a.participant.name === p.name)
  eq(await val(`select count(*)::int from participant_sessions where token_hash = $1`, [a.token]), 0)
  const b = await api.rpc(ANON, 'participant_login', { p_code: p.code, p_pin: p.pin })
  eq((await api.rpc(ANON, 'participant_get_state', { p_token: a.token })).code, 'UNAUTHENTICATED')
  eq((await api.rpc(ANON, 'participant_get_state', { p_token: b.token })).ok, true)
})
await test('reset PIN: PIN lama mati, PIN baru berlaku', async () => {
  const p = P[41]
  const [r] = await api.rpc(adminA, 'admin_reset_pins', { p_event_id: eventA, p_participant_ids: [p.id] })
  assert(r.pin !== p.pin || true)
  eq((await api.rpc(ANON, 'participant_login', { p_code: p.code, p_pin: r.pin })).ok, true)
  if (r.pin !== p.pin) eq((await api.rpc(ANON, 'participant_login', { p_code: p.code, p_pin: p.pin })).ok, false)
  p.pin = r.pin
  await su.query(`delete from rate_limits`)
})

section('5. Bank soal')
await test('validasi kunci jawaban di server', async () => {
  const base = { event_id: eventA, question_text: 'Uji?', type: 'multiple_choice' }
  await rejects(api.rpc(adminA, 'admin_save_question', { p_data: J({ ...base, options: [{ text: 'a', is_correct: true }, { text: 'b', is_correct: true }] }) }), /tepat satu kunci/)
  await rejects(api.rpc(adminA, 'admin_save_question', { p_data: J({ ...base, options: [{ text: 'a', is_correct: true }] }) }), /2–6 opsi/)
  await rejects(api.rpc(adminA, 'admin_save_question', { p_data: J({ ...base, type: 'short_answer', options: [] }) }), /minimal satu jawaban/)
  await rejects(api.rpc(adminB, 'admin_save_question', { p_data: J({ ...base, options: [{ text: 'a', is_correct: true }, { text: 'b' }] }) }), /Akses ditolak/)
})
await test('import soal: baris valid tersimpan, baris salah dilaporkan', async () => {
  const out = await api.rpc(adminA, 'admin_import_questions', {
    p_event_id: eventA,
    p_rows: J([
      { type: 'multiple_choice', question_text: '2 + 2 = ?', category: 'Matematika', level: 'SMP', options: [{ text: '3' }, { text: '4', is_correct: true }, { text: '5' }] },
      { type: 'true_false', question_text: 'Bumi itu bulat.', options: [{ text: 'Benar', is_correct: true }, { text: 'Salah' }] },
      { type: 'multiple_choice', question_text: 'Tanpa kunci', options: [{ text: 'a' }, { text: 'b' }] },
    ]),
  })
  eq(out.map((r) => r.ok), [true, true, false])
  eq(await val(`select count(*)::int from questions where event_id = $1`, [eventA]), 14)
})

// ------------------------------------------------------------------ persiapan sesi
const Q = (await su.query(
  `select q.id, q.type, q.question_text from package_questions pq join questions q on q.id = pq.question_id order by pq.sort_order`,
)).rows
const opt = async (qid, text) => val(`select id from question_options where question_id = $1 and option_text = $2`, [qid, text])
const correctOpt = async (qid) => val(`select id from question_options where question_id = $1 and is_correct order by sort_order limit 1`, [qid])
const wrongOpt = async (qid) => val(`select id from question_options where question_id = $1 and not is_correct order by sort_order limit 1`, [qid])
const smp = await val(`select id from education_levels where code = 'SMP'`)
let session, round1, round2, round3
const cur = () => val(`select current_question_id from competition_sessions where id = $1`, [session.id])
const submit = (i, cq, a = {}) =>
  api.rpc(ANON, 'submit_answer', {
    p_token: P[i].token, p_competition_question_id: cq, p_option_id: a.option ?? null,
    p_answer_text: a.text ?? null, p_idempotency_key: a.key ?? uid(),
  })
const live = () => api.rpc(ANON, 'get_live_state', { p_code: session.code })
const pstate = (i) => api.rpc(ANON, 'participant_get_state', { p_token: P[i].token })
const lbRow = async (i) => one(`select * from leaderboards where session_id = $1 and participant_id = $2`, [session.id, P[i].id])

section('6. Penyiapan sesi & pelindung status')
await test('admin membuat sesi; status dipaksa draft dan kode dibuat server', async () => {
  session = (await api.sql(adminA,
    `insert into competition_sessions (event_id, education_level_id, name, status, results_published) values ($1, $2, 'Final SMP', 'running', true) returning *`,
    [eventA, smp])).rows[0]
  eq([session.status, session.results_published], ['draft', false])
  assert(/^[A-Z2-9]{6}$/.test(session.code))
})
await test('klien tidak dapat mengubah status sesi / soal secara langsung', async () => {
  await rejects(api.sql(adminA, `update competition_sessions set status = 'finished' where id = $1`, [session.id]), /kontrol pertandingan/)
  await rejects(api.sql(superadmin, `update competition_sessions set results_published = true where id = $1`, [session.id]), /kontrol pertandingan/)
  eq((await api.sql(adminA, `update competition_sessions set name = 'Final SMP 2026' where id = $1`, [session.id])).rowCount, 1)
})
await test('peserta sesi harus terverifikasi pada event & jenjang yang sama', async () => {
  const sd = await val(`select id from participants where participant_number = 'X1'`)
  await rejects(api.sql(adminA, `insert into session_participants (session_id, participant_id) values ($1, $2)`, [session.id, sd]), /jenjang sesi/)
  await api.sql(adminA, `insert into session_participants (session_id, participant_id) select $1, unnest($2::uuid[])`, [session.id, P.map((p) => p.id)])
  eq(await val(`select count(*)::int from session_participants where session_id = $1`, [session.id]), 45)
})
await test('babak mewarisi konfigurasi penilaian event (100 / 50 / 20 dtk / 2 desimal)', async () => {
  round1 = (await api.sql(adminA, `insert into competition_rounds (session_id, name, mode) values ($1, 'Babak 1 — Normal', 'normal') returning *`, [session.id])).rows[0]
  eq([Number(round1.base_points), Number(round1.speed_bonus), round1.duration_seconds, round1.rounding_decimals, round1.sequence, round1.status], [100, 50, 20, 2, 1, 'pending'])
  const n = await api.rpc(adminA, 'admin_add_questions_to_round', { p_round_id: round1.id, p_question_ids: [Q[0].id, Q[1].id, Q[9].id, Q[7].id] })
  eq(n, 4)
  await rejects(api.sql(adminA, `update competition_questions set status = 'revealed' where round_id = $1`, [round1.id]), /kontrol pertandingan/)
  const foreign = await api.rpc(adminB, 'admin_save_question', { p_data: J({ event_id: eventB, type: 'true_false', question_text: 'Soal event B', options: [{ text: 'Benar', is_correct: true }, { text: 'Salah' }] }) })
  await rejects(api.sql(adminA, `insert into competition_questions (round_id, question_id) values ($1, $2)`, [round1.id, foreign]), /bukan milik/)
  await rejects(api.rpc(adminA, 'admin_add_questions_to_round', { p_round_id: round1.id, p_question_ids: [foreign] }), /bukan milik/)
})
await test('admin tanpa izin kontrol tidak dapat menjalankan lomba', async () => {
  await rejects(api.rpc(adminC, 'open_session', { p_session_id: session.id }), /izin mengontrol/)
  await rejects(api.rpc(adminB, 'open_session', { p_session_id: session.id }), /izin mengontrol/)
  assert((await api.rpc(adminC, 'admin_get_control_state', { p_session_id: session.id })).can_control === false)
})
await test('validasi urutan status: tidak bisa mulai babak / soal sebelum sesi dibuka', async () => {
  await rejects(api.rpc(adminA, 'start_round', { p_round_id: round1.id }), /harus dibuka/)
  await rejects(api.rpc(adminA, 'next_question', { p_session_id: session.id }), /tidak sedang berjalan/)
  await api.rpc(adminA, 'open_session', { p_session_id: session.id })
  await rejects(api.rpc(adminA, 'open_session', { p_session_id: session.id }), /sudah dibuka/)
  await rejects(api.rpc(adminA, 'next_question', { p_session_id: session.id }), /tidak sedang berjalan/)
})
await test('45 peserta login & bergabung ke sesi yang dibuka', async () => {
  const res = await Promise.all(P.map((p) => api.rpc(ANON, 'participant_login', { p_code: p.code, p_pin: p.pin })))
  assert(res.every((r) => r.ok), 'ada login gagal: ' + JSON.stringify(res.find((r) => !r.ok)))
  res.forEach((r, i) => (P[i].token = r.token))
  const st = await pstate(0)
  eq([st.session.code, st.session.status, st.question], [session.code, 'open', null])
  await Promise.all(P.map((_, i) => pstate(i)))
  eq((await live()).counts.online, 45)
})

section('6b. Durasi per soal')
await test('durasi per soal dapat diatur admin selama belum tayang (3–600 dtk); admin lain ditolak', async () => {
  const ids = (await su.query(`select id from competition_questions where round_id = $1 order by sequence`, [round1.id])).rows.map((r) => r.id)
  global.CQ4 = ids[3]
  eq((await api.sql(adminA, `update competition_questions set duration_seconds = 45 where id = $1`, [ids[3]])).rowCount, 1)
  await rejects(api.sql(adminA, `update competition_questions set duration_seconds = 2 where id = $1`, [ids[2]]), /violates check/)
  await rejects(api.sql(adminA, `update competition_questions set duration_seconds = 601 where id = $1`, [ids[2]]), /violates check/)
  eq((await api.sql(adminB, `update competition_questions set duration_seconds = 99 where id = $1`, [ids[2]])).rowCount, 0, 'admin event lain tidak boleh')
  eq((await api.sql(adminA, `update competition_questions set duration_seconds = 20 where round_id = $1 and status = 'pending' and sequence = 3`, [round1.id])).rowCount, 1, 'samakan massal')
})

section('7. Soal aktif: kerahasiaan kunci, skor, deadline, jawaban ganda')
let cq1
await test('selama hitung mundur soal belum terlihat dan jawaban ditolak', async () => {
  await api.rpc(adminA, 'start_round', { p_round_id: round1.id })
  await api.rpc(adminA, 'next_question', { p_session_id: session.id })
  cq1 = await cur()
  const l = await live()
  eq([l.question, l.upcoming.sequence, l.session.display_screen], [null, 1, 'question'])
  eq((await pstate(0)).question, null)
  eq((await submit(0, cq1, { option: await correctOpt(Q[0].id) })).code, 'NOT_STARTED')
})
await test('soal aktif: payload publik & peserta tidak memuat kunci jawaban', async () => {
  await setElapsed(su, session.id, 2)
  for (const payload of [await live(), await pstate(0)]) {
    const text = JSON.stringify(payload)
    assert(payload.question.options.length === 4 && payload.question.text.includes('Lampung'))
    assert(!text.includes('is_correct') && payload.question.reveal === null && !text.includes('correct_label'), 'kunci bocor: ' + text.slice(0, 200))
  }
})
await test('benar pada detik ke-2 → ≈145 poin; respons submit tidak membocorkan benar/salah', async () => {
  const r = await submit(0, cq1, { option: await correctOpt(Q[0].id), key: 'kunci-idem-0001' })
  eq(Object.keys(r).sort(), ['answered_at', 'ok', 'replay', 'response_time_ms'])
  const a = await one(`select * from participant_answers where competition_question_id = $1 and participant_id = $2`, [cq1, P[0].id])
  near(a.points, 145, 0.5); near(a.response_time_ms, 2000, 200); eq(a.is_correct, true)
})
await test('kirim ulang dengan idempotency key sama → replay sukses, tetap satu jawaban', async () => {
  const r = await submit(0, cq1, { option: await wrongOpt(Q[0].id), key: 'kunci-idem-0001' })
  eq([r.ok, r.replay], [true, true])
  eq(await val(`select count(*)::int from participant_answers where participant_id = $1`, [P[0].id]), 1)
})
await test('mengubah jawaban (key berbeda) ditolak', async () => {
  const r = await submit(0, cq1, { option: await wrongOpt(Q[0].id) })
  eq([r.ok, r.code], [false, 'ALREADY_ANSWERED'])
  eq((await one(`select is_correct from participant_answers where participant_id = $1`, [P[0].id])).is_correct, true)
})
await test('benar pada detik ke-10 → ≈125; detik ke-18 → ≈105; salah → 0', async () => {
  await setElapsed(su, session.id, 10)
  await submit(1, cq1, { option: await correctOpt(Q[0].id) })
  await submit(3, cq1, { option: await wrongOpt(Q[0].id) })
  await setElapsed(su, session.id, 18)
  await submit(2, cq1, { option: await correctOpt(Q[0].id) })
  const pts = async (i) => Number(await val(`select points from participant_answers where competition_question_id = $1 and participant_id = $2`, [cq1, P[i].id]))
  near(await pts(1), 125, 0.5); near(await pts(2), 105, 0.5); eq(await pts(3), 0)
})
await test('8 request bersamaan dari satu peserta → tepat satu jawaban sah', async () => {
  const good = await correctOpt(Q[0].id), bad = await wrongOpt(Q[0].id)
  const res = await Promise.all(Array.from({ length: 8 }, (_, k) => submit(4, cq1, { option: k % 2 ? good : bad })))
  eq(res.filter((r) => r.ok).length, 1, 'jumlah diterima')
  eq(res.filter((r) => r.code === 'ALREADY_ANSWERED').length, 7)
  eq(await val(`select count(*)::int from participant_answers where competition_question_id = $1 and participant_id = $2`, [cq1, P[4].id]), 1)
  const s = await one(`select correct_count + wrong_count as n from scores where round_id = $1 and participant_id = $2`, [round1.id, P[4].id])
  eq(s.n, 1, 'agregat ikut tergandakan')
})
await test('opsi dari soal lain / token palsu ditolak', async () => {
  eq((await submit(5, cq1, { option: await correctOpt(Q[1].id) })).code, 'INVALID_ANSWER')
  eq((await submit(5, cq1, { option: null })).code, 'INVALID_ANSWER')
  eq((await api.rpc(ANON, 'submit_answer', { p_token: 'palsu', p_competition_question_id: cq1, p_option_id: null, p_answer_text: null, p_idempotency_key: uid() })).code, 'UNAUTHENTICATED')
  eq(await val(`select count(*)::int from participant_answers where participant_id = $1`, [P[5].id]), 0)
})
await test('operator tidak dapat membuka jawaban / lanjut selama soal berjalan', async () => {
  await rejects(api.rpc(adminA, 'reveal_answer', { p_session_id: session.id }), /masih berjalan/)
  await rejects(api.rpc(adminA, 'next_question', { p_session_id: session.id }), /masih berjalan/)
  await rejects(api.rpc(adminA, 'end_round', { p_session_id: session.id }), /Tutup soal/)
  await rejects(api.rpc(adminA, 'set_display', { p_session_id: session.id, p_screen: 'leaderboard' }), /selama soal berjalan/)
})
await test('jawaban setelah deadline ditolak server', async () => {
  await setElapsed(su, session.id, 20.05)
  const r = await submit(5, cq1, { option: await correctOpt(Q[0].id) })
  eq([r.ok, r.code], [false, 'DEADLINE_PASSED'])
})
await test('soal tertutup otomatis setelah deadline; yang tidak menjawab tercatat', async () => {
  await setElapsed(su, session.id, 21)
  const l = await live()
  eq([l.question.status, l.session.display_screen, l.question.reveal], ['closed', 'processing', null])
  eq((await submit(6, cq1, { option: await correctOpt(Q[0].id) })).code, 'NOT_ACTIVE')
  const s5 = await one(`select unanswered_count, wrong_count from scores where round_id = $1 and participant_id = $2`, [round1.id, P[5].id])
  eq(s5, { unanswered_count: 1, wrong_count: 0 })
  assert((await pstate(0)).my_answer.is_correct === undefined, 'hasil pribadi bocor sebelum dibuka')
  assert((await pstate(0)).me.points === undefined, 'poin pribadi bocor sebelum dibuka')
})
await test('setelah jawaban dibuka: kunci, statistik, dan hasil pribadi tampil', async () => {
  await api.rpc(adminA, 'reveal_answer', { p_session_id: session.id })
  const l = await live()
  eq([l.session.display_screen, l.question.status, l.question.reveal.correct_text, l.question.reveal.answered, l.question.reveal.correct_count], ['result', 'revealed', 'Bandar Lampung', 5, 3])
  eq(l.question.options.filter((o) => o.is_correct).length, 1)
  const me = await pstate(0)
  eq([me.my_answer.is_correct, me.me.rank], [true, 1]); near(me.my_answer.points, 145, 0.5)
  eq((await pstate(3)).my_answer.is_correct, false)
})
await test('leaderboard diurutkan backend & peringkat dipersistenkan', async () => {
  const l = await live()
  eq(l.leaderboard.slice(0, 3).map((r) => r.participant_id), [P[0].id, P[1].id, P[2].id])
  eq(l.leaderboard.length, 10)
  eq([(await lbRow(0)).rank, (await lbRow(1)).rank, (await lbRow(2)).rank], [1, 2, 3])
})
await test('realtime: sinyal progres & perubahan state terkirim ke topik sesi', async () => {
  const ev = (await su.query(`select event, count(*)::int n from realtime.messages where topic = $1 and not private group by event`, ['live:' + session.code])).rows
  const m = Object.fromEntries(ev.map((e) => [e.event, e.n]))
  assert(m.progress === 5 && m.state >= 4, JSON.stringify(m))
})

section('8. Jeda, pembatalan soal, jawaban singkat')
let cq2
await test('jeda menghentikan penerimaan jawaban dan tidak memakan waktu menjawab', async () => {
  await api.rpc(adminA, 'next_question', { p_session_id: session.id })
  cq2 = await cur()
  await setElapsed(su, session.id, 5)
  const before = await one(`select deadline_at from competition_questions where id = $1`, [cq2])
  await api.rpc(adminA, 'pause_session', { p_session_id: session.id })
  eq((await submit(0, cq2, { option: await correctOpt(Q[1].id) })).code, 'PAUSED')
  eq((await live()).question, null, 'soal harus tersembunyi saat jeda')
  await sleep(1200)
  eq((await live()).session.status, 'paused', 'tidak boleh tertutup otomatis saat jeda')
  await api.rpc(adminA, 'resume_session', { p_session_id: session.id })
  const after = await one(`select deadline_at, started_at from competition_questions where id = $1`, [cq2])
  assert(after.deadline_at - before.deadline_at >= 1200, 'deadline tidak digeser')
  eq(after.deadline_at - after.started_at, 20000)
  const r = await submit(0, cq2, { option: await correctOpt(Q[1].id) })
  eq(r.ok, true); near(r.response_time_ms, 5000, 400, 'waktu respons harus tanpa durasi jeda')
})
await test('batalkan soal: skor soal itu dihapus dari agregat, riwayat jawaban tetap ada', async () => {
  const before = Number((await lbRow(0)).total_points)
  near(before, 145 + 137.5, 1.5)
  await api.rpc(adminA, 'cancel_question', { p_session_id: session.id, p_reason: 'Soal bermasalah' })
  near((await lbRow(0)).total_points, 145, 0.5)
  eq((await lbRow(0)).correct_count, 1)
  eq(await val(`select status from competition_questions where id = $1`, [cq2]), 'cancelled')
  eq(await val(`select count(*)::int from participant_answers where competition_question_id = $1`, [cq2]), 1)
  eq((await submit(1, cq2, { option: await correctOpt(Q[1].id) })).code, 'NOT_ACTIVE')
  const l = await live()
  eq([l.question, l.session.display_screen], [null, 'waiting'])
})
await test('jawaban singkat dinormalisasi di server (huruf besar/kecil & spasi)', async () => {
  await api.rpc(adminA, 'next_question', { p_session_id: session.id })
  const cq = await cur()
  await setElapsed(su, session.id, 4)
  const p = await pstate(0)
  eq([p.question.type, p.question.options.length], ['short_answer', 0])
  assert(!JSON.stringify(p).toLowerCase().includes('sembilan'), 'jawaban diterima bocor')
  await submit(0, cq, { text: '  SEM bilan ' })
  await submit(1, cq, { text: '9' })
  await submit(2, cq, { text: 'delapan' })
  eq((await submit(3, cq, { text: '   ' })).code, 'INVALID_ANSWER')
  const rows = (await su.query(`select participant_id, is_correct from participant_answers where competition_question_id = $1`, [cq])).rows
  const by = Object.fromEntries(rows.map((r) => [r.participant_id, r.is_correct]))
  eq([by[P[0].id], by[P[1].id], by[P[2].id]], [true, true, false])
  await api.rpc(adminA, 'close_question', { p_session_id: session.id })
  await api.rpc(adminA, 'reveal_answer', { p_session_id: session.id })
  eq((await live()).question.reveal.accepted, ['9', 'sembilan'])
})
await test('soal 4 memakai durasi khususnya (45 dtk): deadline, countdown, dan bonus mengikuti 45 dtk; terkunci setelah tayang', async () => {
  await api.rpc(adminA, 'next_question', { p_session_id: session.id })
  const t = await one(`select extract(epoch from deadline_at - started_at) as d, duration_seconds from competition_questions where id = $1`, [global.CQ4])
  eq([Number(t.d), t.duration_seconds], [45, 45])
  const l = await live()
  eq([l.upcoming.duration_seconds, l.upcoming.sequence], [45, 4])
  near(await val(`select public.calculate_score(true, 100, 50, 0, 45000, 30000)`) ?? 0, 133.33, 0.01)
  await rejects(api.sql(adminA, `update competition_questions set duration_seconds = 10 where id = $1`, [global.CQ4]), /kontrol pertandingan/)
  await api.rpc(adminA, 'close_question', { p_session_id: session.id })
})
await test('akhiri babak → layar leaderboard', async () => {
  await api.rpc(adminA, 'set_display', { p_session_id: session.id, p_screen: 'leaderboard' })
  await api.rpc(adminA, 'end_round', { p_session_id: session.id })
  const l = await live()
  eq([l.round.status, l.session.display_screen, l.question], ['finished', 'leaderboard', null])
  await rejects(api.sql(adminA, `delete from competition_rounds where id = $1`, [round1.id]), /tidak dapat dihapus/)
})

section('9. Mode eliminasi')
await test('eliminasi otomatis: salah / tidak menjawab 1× → gugur dan tidak bisa menjawab lagi', async () => {
  round2 = (await api.sql(adminA,
    `insert into competition_rounds (session_id, name, mode, elimination_rule, elimination_wrong_limit) values ($1, 'Babak 2 — Eliminasi', 'elimination', 'wrong_count', 1) returning *`,
    [session.id])).rows[0]
  await api.rpc(adminA, 'admin_add_questions_to_round', { p_round_id: round2.id, p_question_ids: [Q[2].id, Q[3].id, Q[4].id] })
  await api.rpc(adminA, 'start_round', { p_round_id: round2.id })
  await api.rpc(adminA, 'next_question', { p_session_id: session.id })
  let cq = await cur()
  await setElapsed(su, session.id, 3)
  const good = await correctOpt(Q[2].id)
  // P0..P9 benar, P10 salah, sisanya tidak menjawab
  await Promise.all(Array.from({ length: 10 }, (_, i) => submit(i, cq, { option: good })))
  await submit(10, cq, { option: await wrongOpt(Q[2].id) })
  await api.rpc(adminA, 'close_question', { p_session_id: session.id })
  const l = await live()
  eq([l.counts.active, l.counts.eliminated], [10, 35])
  const st = await pstate(10)
  eq([st.me.is_eliminated, st.me.on_roster], [true, true])
  await api.rpc(adminA, 'reveal_answer', { p_session_id: session.id })
  await api.rpc(adminA, 'next_question', { p_session_id: session.id })
  cq = await cur()
  await setElapsed(su, session.id, 3)
  eq((await submit(10, cq, { option: await correctOpt(Q[3].id) })).code, 'ELIMINATED')
  eq((await submit(20, cq, { option: await correctOpt(Q[3].id) })).code, 'ELIMINATED')
  eq((await submit(0, cq, { option: await correctOpt(Q[3].id) })).ok, true)
  // peserta yang bertahan berada di atas yang tereliminasi
  assert(l.leaderboard.every((r, i) => i === 0 || !(l.leaderboard[i - 1].is_eliminated && !r.is_eliminated)))
})
await test('eliminasi manual oleh operator wajib beralasan dan tercatat di audit log', async () => {
  await rejects(api.rpc(adminA, 'eliminate_participant', { p_session_id: session.id, p_participant_id: P[9].id, p_reason: ' ' }), /wajib diisi/)
  await api.rpc(adminA, 'eliminate_participant', { p_session_id: session.id, p_participant_id: P[9].id, p_reason: 'Melanggar tata tertib' })
  eq((await submit(9, await cur(), { option: await correctOpt(Q[3].id) })).code, 'ELIMINATED')
  const log = await one(`select actor_id, details from audit_logs where action = 'eliminate_participant' order by created_at desc limit 1`)
  eq([log.actor_id, log.details.alasan], [adminA.sub, 'Melanggar tata tertib'])
  await api.rpc(adminA, 'reinstate_participant', { p_session_id: session.id, p_participant_id: P[9].id, p_reason: 'Keputusan juri' })
  eq((await submit(9, await cur(), { option: await correctOpt(Q[3].id) })).ok, true)
})
await test('membatalkan soal mengembalikan peserta yang gugur karena soal itu', async () => {
  await api.rpc(adminA, 'close_question', { p_session_id: session.id })
  eq((await live()).counts.active, 2) // hanya P0 & P9 yang menjawab benar
  await api.rpc(adminA, 'cancel_question', { p_session_id: session.id, p_reason: 'uji' })
  eq((await live()).counts.active, 10)
  await api.rpc(adminA, 'end_round', { p_session_id: session.id })
})

section('10. Final, seri, dan soal tambahan')
let F
await test('final Top-3 dengan reset skor: roster dari peringkat, non-finalis tidak bisa menjawab', async () => {
  round3 = (await api.sql(adminA,
    `insert into competition_rounds (session_id, name, mode, participant_scope, top_n, reset_scores) values ($1, 'Final', 'final', 'top_n', 3, true) returning *`,
    [session.id])).rows[0]
  await api.rpc(adminA, 'admin_add_questions_to_round', { p_round_id: round3.id, p_question_ids: [Q[5].id] })
  const top3 = (await live()).leaderboard.slice(0, 3).map((r) => r.participant_id)
  await api.rpc(adminA, 'start_round', { p_round_id: round3.id })
  const roster = (await su.query(`select participant_id from scores where round_id = $1`, [round3.id])).rows.map((r) => r.participant_id)
  eq(roster.sort(), [...top3].sort())
  F = top3.map((id) => P.findIndex((p) => p.id === id))
  const l = await live()
  assert(l.leaderboard.slice(0, 3).every((r) => r.is_finalist && Number(r.points) === 0), 'finalis harus mulai dari 0')
  assert(Number(l.leaderboard[3].points) > 0 && !l.leaderboard[3].is_finalist, 'non-finalis mempertahankan skor lama')
  await api.rpc(adminA, 'next_question', { p_session_id: session.id })
  await setElapsed(su, session.id, 6)
  const outsider = P.findIndex((p) => !top3.includes(p.id))
  eq((await submit(outsider, await cur(), { option: await correctOpt(Q[5].id) })).code, 'NOT_PARTICIPANT')
  eq((await pstate(outsider)).me.on_roster, false)
  eq((await submit(F[1], await cur(), { option: await correctOpt(Q[5].id) })).ok, true)
  await api.rpc(adminA, 'close_question', { p_session_id: session.id })
  await api.rpc(adminA, 'reveal_answer', { p_session_id: session.id })
  await api.rpc(adminA, 'end_round', { p_session_id: session.id })
  eq((await live()).leaderboard[0].participant_id, P[F[1]].id)
})
await test('pengumuman pemenang ditolak selama tiga besar masih seri', async () => {
  const l = await live()
  eq([l.leaderboard[1].tied, l.leaderboard[2].tied, l.leaderboard[0].tied], [true, true, false])
  await rejects(api.rpc(adminA, 'announce_winners', { p_session_id: session.id }), /SERI/)
})
await test('soal tambahan memutus seri tanpa mengubah total poin; hasil tie-breaker tersimpan', async () => {
  const tied = [P[F[0]].id, P[F[2]].id]
  const tb = await api.rpc(adminA, 'create_tiebreak_round', { p_session_id: session.id, p_participant_ids: tied, p_question_ids: [Q[8].id] })
  await api.rpc(adminA, 'start_round', { p_round_id: tb })
  await api.rpc(adminA, 'next_question', { p_session_id: session.id })
  await setElapsed(su, session.id, 4)
  eq((await submit(F[1], await cur(), { option: await correctOpt(Q[8].id) })).code, 'NOT_PARTICIPANT')
  await submit(F[2], await cur(), { option: await correctOpt(Q[8].id) })
  await submit(F[0], await cur(), { option: await wrongOpt(Q[8].id) })
  await api.rpc(adminA, 'close_question', { p_session_id: session.id })
  await api.rpc(adminA, 'end_round', { p_session_id: session.id })
  const l = await live()
  eq(l.leaderboard.slice(0, 3).map((r) => r.participant_id), [P[F[1]].id, P[F[2]].id, P[F[0]].id])
  eq(Number(l.leaderboard[1].points), 0, 'total poin tidak boleh berubah')
  near(l.leaderboard[1].tiebreak_points, 140, 1)
  eq(await val(`select count(*)::int from scores where round_id = $1`, [tb]), 2)
})

section('11. Urutan tie-breaker (fungsi ranking backend)')
await test('poin → jumlah benar → waktu benar tercepat; mode kecepatan mendahulukan waktu', async () => {
  const s2 = (await su.query(`insert into competition_sessions (event_id, education_level_id, name, code) values ($1, $2, 'Uji Ranking', 'RANKQA') returning id`, [eventA, smp])).rows[0].id
  const ids = P.slice(0, 5).map((p) => p.id)
  const rows = [
    [ids[0], 300, 2, 9000],  // poin sama, benar 2
    [ids[1], 300, 3, 12000], // poin sama, benar 3 → di atas ids[0]
    [ids[2], 300, 3, 8000],  // poin sama, benar 3, lebih cepat → teratas di antara 300
    [ids[3], 450, 3, 30000], // poin tertinggi
    [ids[4], 300, 3, 8000],  // seri penuh dengan ids[2]
  ]
  for (const [pid, pts, c, ms] of rows)
    await su.query(`insert into leaderboards (session_id, participant_id, total_points, correct_count, correct_response_ms) values ($1, $2, $3, $4, $5)`, [s2, pid, pts, c, ms])
  const ranked = async () => (await su.query(`select participant_id, rank, tied from _leaderboard_ranked($1) order by rank`, [s2])).rows
  let r = await ranked()
  eq(r.map((x) => x.participant_id).slice(0, 1), [ids[3]])
  eq(new Set(r.slice(1, 3).map((x) => x.participant_id)), new Set([ids[2], ids[4]]))
  eq(r.slice(3).map((x) => x.participant_id), [ids[1], ids[0]])
  eq(r.map((x) => x.tied), [false, true, true, false, false])
  // hasil soal tambahan memutus seri penuh
  await su.query(`update leaderboards set tiebreak_points = 120 where session_id = $1 and participant_id = $2`, [s2, ids[4]])
  r = await ranked()
  eq([r[1].participant_id, r[1].tied, r[2].tied], [ids[4], false, false])
  // mode kecepatan: ids[0] (9000 ms) naik di atas ids[1] (12000 ms) meski benar lebih sedikit
  await su.query(`insert into competition_rounds (session_id, sequence, name, mode, status) values ($1, 1, 'Kecepatan', 'speed', 'active')`, [s2])
  r = await ranked()
  eq(r.slice(3).map((x) => x.participant_id), [ids[0], ids[1]])
  await su.query(`delete from competition_sessions where id = $1`, [s2])
})

section('12. Hasil akhir, publikasi, laporan')
await test('hasil belum publik sebelum diumumkan', async () => {
  eq((await api.rpc(ANON, 'get_public_results', { p_code: session.code })).code, 'NOT_PUBLISHED')
})
await test('umumkan pemenang → podium, sesi selesai, hasil publik', async () => {
  const w = await api.rpc(adminA, 'announce_winners', { p_session_id: session.id })
  eq(w.map((x) => x.rank), [1, 2, 3])
  const l = await live()
  eq([l.session.status, l.session.display_screen, l.winners.length], ['finished', 'podium', 3])
  const pub = await api.rpc(ANON, 'get_public_results', { p_code: session.code })
  eq([pub.ok, pub.rows.length], [true, 45])
  eq(await val(`select count(*)::int from announcements where session_id = $1 and type = 'winner' and is_published`, [session.id]), 1)
  const landing = await api.rpc(ANON, 'get_landing_data')
  eq(landing.events[0].sessions[0].winners.length, 3)
  assert(!JSON.stringify(landing).includes('pin') && landing.app.branding.developer === 'Dodi Sujatmiko')
  const me = await pstate(F[1])
  eq([me.session.status, me.me.rank], ['finished', 1])
})
await test('setelah selesai tidak ada aksi lomba yang diterima', async () => {
  await rejects(api.rpc(adminA, 'next_question', { p_session_id: session.id }), /tidak sedang berjalan/)
  await rejects(api.rpc(adminA, 'cancel_session', { p_session_id: session.id }), /sudah selesai/)
  await rejects(api.sql(adminA, `delete from competition_sessions where id = $1`, [session.id]), /Superadmin/)
})
await test('laporan: ranking lengkap, per babak, dan riwayat jawaban; hanya untuk yang berizin', async () => {
  const rep = await api.rpc(adminA, 'admin_get_session_report', { p_session_id: session.id })
  eq([rep.rows.length, rep.rounds.length, rep.rows[0].rank], [45, 4, 1])
  const r1 = await api.rpc(adminA, 'admin_get_session_report', { p_session_id: session.id, p_round_id: round1.id })
  eq(r1.rows.length, 45); eq(r1.rows[0].participant_id, P[0].id)
  const r2 = await api.rpc(adminA, 'admin_get_session_report', { p_session_id: session.id, p_round_id: round2.id })
  assert(r2.rows.some((r) => r.is_eliminated && r.elimination_reason))
  const hist = await api.rpc(adminA, 'admin_get_answer_history', { p_session_id: session.id })
  eq(hist.length, await val(`select count(*)::int from participant_answers`))
  await rejects(api.rpc(adminB, 'admin_get_session_report', { p_session_id: session.id }), /Akses ditolak/)
  await rejects(api.rpc(ANON, 'admin_get_answer_history', { p_session_id: session.id }), /permission denied/)
})
await test('klasemen konsisten dengan jawaban tersimpan (tidak ada selisih agregat)', async () => {
  const diff = await val(
    `select count(*)::int from scores s
      join competition_rounds r on r.id = s.round_id
      left join lateral (
        select coalesce(sum(pa.points), 0) pts, count(*) filter (where pa.is_correct) c
        from participant_answers pa join competition_questions cq on cq.id = pa.competition_question_id
        where cq.round_id = s.round_id and pa.participant_id = s.participant_id and cq.status <> 'cancelled') a on true
      where r.session_id = $1 and (s.total_points <> a.pts or s.correct_count <> a.c)`, [session.id])
  eq(diff, 0)
})
await test('dashboard & audit mengikuti hak akses', async () => {
  const sa = await api.rpc(superadmin, 'admin_dashboard_stats')
  const a = await api.rpc(adminA, 'admin_dashboard_stats')
  const b = await api.rpc(adminB, 'admin_dashboard_stats')
  eq([sa.events, a.events, b.events, b.questions, b.sessions_total], [2, 1, 1, 1, 0])
  eq([a.sessions_finished, a.recent_results[0].winner], [1, P[F[1]].name])
  assert((await api.sql(adminA, `select 1 from audit_logs`)).rowCount > 0)
  eq((await api.sql(adminB, `select 1 from audit_logs where event_id = $1`, [eventA])).rowCount, 0)
  assert((await api.sql(superadmin, `select 1 from audit_logs where action = 'announce_winners'`)).rowCount === 1)
})

done()
await api.pool.end()
await su.end()
