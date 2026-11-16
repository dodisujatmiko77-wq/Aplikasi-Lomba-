import { useMemo, useState, type ReactNode } from 'react'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, Button, ConfirmDialog, EmptyState, IconButton, Loading, Modal, PageHeader, Toggle } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { useTable, type Order } from '@/hooks/useTable'
import { fromForm, mergeErrors, toForm, validateForm, type ExtraErrors, type FieldDef, type Values } from '@/lib/form'
import { removeMedia } from '@/lib/storage'
import { errorMessage, supabase } from '@/lib/supabase'
import { FormFields } from './FormFields'

export interface Column<T> {
  header: string
  render: (row: T) => ReactNode
  className?: string
}

export interface RowApi<T> {
  rows: T[]
  reload: () => Promise<void>
}

interface Props<T> {
  table: string
  title?: string
  subtitle?: string
  /** kata benda tunggal, mis. "pengumuman" */
  noun: string
  icon: ReactNode
  fields: FieldDef[]
  columns: Column<T>[]
  defaults: Values
  order: Order[]
  canWrite?: boolean
  searchKeys?: (keyof T & string)[]
  /** validasi lintas kolom */
  validate?: (values: Values) => ExtraErrors
  /** baris → nilai formulir (bila ada kolom formulir yang bukan kolom tabel) */
  load?: (row: T) => Values
  /** penyesuaian payload sebelum disimpan */
  prepare?: (payload: Values, editing: T | null, rows: T[]) => Values
  rowLabel: (row: T) => string
  extraActions?: (row: T, api: RowApi<T>, index: number) => ReactNode
  filter?: (row: T) => boolean
  toolbar?: ReactNode
  above?: (api: RowApi<T>) => ReactNode
  /** catat pembuat (kolom created_by) */
  stampCreator?: boolean
  embedded?: boolean
}

type Row = { id: string; is_active?: boolean }

