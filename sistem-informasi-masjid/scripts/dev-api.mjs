// EMULATOR API LOKAL — HANYA UNTUK PENGUJIAN. Jangan dipakai di produksi.
//
// Meniru sebagian kecil antarmuka Supabase (PostgREST + GoTrue + Storage) di atas PostgreSQL lokal,
// supaya aplikasi dapat diuji di browser tanpa proyek Supabase. Setiap request dijalankan seperti PostgREST:
// koneksi `authenticator`, lalu SET LOCAL ROLE anon/authenticated + request.jwt.claims — jadi RLS dan RPC asli yang bekerja.
// Realtime tidak ditiru: layar otomatis jatuh ke mode polling (sekaligus menguji jalur cadangan).
//
//   scripts/pg-local.sh start
//   node scripts/dev-api.mjs                 # reset DB, terapkan migrasi, lalu melayani :54410
//   VITE_SUPABASE_URL=http://127.0.0.1:54410 VITE_SUPABASE_ANON_KEY=dev-anon npm run dev
import http from 'node:http'
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import pg from 'pg'
import { resetDatabase, urlFor, DB_NAME } from './harness.mjs'

// PostgREST mengirim kolom date sebagai 'YYYY-MM-DD' (bukan objek Date)
pg.types.setTypeParser(1082, (v) => v)

const PORT = Number(process.env.DEV_API_PORT || 54410)
const IDENT = /^[a-z_][a-z0-9_]*$/
const FILES = path.join(os.tmpdir(), 'sim-dev-storage')
rmSync(FILES, { recursive: true, force: true })
mkdirSync(FILES, { recursive: true })

const su = await resetDatabase()
const pool = new pg.Pool({ connectionString: urlFor(DB_NAME, 'authenticator', 'authenticator'), max: 30 })

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const makeJwt = (sub, email) => `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub, email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })}.dev`
const readJwt = (h) => {
  try {
    const p = JSON.parse(Buffer.from((h || '').replace(/^Bearer\s+/i, '').split('.')[1] || '', 'base64url').toString())
    return p?.sub ? p : null
  } catch { return null }
}
const sessionFor = (u) => {
  const user = { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: {}, user_metadata: u.raw_user_meta_data ?? {}, identities: [{ id: u.id }], created_at: new Date().toISOString() }
  return { access_token: makeJwt(u.id, u.email), token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r.' + u.id, user }
}
const raw = (req) => new Promise((resolve) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => resolve(Buffer.concat(chunks)))
})
const body = async (req) => { try { return JSON.parse((await raw(req)).toString() || '{}') } catch { return {} } }

async function tx(req, fn) {
  const claims = readJwt(req.headers.authorization)
  const c = await pool.connect()
  try {
    await c.query('begin')
    await c.query(`set local role ${claims ? 'authenticated' : 'anon'}`)
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims ?? { role: 'anon' })])
    const r = await fn(c)
    await c.query('commit')
    return r
  } catch (e) {
    await c.query('rollback').catch(() => {})
    throw e
  } finally { c.release() }
}

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status })

function where(params, values) {
  const parts = []
  for (const [col, rawV] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(col)) continue
    if (!IDENT.test(col)) throw bad('kolom tidak valid')
    const i = rawV.indexOf('.')
    const op = rawV.slice(0, i), v = rawV.slice(i + 1)
    if (op === 'eq') { values.push(v); parts.push(`${col} = $${values.length}`) }
    else if (op === 'neq') { values.push(v); parts.push(`${col} <> $${values.length}`) }
    else if (op === 'gte') { values.push(v); parts.push(`${col} >= $${values.length}`) }
    else if (op === 'lte') { values.push(v); parts.push(`${col} <= $${values.length}`) }
    else if (op === 'is') parts.push(`${col} is ${v === 'null' ? 'null' : v === 'true' ? 'true' : 'false'}`)
    else throw bad('operator tidak didukung emulator: ' + op)
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
    if (!IDENT.test(fn)) throw bad('fungsi tidak valid', 404)
    const args = req.method === 'GET' ? Object.fromEntries(url.searchParams) : await body(req)
    const keys = Object.keys(args)
    if (!keys.every((k) => IDENT.test(k))) throw bad('argumen tidak valid')
    const values = keys.map((k) => (fnArgs.get(`${fn}.${k}`) === 'jsonb' ? JSON.stringify(args[k]) : args[k]))
    const r = await tx(req, (c) => c.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, values))
    return send(res, 200, r.rows[0].r === '' ? null : r.rows[0].r)
  }
  const table = seg[0]
  if (!IDENT.test(table)) throw bad('tabel tidak valid', 404)
  const values = []
  if (req.method === 'GET') {
    const w = where(url.searchParams, values)
    const order = (url.searchParams.get('order') || '').split(',').filter(Boolean).map((o) => {
      const [c, dir] = o.split('.')
      if (!IDENT.test(c)) throw bad('order tidak valid')
      return `${c} ${dir === 'desc' ? 'desc nulls last' : 'asc nulls last'}`
    })
    const limit = Number(url.searchParams.get('limit') || 0)
    const r = await tx(req, (c) => c.query(`select * from public.${table}${w}${order.length ? ' order by ' + order.join(', ') : ''}${limit ? ` limit ${limit}` : ''}`, values))
    return send(res, 200, r.rows)
  }
  const data = await body(req)
  if (req.method === 'POST') {
    const rows = Array.isArray(data) ? data : [data]
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))]
    if (!cols.length || !cols.every((c) => IDENT.test(c))) throw bad('kolom tidak valid')
    const r = await tx(req, (c) => c.query(`insert into public.${table} (${cols.join(', ')}) select ${cols.join(', ')} from json_populate_recordset(null::public.${table}, $1) returning *`, [JSON.stringify(rows)]))
    return send(res, 201, r.rows)
  }
  if (req.method === 'PATCH') {
    const cols = Object.keys(data)
    if (!cols.length || !cols.every((c) => IDENT.test(c))) throw bad('kolom tidak valid')
    values.push(JSON.stringify(data))
    const w = where(url.searchParams, values)
    const r = await tx(req, (c) => c.query(`update public.${table} t set ${cols.map((c) => `${c} = x.${c}`).join(', ')} from json_populate_record(null::public.${table}, $1) x${w.replace(/( where | and )([a-z_]+)/g, '$1t.$2')} returning t.*`, values))
    return send(res, 200, r.rows)
  }
  if (req.method === 'DELETE') {
    const w = where(url.searchParams, values)
    if (!w) throw bad('DELETE tanpa filter ditolak')
    const r = await tx(req, (c) => c.query(`delete from public.${table}${w} returning *`, values))
    return send(res, 200, r.rows)
  }
  throw bad('metode tidak didukung', 405)
}

