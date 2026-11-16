import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage, supabase } from '@/lib/supabase'

export type Order = [column: string, ascending?: boolean]

/** Daftar baris sebuah tabel milik satu masjid. */
export function useTable<T>(table: string, mosqueId: string | null, order: Order[], mosqueColumn = 'mosque_id') {
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const orderKey = JSON.stringify(order)
  const seq = useRef(0)

  const reload = useCallback(async () => {
    if (!mosqueId) {
      setRows([])
      setLoading(false)
      return
    }
    const mine = ++seq.current
    let q = supabase.from(table).select('*').eq(mosqueColumn, mosqueId)
    for (const [col, asc] of JSON.parse(orderKey) as Order[]) q = q.order(col, { ascending: asc ?? true })
    const { data, error: err } = await q
    if (mine !== seq.current) return
    if (err) setError(errorMessage(err))
    else {
      setRows((data ?? []) as T[])
      setError(null)
    }
    setLoading(false)
  }, [table, mosqueId, mosqueColumn, orderKey])

  useEffect(() => {
    setLoading(true)
    void reload()
  }, [reload])

  return { rows, loading, error, reload, setRows }
}

/** Satu baris pengaturan (profil / jadwal salat / pengaturan display) milik masjid. */
export function useSingleRow<T extends { id: string }>(table: string, mosqueId: string | null, column = 'mosque_id') {
  const [row, setRow] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!mosqueId) return setLoading(false)
    const { data, error: err } = await supabase.from(table).select('*').eq(column, mosqueId).limit(1)
    if (err) setError(errorMessage(err))
    else {
      setRow((data?.[0] as T | undefined) ?? null)
      setError(null)
    }
    setLoading(false)
  }, [table, mosqueId, column])

  useEffect(() => {
    void reload()
  }, [reload])

  const save = useCallback(async (patch: Record<string, unknown>): Promise<T> => {
    if (!row) throw new Error('Data belum dimuat')
    const { data, error: err } = await supabase.from(table).update(patch).eq('id', row.id).select()
    if (err) throw err
    if (!data?.length) throw new Error('Anda tidak memiliki izin untuk mengubah data ini.')
    setRow(data[0] as T)
    return data[0] as T
  }, [table, row])

  return { row, loading, error, reload, save }
}
