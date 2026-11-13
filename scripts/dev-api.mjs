// EMULATOR API LOKAL — HANYA UNTUK PENGUJIAN. Jangan dipakai di produksi.
//
// Meniru sebagian kecil antarmuka Supabase (PostgREST + GoTrue + Edge Function admin-users)
// di atas PostgreSQL lokal, supaya frontend dapat diuji di browser tanpa proyek Supabase.
// Setiap request dijalankan persis seperti PostgREST: koneksi `authenticator`, lalu
// SET LOCAL ROLE anon/authenticated + request.jwt.claims — jadi RLS dan RPC asli yang bekerja.
// Realtime tidak ditiru: klien otomatis jatuh ke mode polling (sekaligus menguji jalur cadangan).
//
//   scripts/pg-local.sh start
//   node scripts/dev-api.mjs            # reset DB, terapkan migrasi + seed + data demo, lalu melayani :54400
//   VITE_SUPABASE_URL=http://127.0.0.1:54400 VITE_SUPABASE_ANON_KEY=dev-anon npm run dev
import http from 'node:http'
import pg from 'pg'
import { resetDatabase, urlFor, DB_NAME, createAdminUser, makeApi, importParticipants, J } from './lib/harness.mjs'

const PORT = Number(process.env.DEV_API_PORT || 54400)
const PASSWORD = process.env.DEV_PASSWORD || 'rahasia123'
const IDENT = /^[a-z_][a-z0-9_]*$/

const su = process.env.DEV_API_KEEP ? new pg.Pool({ connectionString: urlFor(DB_NAME), max: 4 }) : await resetDatabase()
const pool = new pg.Pool({ connectionString: urlFor(DB_NAME, 'authenticator', 'authenticator'), max: 40 })

// ---------- data demo ----------
if (!process.env.DEV_API_KEEP) {
  const api = makeApi(4)
  const superadmin = await createAdminUser(su, 'super@demo.local', 'Dodi Sujatmiko')
  await su.query(`select public.bootstrap_superadmin('super@demo.local')`)
  await su.query(`update profiles set full_name = 'Dodi Sujatmiko' where id = $1`, [superadmin.sub])
  const admin = await createAdminUser(su, 'admin@demo.local', 'Operator Lomba')
  await api.rpc(superadmin, 'admin_set_profile', { p_user_id: admin.sub, p_is_active: true })
  const eventId = (await su.query(`select id from events limit 1`)).rows[0].id
  await api.sql(superadmin, `insert into admin_assignments (admin_id, event_id) values ($1, $2)`, [admin.sub, eventId])
  const creds = await importParticipants(api, admin, eventId, 45, 'SMP', 'SMP-')
  await importParticipants(api, admin, eventId, 45, 'SD', 'SD-')
  await importParticipants(api, admin, eventId, 45, 'SMA', 'SMA-')
  // PIN demo yang mudah diingat untuk uji manual
  await api.rpc(admin, 'admin_save_participant', { p_event_id: eventId, p_data: J({ code: creds[0].code, participant_number: 'SMP-001', full_name: 'Peserta SMP-1', level: 'SMP', district: 'Bahuga', pin: '123456' }) })
  const smp = (await su.query(`select id from education_levels where code = 'SMP'`)).rows[0].id
  const session = (await api.sql(admin, `insert into competition_sessions (event_id, education_level_id, name) values ($1, $2, 'Babak Utama SMP') returning id, code`, [eventId, smp])).rows[0]
  await api.sql(admin, `insert into session_participants (session_id, participant_id) select $1, unnest($2::uuid[])`, [session.id, creds.map((c) => c.id)])
  const round = (await api.sql(admin, `insert into competition_rounds (session_id, name, mode) values ($1, 'Babak 1 — Normal', 'normal') returning id`, [session.id])).rows[0]
  const qids = (await su.query(`select q.id from package_questions pq join questions q on q.id = pq.question_id order by pq.sort_order`)).rows.map((r) => r.id)
  await api.rpc(admin, 'admin_add_questions_to_round', { p_round_id: round.id, p_question_ids: qids })
  await api.pool.end()
  console.log(`Data demo siap.
  Superadmin : super@demo.local / ${PASSWORD}
  Admin      : admin@demo.local / ${PASSWORD}
  Peserta    : ${creds[0].code} / 123456   (peserta lain: lihat DEMO_CREDS)
  Sesi       : ${session.code}`)
  globalThis.DEMO = { creds, sessionCode: session.code, sessionId: session.id }
}

// ---------- util ----------
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const makeJwt = (sub, email) => `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub, email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })}.dev`
const readJwt = (h) => {
  try {
    const p = JSON.parse(Buffer.from((h || '').replace(/^Bearer\s+/i, '').split('.')[1] || '', 'base64url').toString())
    return p?.sub ? p : null
  } catch { return null }
}
const sessionFor = (u) => {
  const user = { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: {}, user_metadata: u.raw_user_meta_data ?? {}, created_at: new Date().toISOString() }
  return { access_token: makeJwt(u.id, u.email), token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r.' + u.id, user }
}
const body = (req) => new Promise((resolve) => {
  let d = ''
  req.on('data', (c) => (d += c))
  req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}) } catch { resolve({}) } })
})

