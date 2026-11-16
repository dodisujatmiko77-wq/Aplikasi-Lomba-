// Harness pengujian: membangun DB bersih dari shim + migrasi pada PostgreSQL biasa,
// lalu menjalankan query persis seperti PostgREST (role authenticator → SET ROLE anon/authenticated + JWT claims),
// sehingga RLS dan fungsi yang diuji adalah yang asli.
import pg from 'pg'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.TEST_DATABASE_URL || 'postgres://postgres@127.0.0.1:54339/postgres'
export const DB_NAME = process.env.TEST_DATABASE_NAME || 'sim_test'

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
  await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = '${DB_NAME}' and pid <> pg_backend_pid()`)
  await admin.query(`drop database if exists ${DB_NAME}`)
  await admin.query(`create database ${DB_NAME}`)
  await admin.end()
  const su = new pg.Pool({ connectionString: urlFor(DB_NAME), max: 4 })
  const files = ['supabase/tests/00_supabase_shim.sql', ...readdirSync(path.join(root, 'supabase/migrations')).sort().map((f) => 'supabase/migrations/' + f)]
  for (const f of files) {
    try {
      await su.query(readFileSync(path.join(root, f), 'utf8'))
    } catch (e) {
      throw new Error(`Gagal menerapkan ${f}: ${e.message}`)
    }
  }
  return su
}

export function makeApi(max = 10) {
  const pool = new pg.Pool({ connectionString: urlFor(DB_NAME, 'authenticator', 'authenticator'), max })
  const as = async (who, fn) => {
    const c = await pool.connect()
    try {
      await c.query('begin')
      await c.query(`set local role ${who ? 'authenticated' : 'anon'}`)
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(who ? { sub: who, role: 'authenticated' } : { role: 'anon' })])
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
  /** sql(userId | null, text, params) — null = anon (layar TV) */
  const sql = (who, text, params = []) => as(who, (c) => c.query(text, params))
  return { pool, as, sql }
}