/** Halaman daftar + tambah/edit/hapus untuk satu tabel. Semua modul konten memakai komponen ini. */
export function CrudPage<T extends Row>(p: Props<T>) {
  const { mosqueId, session } = useAuth()
  const canWrite = p.canWrite ?? true
  const { rows, loading, error, reload } = useTable<T>(p.table, mosqueId, p.order)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<T | null>(null)
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Values>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<T | null>(null)
  const [busyDelete, setBusyDelete] = useState(false)

  const fileFields = useMemo(() => p.fields.filter((f) => f.type === 'file' && f.pathField), [p.fields])
  const hasActive = rows.length > 0 && 'is_active' in rows[0]

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => (!p.filter || p.filter(r)) && (!q || !p.searchKeys || p.searchKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(q))))
  }, [rows, query, p])

  const startAdd = () => {
    setEditing(null)
    setValues(toForm(p.defaults, p.fields))
    setErrors({})
    setOpen(true)
  }
  const startEdit = (row: T) => {
    setEditing(row)
    setValues(toForm(p.load ? p.load(row) : (row as unknown as Values), p.fields))
    setErrors({})
    setOpen(true)
  }
  const close = () => {
    // berkas yang sudah diunggah tetapi batal disimpan → bersihkan dari storage
    for (const f of fileFields) {
      const fresh = values[f.pathField!] as string | null
      const original = (editing as unknown as Values | null)?.[f.pathField!] as string | null | undefined
      if (fresh && fresh !== original) void removeMedia(fresh)
    }
    setOpen(false)
  }

  const submit = async () => {
    const errs = mergeErrors(validateForm(values, p.fields), p.validate?.(values))
    setErrors(errs)
    if (Object.keys(errs).length) return void toast.error('Periksa kembali isian yang ditandai merah.')
    if (!mosqueId) return
    setSaving(true)
    try {
      let payload = fromForm(values, p.fields, (editing ?? {}) as unknown as Values)
      if (p.prepare) payload = p.prepare(payload, editing, rows)
      if (editing) {
        const { data, error: err } = await supabase.from(p.table).update(payload).eq('id', editing.id).select()
        if (err) throw err
        if (!data?.length) throw new Error('Anda tidak memiliki izin untuk mengubah data ini.')
        for (const f of fileFields) {
          const old = (editing as unknown as Values)[f.pathField!] as string | null
          if (old && old !== payload[f.pathField!]) void removeMedia(old)
        }
      } else {
        const insert = { ...payload, mosque_id: mosqueId, ...(p.stampCreator ? { created_by: session?.user.id } : {}) }
        const { error: err } = await supabase.from(p.table).insert(insert).select()
        if (err) throw err
      }
      toast.success(`${cap(p.noun)} berhasil ${editing ? 'diperbarui' : 'ditambahkan'}.`)
      setOpen(false)
      await reload()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setBusyDelete(true)
    try {
      const { data, error: err } = await supabase.from(p.table).delete().eq('id', deleting.id).select()
      if (err) throw err
      if (!data?.length) throw new Error('Anda tidak memiliki izin untuk menghapus data ini.')
      for (const f of fileFields) void removeMedia((deleting as unknown as Values)[f.pathField!] as string | null)
      toast.success(`${cap(p.noun)} dihapus.`)
      setDeleting(null)
      await reload()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusyDelete(false)
    }
  }

  const toggleActive = async (row: T, is_active: boolean) => {
    const { data, error: err } = await supabase.from(p.table).update({ is_active }).eq('id', row.id).select()
    if (err || !data?.length) return void toast.error(err ? errorMessage(err) : 'Tidak dapat mengubah status.')
    toast.success(is_active ? 'Diaktifkan — tampil di layar.' : 'Dinonaktifkan — disembunyikan dari layar.')
    await reload()
  }

  const addButton = canWrite && <Button icon={<Plus />} onClick={startAdd} data-testid={`add-${p.table}`}>Tambah {p.noun}</Button>
  const api: RowApi<T> = { rows, reload }

  return (
    <div>
      {!p.embedded && p.title && <PageHeader title={p.title} subtitle={p.subtitle} actions={addButton} />}
      {p.above?.(api)}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3.5">
          {p.searchKeys && (
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder={`Cari ${p.noun}…`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={`Cari ${p.noun}`} />
            </div>
          )}
          {p.toolbar}
          <span className="ml-auto text-xs text-slate-500">{shown.length} data</span>
          {p.embedded && addButton}
        </div>

        {error ? (
          <div className="p-5"><Alert tone="red">{error}</Alert></div>
        ) : loading ? (
          <Loading />
        ) : shown.length === 0 ? (
          <EmptyState icon={p.icon} title={rows.length ? 'Tidak ada data yang cocok' : `Belum ada ${p.noun}`}
            text={rows.length ? 'Ubah kata kunci atau filter pencarian.' : canWrite ? `Tambahkan ${p.noun} pertama agar tampil di layar informasi masjid.` : undefined}
            action={!rows.length && addButton} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm" data-testid={`table-${p.table}`}>
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  {p.columns.map((c) => <th key={c.header} className={`px-5 py-3 ${c.className ?? ''}`}>{c.header}</th>)}
                  {hasActive && <th className="px-5 py-3">Tayang</th>}
                  {canWrite && <th className="px-5 py-3 text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((row, i) => (
                  <tr key={row.id} className="align-middle hover:bg-slate-50/60">
                    {p.columns.map((c) => <td key={c.header} className={`px-5 py-3.5 ${c.className ?? ''}`}>{c.render(row)}</td>)}
                    {hasActive && (
                      <td className="px-5 py-3.5">
                        <Toggle checked={!!row.is_active} disabled={!canWrite} onChange={(v) => void toggleActive(row, v)} label={`Tayangkan ${p.rowLabel(row)}`} />
                      </td>
                    )}
                    {canWrite && (
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          {p.extraActions?.(row, api, i)}
                          <IconButton label={`Edit ${p.rowLabel(row)}`} onClick={() => startEdit(row)}><Pencil /></IconButton>
                          <IconButton label={`Hapus ${p.rowLabel(row)}`} className="hover:!bg-red-50 hover:!text-red-600" onClick={() => setDeleting(row)}><Trash2 /></IconButton>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={open} onClose={close} title={`${editing ? 'Edit' : 'Tambah'} ${p.noun}`} wide
        footer={<><Button variant="secondary" onClick={close}>Batal</Button><Button loading={saving} onClick={() => void submit()} data-testid="form-save">Simpan</Button></>}>
        <form onSubmit={(e) => { e.preventDefault(); void submit() }} noValidate>
          <FormFields idPrefix="m-" fields={p.fields} values={values} errors={errors} mosqueId={mosqueId ?? ''} disabled={saving}
            onChange={(patch) => { setValues((v) => ({ ...v, ...patch })); setErrors((e) => { const n = { ...e }; Object.keys(patch).forEach((k) => delete n[k]); return n }) }} />
          <button type="submit" className="hidden" />
        </form>
      </Modal>

      <ConfirmDialog open={!!deleting} title={`Hapus ${p.noun}?`} loading={busyDelete} onClose={() => setDeleting(null)} onConfirm={() => void confirmDelete()}
        message={<>Anda akan menghapus <b>{deleting ? p.rowLabel(deleting) : ''}</b>. Tindakan ini tidak dapat dibatalkan.</>} />
    </div>
  )
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Validasi umum: tanggal selesai tidak boleh sebelum tanggal mulai. */
export function validateDateRange(v: Values): ExtraErrors {
  const a = String(v.start_date ?? ''), b = String(v.end_date ?? '')
  return a && b && b < a ? { end_date: 'Tanggal selesai tidak boleh sebelum tanggal mulai' } : {}
}
