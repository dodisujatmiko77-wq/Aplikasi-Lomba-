// Lapisan akses data tipis di atas supabase-js. Semua error dilempar sebagai Error berbahasa Indonesia.
import { supabase } from '@/lib/supabase/client'

type FilterValue = string | number | boolean | null | { in: (string | number)[] } | { neq: string | number | boolean } | { gte: string } | { lte: string }
export type Filters = Record<string, FilterValue | undefined>

export interface ListOptions {
  filters?: Filters
  order?: { column: string; ascending?: boolean }[]
  range?: [number, number]
  count?: boolean
  limit?: number
}

function fail(error: { message: string; code?: string; details?: string | null }): never {
  let msg = error.message || 'Terjadi kesalahan'
  if (/row-level security|permission denied/i.test(msg)) msg = 'Anda tidak memiliki hak akses untuk tindakan ini'
  else if (/duplicate key|already exists/i.test(msg)) msg = 'Data sudah ada (duplikat)'
  else if (/violates foreign key/i.test(msg)) msg = 'Data masih dipakai oleh data lain sehingga tidak dapat dihapus/diubah'
  else if (/Failed to fetch|NetworkError|fetch failed/i.test(msg)) msg = 'Koneksi ke server terputus. Periksa jaringan Anda.'
  throw new Error(msg)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(q: any, filters?: Filters) {
  for (const [col, v] of Object.entries(filters ?? {})) {
    if (v === undefined) continue
    if (v === null) q = q.is(col, null)
    else if (typeof v === 'object' && 'in' in v) q = q.in(col, v.in)
    else if (typeof v === 'object' && 'neq' in v) q = q.neq(col, v.neq)
    else if (typeof v === 'object' && 'gte' in v) q = q.gte(col, v.gte)
    else if (typeof v === 'object' && 'lte' in v) q = q.lte(col, v.lte)
    else q = q.eq(col, v)
  }
  return q
}

export async function list<T>(table: string, opts: ListOptions = {}): Promise<T[]> {
  return (await listWithCount<T>(table, opts)).rows
}

export async function listWithCount<T>(table: string, opts: ListOptions = {}): Promise<{ rows: T[]; count: number }> {
  let q = supabase.from(table).select('*', opts.count ? { count: 'exact' } : undefined)
  q = applyFilters(q, opts.filters)
  for (const o of opts.order ?? []) q = q.order(o.column, { ascending: o.ascending ?? true })
  if (opts.range) q = q.range(opts.range[0], opts.range[1])
  else q = q.limit(opts.limit ?? 5000)
  const { data, error, count } = await q
  if (error) fail(error)
  return { rows: (data ?? []) as T[], count: count ?? data?.length ?? 0 }
}

/** Ambil baris berdasarkan daftar id (dipecah agar URL tidak terlalu panjang). */
export async function listByIds<T>(table: string, ids: string[], column = 'id'): Promise<T[]> {
  const unique = [...new Set(ids)]
  const chunks: string[][] = []
  for (let i = 0; i < unique.length; i += 120) chunks.push(unique.slice(i, i + 120))
  const parts = await Promise.all(chunks.map((c) => list<T>(table, { filters: { [column]: { in: c } } })))
  return parts.flat()
}

export async function getOne<T>(table: string, filters: Filters): Promise<T | null> {
  const rows = await list<T>(table, { filters, limit: 1 })
  return rows[0] ?? null
}

export async function insert<T>(table: string, values: Record<string, unknown> | Record<string, unknown>[]): Promise<T[]> {
  const { data, error } = await supabase.from(table).insert(values).select()
  if (error) fail(error)
  return (data ?? []) as T[]
}

export async function upsert<T>(table: string, values: Record<string, unknown> | Record<string, unknown>[], onConflict: string): Promise<T[]> {
  const { data, error } = await supabase.from(table).upsert(values, { onConflict }).select()
  if (error) fail(error)
  return (data ?? []) as T[]
}

export async function update<T>(table: string, filters: Filters, patch: Record<string, unknown>): Promise<T[]> {
  const q = applyFilters(supabase.from(table).update(patch), filters)
  const { data, error } = await q.select()
  if (error) fail(error)
  if (!data?.length) throw new Error('Perubahan tidak tersimpan. Anda mungkin tidak memiliki hak akses.')
  return data as T[]
}

export async function remove(table: string, filters: Filters): Promise<void> {
  const q = applyFilters(supabase.from(table).delete(), filters)
  const { data, error } = await q.select()
  if (error) fail(error)
  if (!data?.length) throw new Error('Data tidak terhapus. Anda mungkin tidak memiliki hak akses.')
}

export async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(name, args)
  if (error) fail(error)
  return data as T
}

/** Unggah gambar ke Storage dan kembalikan URL publik. Nama berkas diacak. */
export async function uploadImage(bucket: 'participant-photos' | 'question-images' | 'branding', file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Berkas harus berupa gambar')
  if (file.size > 2 * 1024 * 1024) throw new Error('Ukuran gambar maksimal 2 MB')
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: '31536000', upsert: false })
  if (error) fail(error)
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}
