// Harness pengujian database: membangun DB bersih dari migrasi + seed pada PostgreSQL biasa,
// lalu memanggil RPC persis seperti PostgREST (role authenticator → SET ROLE anon/authenticated + JWT claims).
import pg from 'pg'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BASE = process.env.TEST_DATABASE_URL || 'postgres://postgres@127.0.0.1:54329/postgres'
export const DB_NAME = process.env.TEST_DATABASE_NAME || 'lr1_test'

export const urlFor = (db, user, password) => {
  const u = new URL(BASE)
  u.pathname = '/' + db
  if (user) {
    u.username = user
    u.password = password ?? ''
  }
  return u.toString()
}

export async function resetDatabase() {
  const admin = new pg.Client({ connectionString: BASE })
  await admin.connect()
  await admin.query(
    `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${DB_NAME}' and pid <> pg_backend_pid()`,
  )
  await admin.query(`drop database if exists ${DB_NAME}`)
  await admin.query(`create database ${DB_NAME}`)
  await admin.end()
  const su = new pg.Pool({ connectionString: urlFor(DB_NAME), max: 4 })
  const files = [
    'supabase/tests/00_supabase_shim.sql',
    ...readdirSync(path.join(root, 'supabase/migrations'))
      .sort()
      .map((f) => 'supabase/migrations/' + f),
    'supabase/seed.sql',
  ]
  for (const f of files) {
    try {
      await su.query(readFileSync(path.join(root, f), 'utf8'))
    } catch (e) {
      throw new Error(`Gagal menerapkan ${f}: ${e.message}`)
    }
  }
  return su
}

export function makeApi(max = 20) {
  const pool = new pg.Pool({ connectionString: urlFor(DB_NAME, 'authenticator', 'authenticator'), max })
  const as = async (who, fn) => {
    const c = await pool.connect()
    try {
      await c.query('begin')
      await c.query(`set local role ${who?.role === 'authenticated' ? 'authenticated' : 'anon'}`)
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify(who?.sub ? { sub: who.sub, role: 'authenticated' } : { role: 'anon' }),
      ])
      const r = await fn(c)
      await c.query('commit')
      return r
    } catch (e) {
      await c.query('rollback').catch(() => {})
      throw e
    } finally {
      c.release()
    }
  }
  // rpc(who, 'nama_fungsi', { p_arg: nilai }) — nilai jsonb harus dibungkus J()
  const rpc = async (who, name, args = {}) => {
    const keys = Object.keys(args)
    const text = `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`
    const res = await as(who, (c) => c.query(text, keys.map((k) => args[k])))
    return res.rows[0].r
  }
  const sql = (who, text, params = []) => as(who, (c) => c.query(text, params))
  return { pool, as, rpc, sql }
}

export const J = (v) => JSON.stringify(v)
export const ANON = { role: 'anon' }
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const uid = () => crypto.randomUUID()

export async function createAdminUser(su, email, name) {
  const { rows } = await su.query(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [email, { full_name: name }],
  )
  return { role: 'authenticated', sub: rows[0].id, email }
}

/** Buat N peserta (dibagi rata ke semua kecamatan) lewat RPC import; mengembalikan kode + PIN. */
export async function importParticipants(api, admin, eventId, n, level = 'SMP', prefix = 'P') {
  const districts = (await api.sql(admin, 'select name from districts order by sort_order')).rows.map((r) => r.name)
  const rows = Array.from({ length: n }, (_, i) => ({
    participant_number: `${prefix}${String(i + 1).padStart(3, '0')}`,
    full_name: `Peserta ${prefix}${i + 1}`,
    school: `Sekolah ${1 + (i % 9)} ${districts[i % districts.length]}`,
    level,
    district: districts[i % districts.length],
  }))
  return api.rpc(admin, 'admin_import_participants', { p_event_id: eventId, p_rows: J(rows) })
}

/** Paksa soal aktif seolah-olah sudah berjalan `elapsedSec` detik (hanya untuk pengujian). */
export async function setElapsed(su, sessionId, elapsedSec) {
  await su.query(
    `update competition_questions cq
        set started_at = clock_timestamp() - make_interval(secs => $2::numeric),
            deadline_at = clock_timestamp() - make_interval(secs => $2::numeric) + make_interval(secs => cq.duration_seconds)
       from competition_sessions s where s.id = $1 and cq.id = s.current_question_id`,
    [sessionId, elapsedSec],
  )
}

export function makeRunner() {
  let pass = 0
  let fail = 0
  const failures = []
  const test = async (name, fn) => {
    try {
      await fn()
      pass++
      console.log(`  ✓ ${name}`)
    } catch (e) {
      fail++
      failures.push(name)
      console.log(`  ✗ ${name}\n      ${String(e.message).split('\n').join('\n      ')}`)
    }
  }
  const section = (t) => console.log(`\n${t}`)
  const done = () => {
    console.log(`\n${pass} lulus, ${fail} gagal`)
    if (fail) {
      console.log('Gagal:\n - ' + failures.join('\n - '))
      process.exitCode = 1
    }
    return fail === 0
  }
  return { test, section, done }
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion gagal')
}
export function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${msg || 'tidak sama'}: didapat ${JSON.stringify(a)}, diharapkan ${JSON.stringify(b)}`)
}
export function near(a, b, tol, msg) {
  if (Math.abs(Number(a) - b) > tol) throw new Error(`${msg || 'di luar toleransi'}: didapat ${a}, diharapkan ${b} ±${tol}`)
}
export async function rejects(p, re, msg) {
  try {
    await p
  } catch (e) {
    if (re && !re.test(e.message)) throw new Error(`${msg || 'pesan error tidak sesuai'}: ${e.message}`)
    return
  }
  throw new Error(msg || 'seharusnya ditolak, tetapi berhasil')
}