async function tx(req, fn) {
  const claims = readJwt(req.headers.authorization)
  const c = await pool.connect()
  try {
    await c.query('begin')
    await c.query(`set local role ${claims ? 'authenticated' : 'anon'}`)
    await c.query(`select set_config('request.jwt.claims', $1, true), set_config('request.headers', $2, true)`, [
      JSON.stringify(claims ?? { role: 'anon' }), JSON.stringify({ 'x-forwarded-for': req.socket.remoteAddress }),
    ])
    const r = await fn(c)
    await c.query('commit')
    return r
  } catch (e) {
    await c.query('rollback').catch(() => {})
    throw e
  } finally { c.release() }
}

function where(params, values) {
  const parts = []
  for (const [col, raw] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(col)) continue
    if (!IDENT.test(col)) throw Object.assign(new Error('kolom tidak valid'), { status: 400 })
    const i = raw.indexOf('.')
    const op = raw.slice(0, i)
    const v = raw.slice(i + 1)
    if (op === 'eq') { values.push(v); parts.push(`${col} = $${values.length}`) }
    else if (op === 'neq') { values.push(v); parts.push(`${col} <> $${values.length}`) }
    else if (op === 'gte') { values.push(v); parts.push(`${col} >= $${values.length}`) }
    else if (op === 'lte') { values.push(v); parts.push(`${col} <= $${values.length}`) }
    else if (op === 'ilike') { values.push(v.replaceAll('*', '%')); parts.push(`${col}::text ilike $${values.length}`) }
    else if (op === 'is') parts.push(`${col} is ${v === 'null' ? 'null' : v === 'true' ? 'true' : 'false'}`)
    else if (op === 'in') { values.push(v.replace(/^\(|\)$/g, '').split(',').filter(Boolean).map((s) => s.replace(/^"|"$/g, ''))); parts.push(`${col}::text = any($${values.length})`) }
    else throw Object.assign(new Error('operator tidak didukung emulator: ' + op), { status: 400 })
  }
  return parts.length ? ' where ' + parts.join(' and ') : ''
}

const fnArgs = new Map()
for (const r of (await su.query(`select p.proname, unnest(p.proargnames) as name, unnest(p.proargtypes::regtype[])::text as type
                                  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proargnames is not null`)).rows) {
  fnArgs.set(`${r.proname}.${r.name}`, r.type)
}

async function rest(req, res, url) {
  const seg = url.pathname.replace('/rest/v1/', '').split('/')
  if (seg[0] === 'rpc') {
    const fn = seg[1]
    if (!IDENT.test(fn)) throw Object.assign(new Error('fungsi tidak valid'), { status: 404 })
    const args = req.method === 'GET' ? Object.fromEntries(url.searchParams) : await body(req)
    const keys = Object.keys(args)
    const values = keys.map((k) => (fnArgs.get(`${fn}.${k}`) === 'jsonb' ? JSON.stringify(args[k]) : args[k]))
    const r = await tx(req, (c) => c.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, values))
    return send(res, 200, r.rows[0].r)
  }
  const table = seg[0]
  if (!IDENT.test(table)) throw Object.assign(new Error('tabel tidak valid'), { status: 404 })
  const prefer = String(req.headers.prefer || '')
  const values = []
  if (req.method === 'GET' || req.method === 'HEAD') {
    const w = where(url.searchParams, values)
    const order = (url.searchParams.get('order') || '').split(',').filter(Boolean).map((o) => {
      const [c, dir] = o.split('.')
      if (!IDENT.test(c)) throw Object.assign(new Error('order tidak valid'), { status: 400 })
      return `${c} ${dir === 'desc' ? 'desc' : 'asc'}`
    })
    const limit = Number(url.searchParams.get('limit') || 0)
    const offset = Number(url.searchParams.get('offset') || 0)
    const sql = `select * from public.${table}${w}${order.length ? ' order by ' + order.join(', ') : ''}${limit ? ` limit ${limit}` : ''}${offset ? ` offset ${offset}` : ''}`
    const out = await tx(req, async (c) => {
      const rows = (await c.query(sql, values)).rows
      const total = prefer.includes('count=exact') ? (await c.query(`select count(*)::int n from public.${table}${w}`, values)).rows[0].n : null
      return { rows, total }
    })
    if (out.total !== null) res.setHeader('Content-Range', `${offset}-${offset + Math.max(0, out.rows.length - 1)}/${out.total}`)
    return send(res, 200, out.rows)
  }
  const data = await body(req)
  if (req.method === 'POST') {
    const rows = Array.isArray(data) ? data : [data]
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))]
    if (!cols.every((c) => IDENT.test(c))) throw Object.assign(new Error('kolom tidak valid'), { status: 400 })
    let sql = `insert into public.${table} (${cols.join(', ')}) select ${cols.join(', ')} from json_populate_recordset(null::public.${table}, $1)`
    const conflict = url.searchParams.get('on_conflict')
    if (prefer.includes('resolution=merge-duplicates') && conflict) {
      const cc = conflict.split(',')
      if (!cc.every((c) => IDENT.test(c))) throw Object.assign(new Error('on_conflict tidak valid'), { status: 400 })
      const upd = cols.filter((c) => !cc.includes(c))
      sql += ` on conflict (${cc.join(', ')}) do ${upd.length ? 'update set ' + upd.map((c) => `${c} = excluded.${c}`).join(', ') : 'nothing'}`
    }
    const r = await tx(req, (c) => c.query(sql + ' returning *', [JSON.stringify(rows)]))
    return send(res, 201, r.rows)
  }
  if (req.method === 'PATCH') {
    const cols = Object.keys(data)
    if (!cols.length || !cols.every((c) => IDENT.test(c))) throw Object.assign(new Error('kolom tidak valid'), { status: 400 })
    values.push(JSON.stringify(data))
    const w = where(url.searchParams, values)
    const sql = `update public.${table} t set ${cols.map((c) => `${c} = x.${c}`).join(', ')} from json_populate_record(null::public.${table}, $1) x${w.replace(/(where | and )([a-z_]+)/g, '$1t.$2')} returning t.*`
    const r = await tx(req, (c) => c.query(sql, values))
    return send(res, 200, r.rows)
  }
  if (req.method === 'DELETE') {
    const w = where(url.searchParams, values)
    if (!w) throw Object.assign(new Error('DELETE tanpa filter ditolak'), { status: 400 })
    const r = await tx(req, (c) => c.query(`delete from public.${table}${w} returning *`, values))
    return send(res, 200, r.rows)
  }
  throw Object.assign(new Error('metode tidak didukung'), { status: 405 })
}

