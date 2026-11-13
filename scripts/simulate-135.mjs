// Simulasi 135 peserta pada database nyata (PostgreSQL + migrasi asli), melalui RPC yang sama dengan produksi.
//   scripts/pg-local.sh start && npm run test:load
//
// Kolam koneksi sengaja dibatasi (POOL, default 30) seperti pooler Supabase: request antre di depan database,
// jadi latensi yang diukur lebih pesimistis daripada beban sebenarnya.
import {
  resetDatabase, makeApi, createAdminUser, importParticipants, makeRunner, assert, eq, J, ANON, sleep, uid,
} from './lib/harness.mjs'

const N = Number(process.env.PARTICIPANTS || 135)
const POOL = Number(process.env.POOL || 30)
const QUESTIONS = Number(process.env.QUESTIONS || 6)
const su = await resetDatabase()
const api = makeApi(POOL)
const { test, section, done } = makeRunner()
const one = async (t, p) => (await su.query(t, p)).rows[0]
const val = async (t, p) => Object.values((await one(t, p)) ?? {})[0]
const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))]
const stats = (a) => `p50 ${pct(a, 0.5)} ms · p95 ${pct(a, 0.95)} ms · maks ${Math.max(...a)} ms`
const timed = async (fn) => { const t = performance.now(); const r = await fn(); return [r, Math.round(performance.now() - t)] }

const superadmin = await createAdminUser(su, 'super@load.local', 'Super')
await su.query(`select public.bootstrap_superadmin('super@load.local')`)
const eventId = await val(`select id from events limit 1`)
const smp = await val(`select id from education_levels where code = 'SMP'`)
const Q = (await su.query(`select q.id from package_questions pq join questions q on q.id = pq.question_id order by pq.sort_order limit $1`, [QUESTIONS])).rows.map((r) => r.id)

section(`Persiapan: ${N} peserta, ${QUESTIONS} soal`)
let P
await test(`impor ${N} peserta dan buka sesi`, async () => {
  const out = await importParticipants(api, superadmin, eventId, N, 'SMP', 'L')
  assert(out.every((r) => r.ok), JSON.stringify(out.find((r) => !r.ok)))
  P = out.map((r) => ({ id: r.id, code: r.code, pin: r.pin }))
  const s = (await api.sql(superadmin, `insert into competition_sessions (event_id, education_level_id, name) values ($1, $2, 'Simulasi') returning id`, [eventId, smp])).rows[0]
  global.SID = s.id
  await api.sql(superadmin, `insert into session_participants (session_id, participant_id) select $1, unnest($2::uuid[])`, [s.id, P.map((p) => p.id)])
  const r = (await api.sql(superadmin, `insert into competition_rounds (session_id, name, mode, lead_seconds, duration_seconds) values ($1, 'Babak Beban', 'normal', 1, 20) returning id`, [s.id])).rows[0]
  global.RID = r.id
  await api.rpc(superadmin, 'admin_add_questions_to_round', { p_round_id: r.id, p_question_ids: Q })
  await api.rpc(superadmin, 'open_session', { p_session_id: s.id })
})

section('Login serentak')
await test(`${N} peserta login bersamaan (bcrypt + token)`, async () => {
  const [res, ms] = await timed(() => Promise.all(P.map((p) => api.rpc(ANON, 'participant_login', { p_code: p.code, p_pin: p.pin }))))
  assert(res.every((r) => r.ok), JSON.stringify(res.find((r) => !r.ok)))
  res.forEach((r, i) => (P[i].token = r.token))
  console.log(`      total ${ms} ms`)
})
await test('seluruh peserta mengambil state (join) bersamaan', async () => {
  const lat = []
  await Promise.all(P.map(async (p) => { const [r, ms] = await timed(() => api.rpc(ANON, 'participant_get_state', { p_token: p.token })); lat.push(ms); assert(r.ok && r.session.code) }))
  console.log('      ' + stats(lat))
})

await api.rpc(superadmin, 'start_round', { p_round_id: global.RID })
const sid = global.SID
const code = await val(`select code from competition_sessions where id = $1`, [sid])