async function auth(req, res, url) {
  const p = url.pathname.replace('/auth/v1', '')
  if (p === '/signup') {
    const b = await body(req)
    if (String(b.password || '').length < 6) return send(res, 422, { msg: 'Password should be at least 6 characters' })
    try {
      const u = (await su.query(`insert into auth.users (email, password, raw_user_meta_data) values (lower($1), $2, $3) returning *`, [b.email, b.password, b.data ?? {}])).rows[0]
      return send(res, 200, sessionFor(u))
    } catch { return send(res, 422, { msg: 'User already registered', error_code: 'user_already_exists' }) }
  }
  if (p === '/token') {
    const b = await body(req)
    let u
    if (url.searchParams.get('grant_type') === 'refresh_token') {
      u = (await su.query(`select * from auth.users where id::text = $1`, [String(b.refresh_token || '').slice(2)])).rows[0]
      if (!u) return send(res, 400, { error: 'invalid_grant', msg: 'Invalid Refresh Token' })
    } else {
      u = (await su.query(`select * from auth.users where lower(email) = lower($1)`, [b.email || ''])).rows[0]
      if (!u || b.password !== u.password) return send(res, 400, { error: 'invalid_grant', msg: 'Invalid login credentials' })
    }
    return send(res, 200, sessionFor(u))
  }
  if (p === '/user') {
    const claims = readJwt(req.headers.authorization)
    let u = claims && (await su.query(`select * from auth.users where id = $1`, [claims.sub])).rows[0]
    if (!u) return send(res, 401, { msg: 'invalid JWT' })
    if (req.method === 'PUT') {
      const b = await body(req)
      if (b.password) u = (await su.query(`update auth.users set password = $2 where id = $1 returning *`, [u.id, b.password])).rows[0]
    }
    return send(res, 200, sessionFor(u).user)
  }
  if (p === '/logout') return send(res, 204, null)
  return send(res, 404, { msg: 'tidak didukung emulator' })
}

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm' }
const diskName = (bucket, name) => path.join(FILES, encodeURIComponent(`${bucket}/${name}`))

async function storage(req, res, url) {
  const p = decodeURIComponent(url.pathname.replace('/storage/v1/object/', ''))
  if (req.method === 'GET' && p.startsWith('public/')) {
    const [bucket, ...rest] = p.slice(7).split('/')
    const file = diskName(bucket, rest.join('/'))
    if (!existsSync(file)) return send(res, 404, { message: 'Object not found' })
    res.setHeader('Content-Type', MIME[file.split('.').pop()] || 'application/octet-stream')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    return res.end(readFileSync(file))
  }
  const [bucket, ...rest] = p.split('/')
  const name = rest.join('/')
  if (req.method === 'POST') {
    const buf = await raw(req)
    let bytes = buf
    if (String(req.headers['content-type'] || '').includes('multipart/form-data')) {
      const form = await new Request('http://x', { method: 'POST', headers: { 'content-type': req.headers['content-type'] }, body: buf }).formData()
      const file = [...form.values()].find((v) => typeof v !== 'string')
      bytes = Buffer.from(await file.arrayBuffer())
    }
    await tx(req, (c) => c.query(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [bucket, name])) // RLS storage yang asli
    writeFileSync(diskName(bucket, name), bytes)
    return send(res, 200, { Key: `${bucket}/${name}`, Id: name })
  }
  if (req.method === 'DELETE') {
    const b = await body(req)
    const r = await tx(req, (c) => c.query(`delete from storage.objects where bucket_id = $1 and name = any($2) returning name`, [bucket, b.prefixes ?? []]))
    for (const row of r.rows) rmSync(diskName(bucket, row.name), { force: true })
    return send(res, 200, r.rows)
  }
  throw bad('metode tidak didukung', 405)
}

function send(res, status, data) {
  res.statusCode = status
  if (status === 204) return res.end()
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data ?? null))
}

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD')
  if (req.method === 'OPTIONS') return res.end()
  const url = new URL(req.url, 'http://x')
  try {
    if (url.pathname.startsWith('/rest/v1/')) return await rest(req, res, url)
    if (url.pathname.startsWith('/auth/v1/')) return await auth(req, res, url)
    if (url.pathname.startsWith('/storage/v1/object/')) return await storage(req, res, url)
    return send(res, 404, { message: 'Tidak didukung emulator (mis. Realtime)', error: 'not_found' })
  } catch (e) {
    const status = e.status || (e.code === '42501' ? 403 : e.code === '23505' ? 409 : 400)
    send(res, status, { message: e.message, code: e.code ?? null, details: e.detail ?? null, hint: e.hint ?? null })
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Emulator API lokal: http://127.0.0.1:${PORT}`))