async function auth(req, res, url) {
  const p = url.pathname.replace('/auth/v1', '')
  if (p === '/token') {
    const b = await body(req)
    let u
    if (url.searchParams.get('grant_type') === 'refresh_token') {
      u = (await su.query(`select * from auth.users where id::text = $1`, [String(b.refresh_token || '').slice(2)])).rows[0]
    } else {
      u = (await su.query(`select * from auth.users where lower(email) = lower($1)`, [b.email || ''])).rows[0]
      if (!u || b.password !== PASSWORD) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' })
    }
    if (!u) return send(res, 400, { error: 'invalid_grant', msg: 'Invalid Refresh Token' })
    return send(res, 200, sessionFor(u))
  }
  if (p === '/user') {
    const claims = readJwt(req.headers.authorization)
    const u = claims && (await su.query(`select * from auth.users where id = $1`, [claims.sub])).rows[0]
    return u ? send(res, 200, sessionFor(u).user) : send(res, 401, { msg: 'invalid JWT' })
  }
  if (p === '/logout') return send(res, 204, null)
  return send(res, 404, { msg: 'tidak didukung emulator' })
}

async function adminUsers(req, res) {
  const claims = readJwt(req.headers.authorization)
  const ok = claims && (await tx(req, (c) => c.query('select public.is_superadmin() as ok'))).rows[0].ok
  if (!ok) return send(res, 403, { error: 'Hanya Superadmin' })
  const b = await body(req)
  if (b.action === 'create') {
    if (String(b.password || '').length < 8) return send(res, 400, { error: 'Kata sandi minimal 8 karakter' })
    try {
      const u = (await su.query(`insert into auth.users (email, raw_user_meta_data) values (lower($1), $2) returning id`, [b.email, { full_name: b.full_name }])).rows[0]
      await su.query(`update profiles set is_active = true, full_name = $2 where id = $1`, [u.id, b.full_name || ''])
      return send(res, 200, { user_id: u.id })
    } catch { return send(res, 400, { error: 'Email sudah terdaftar' }) }
  }
  if (b.action === 'reset_password') return send(res, 200, { ok: true })
  if (b.action === 'delete') { await su.query(`delete from auth.users where id = $1`, [b.user_id]); return send(res, 200, { ok: true }) }
  return send(res, 400, { error: 'Aksi tidak dikenal' })
}

function send(res, status, data) {
  res.statusCode = status
  if (data === null || data === undefined) return res.end(status === 204 ? undefined : 'null')
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS,HEAD')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range')
  if (req.method === 'OPTIONS') return res.end()
  const url = new URL(req.url, 'http://x')
  try {
    if (url.pathname === '/__demo') return send(res, 200, globalThis.DEMO ?? {})
    if (url.pathname.startsWith('/rest/v1/')) return await rest(req, res, url)
    if (url.pathname.startsWith('/auth/v1/')) return await auth(req, res, url)
    if (url.pathname === '/functions/v1/admin-users') return await adminUsers(req, res)
    return send(res, 404, { message: 'Tidak didukung emulator (mis. Storage/Realtime)', error: 'not_found' })
  } catch (e) {
    const status = e.status || (e.code === '42501' ? 403 : e.code === '23505' ? 409 : 400)
    send(res, status, { message: e.message, code: e.code ?? null, details: e.detail ?? null, hint: e.hint ?? null })
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Emulator API lokal: http://127.0.0.1:${PORT}`))