const burstLat = []
const pollLat = []
for (let qn = 1; qn <= QUESTIONS; qn++) {
  section(`Soal ${qn}: burst ${N} jawaban + duplikat + polling`)
  await api.rpc(superadmin, 'next_question', { p_session_id: sid })
  const cq = await val(`select current_question_id from competition_sessions where id = $1`, [sid])
  const startsAt = new Date(await val(`select started_at from competition_questions where id = $1`, [cq])).getTime()
  await sleep(Math.max(0, startsAt - Date.now()) + 50)
  const optIds = (await su.query(`select option_id from (select unnest(option_order) as option_id from competition_questions where id = $1) x`, [cq])).rows.map((r) => r.option_id)
  const isShort = optIds.length === 0
  const keys = P.map(() => uid())

  await test(`soal ${qn}: tepat satu jawaban sah per peserta`, async () => {
    const t0 = performance.now()
    const calls = []
    // jawaban tersebar dalam ±1,5 dtk (peserta menjawab berdekatan); sebagian mengirim 2× bersamaan (dobel-tap / retry jaringan)
    P.forEach((p, i) => {
      const delay = Math.random() * 1500
      const send = (key) => sleep(delay).then(async () => {
        const [r, ms] = await timed(() => api.rpc(ANON, 'submit_answer', {
          p_token: p.token, p_competition_question_id: cq, p_option_id: isShort ? null : optIds[Math.floor(Math.random() * optIds.length)],
          p_answer_text: isShort ? '9' : null, p_idempotency_key: key,
        }))
        burstLat.push(ms)
        return r
      })
      calls.push(send(keys[i]))
      if (i % 3 === 0) calls.push(send(keys[i]))          // duplikat, key sama (retry)
      if (i % 5 === 0) calls.push(send(uid()))             // duplikat, key berbeda (upaya ganda)
    })
    // polling bersamaan: monitor + panel operator + seluruh HP
    const polls = []
    for (let k = 0; k < 3; k++) for (const p of P) polls.push(sleep(Math.random() * 1600).then(async () => { const [r, ms] = await timed(() => api.rpc(ANON, 'participant_get_state', { p_token: p.token })); pollLat.push(ms); return r }))
    for (let k = 0; k < 20; k++) polls.push(sleep(k * 80).then(async () => { const [, ms] = await timed(() => api.rpc(ANON, 'get_live_state', { p_code: code })); pollLat.push(ms) }))
    const results = await Promise.all(calls)
    await Promise.all(polls)
    const accepted = results.filter((r) => r.ok && !r.replay).length
    const bad = results.filter((r) => !r.ok && !['ALREADY_ANSWERED'].includes(r.code))
    console.log(`      ${Math.round(performance.now() - t0)} ms total · ${results.length} request · ${accepted} diterima`)
    eq(bad.length, 0, 'ada penolakan tak terduga: ' + JSON.stringify(bad[0]))
    eq(accepted, N, 'jumlah jawaban sah')
    eq(await val(`select count(*)::int from participant_answers where competition_question_id = $1`, [cq]), N)
    eq(await val(`select count(*)::int from (select participant_id from participant_answers where competition_question_id = $1 group by 1 having count(*) > 1) x`, [cq]), 0)
  })

  await test(`soal ${qn}: skor sesuai rumus & dihitung dari waktu server`, async () => {
    const bad = await val(`
      select count(*)::int from participant_answers pa join competition_questions cq on cq.id = pa.competition_question_id
       join competition_rounds r on r.id = cq.round_id
       where pa.competition_question_id = $1 and (
         (pa.is_correct and abs(pa.points - round(r.base_points + r.speed_bonus * greatest(0, least(1, extract(epoch from (cq.deadline_at - pa.answered_at)) * 1000 / (cq.duration_seconds * 1000.0))), 2)) > 0.011)
         or (not pa.is_correct and pa.points <> 0)
         or pa.answered_at < cq.started_at or pa.answered_at > cq.deadline_at
         or pa.points > r.base_points + r.speed_bonus)`, [cq])
    eq(bad, 0, 'ada skor menyimpang')
  })

  await api.rpc(superadmin, 'close_question', { p_session_id: sid })
  await api.rpc(superadmin, 'reveal_answer', { p_session_id: sid })
}

section('Balapan penutupan soal saat burst')
await test('close_question bersamaan dengan 135 submit → tidak ada jawaban lewat closed_at, tidak ada yang hilang diam-diam', async () => {
  // babak tambahan agar ada soal segar
  await api.rpc(superadmin, 'end_round', { p_session_id: sid })
  const extra = (await su.query(`select q.id from questions q where q.event_id = $1 and q.type <> 'short_answer' and q.id <> all($2::uuid[]) limit 1`, [eventId, Q])).rows[0]?.id
  const r2 = (await api.sql(superadmin, `insert into competition_rounds (session_id, name, mode, lead_seconds, duration_seconds) values ($1, 'Balapan', 'normal', 1, 20) returning id`, [sid])).rows[0]
  await api.rpc(superadmin, 'admin_add_questions_to_round', { p_round_id: r2.id, p_question_ids: [extra ?? Q[0]].filter((x) => x !== Q[0] || !extra) })
  await api.rpc(superadmin, 'start_round', { p_round_id: r2.id }).catch(async () => { throw new Error('start_round gagal') })
  await api.rpc(superadmin, 'next_question', { p_session_id: sid })
  const cq = await val(`select current_question_id from competition_sessions where id = $1`, [sid])
  const startsAt = new Date(await val(`select started_at from competition_questions where id = $1`, [cq])).getTime()
  await sleep(Math.max(0, startsAt - Date.now()) + 30)
  const opts = (await su.query(`select unnest(option_order) o from competition_questions where id = $1`, [cq])).rows.map((r) => r.o)
  const sends = P.map((p, i) => sleep(i * 6).then(() => api.rpc(ANON, 'submit_answer', { p_token: p.token, p_competition_question_id: cq, p_option_id: opts[0], p_answer_text: null, p_idempotency_key: uid() })))
  const closer = sleep(400).then(() => api.rpc(superadmin, 'close_question', { p_session_id: sid }))
  const res = await Promise.all([...sends, closer])
  const results = res.slice(0, N)
  const accepted = results.filter((r) => r.ok).length
  const rejected = results.filter((r) => !r.ok)
  console.log(`      diterima ${accepted}, ditolak ${rejected.length} (${[...new Set(rejected.map((r) => r.code))].join(', ')})`)
  assert(accepted > 0 && rejected.length > 0, 'burst harus terbelah oleh penutupan (naikkan jeda jika tidak)')
  assert(rejected.every((r) => ['NOT_ACTIVE', 'DEADLINE_PASSED'].includes(r.code)), 'kode penolakan tak terduga')
  eq(await val(`select count(*)::int from participant_answers where competition_question_id = $1`, [cq]), accepted, 'jawaban tersimpan = jawaban diterima')
  eq(await val(`select count(*)::int from participant_answers pa join competition_questions q on q.id = pa.competition_question_id where q.id = $1 and pa.answered_at > q.closed_at`, [cq]), 0, 'ada jawaban setelah closed_at')
  const u = await val(`select unanswered_count from scores where round_id = $1 order by unanswered_count desc limit 1`, [r2.id])
  eq(u, 1)
})

section('Konsistensi akhir & kinerja')
await test('agregat klasemen = jumlah jawaban untuk seluruh peserta', async () => {
  const bad = await val(`
    select count(*)::int from leaderboards l
    left join lateral (select coalesce(sum(pa.points), 0) pts, count(*) filter (where pa.is_correct) c, count(*) filter (where not pa.is_correct) w
                       from participant_answers pa join competition_questions cq on cq.id = pa.competition_question_id join competition_rounds r on r.id = cq.round_id
                       where r.session_id = l.session_id and pa.participant_id = l.participant_id and cq.status <> 'cancelled') a on true
    where l.session_id = $1 and (l.total_points <> a.pts or l.correct_count <> a.c or l.wrong_count <> a.w)`, [sid])
  eq(bad, 0)
  const ranks = (await su.query(`select rank from leaderboards where session_id = $1 order by rank`, [sid])).rows.map((r) => r.rank)
  eq(ranks, Array.from({ length: N }, (_, i) => i + 1), 'peringkat harus 1..N unik')
})
await test('latensi submit & polling wajar di bawah beban', async () => {
  console.log('      submit : ' + stats(burstLat))
  console.log('      polling: ' + stats(pollLat))
  assert(pct(burstLat, 0.95) < 4000, `p95 submit terlalu tinggi: ${pct(burstLat, 0.95)} ms`)
  assert(pct(pollLat, 0.95) < 4000, `p95 polling terlalu tinggi: ${pct(pollLat, 0.95)} ms`)
})
await test('tidak ada kunci/transaksi menggantung', async () => {
  const n = await val(`select count(*)::int from pg_stat_activity where datname = current_database() and state = 'idle in transaction'`)
  eq(n, 0)
})

done()
await api.pool.end()
await su.end()
