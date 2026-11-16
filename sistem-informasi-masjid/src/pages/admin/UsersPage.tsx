import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { FormFields } from '@/components/admin/FormFields'
import { Alert, Badge, Button, ConfirmDialog, IconButton, Loading, Modal, PageHeader, Section } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { ROLE_LABEL } from '@/lib/constants'
import { fmtDate } from '@/lib/format'
import { validateForm, type FieldDef, type Values } from '@/lib/form'
import { createEphemeralClient, errorMessage, supabase } from '@/lib/supabase'
import type { AppUser } from '@/lib/types'

const roleOptions = (Object.keys(ROLE_LABEL) as (keyof typeof ROLE_LABEL)[]).map((value) => ({ value, label: ROLE_LABEL[value] }))
const nameField: FieldDef = { name: 'full_name', label: 'Nama lengkap', type: 'text', required: true, minLength: 2, maxLength: 80 }
const roleField: FieldDef = { name: 'role', label: 'Peran', type: 'select', required: true, options: roleOptions }
const createFields: FieldDef[] = [
  nameField,
  { name: 'email', label: 'Email', type: 'email', required: true, maxLength: 120 },
  { name: 'password', label: 'Kata sandi awal', type: 'password', required: true, minLength: 8, maxLength: 72, hint: 'Minimal 8 karakter. Sampaikan kepada pengguna dan minta diganti.' },
  roleField,
]
const editFields: FieldDef[] = [nameField, roleField, { name: 'is_active', label: 'Akun aktif', type: 'toggle', hint: 'Akun nonaktif tidak dapat masuk ke halaman admin', full: true }]

const ROLE_NOTE = [
  ['Super Admin', 'Semua menu, termasuk mengelola pengguna.'],
  ['Admin Masjid', 'Semua menu kecuali pengguna: profil, jadwal salat, konten, keuangan, pengaturan display.'],
  ['Operator Informasi', 'Hanya konten: pengumuman, slideshow, kegiatan, ayat & hadis.'],
]

export default function UsersPage() {
  const { profile, mosqueId, refreshProfile } = useAuth()
  const [rows, setRows] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<AppUser | null>(null)
  const [values, setValues] = useState<Values>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<AppUser | null>(null)

  const reload = useCallback(async () => {
    const { data, error: err } = await supabase.from('users').select('*').order('created_at')
    if (err) setError(errorMessage(err))
    else setRows((data ?? []) as AppUser[])
    setLoading(false)
  }, [])
  useEffect(() => void reload(), [reload])

  const openForm = (m: 'create' | 'edit', user: AppUser | null = null) => {
    setMode(m)
    setEditing(user)
    setErrors({})
    setValues(m === 'create' ? { full_name: '', email: '', password: '', role: 'operator' } : { full_name: user?.full_name ?? '', role: user?.role ?? 'operator', is_active: user?.is_active ?? false })
  }
  const fields = mode === 'create' ? createFields : editFields

  const submit = async () => {
    const errs = validateForm(values, fields)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      if (mode === 'create') {
        // Daftarkan lewat klien sementara agar sesi Super Admin tidak tergantikan.
        const tmp = createEphemeralClient()
        const { data, error: err } = await tmp.auth.signUp({ email: String(values.email).trim().toLowerCase(), password: String(values.password), options: { data: { full_name: String(values.full_name).trim() } } })
        if (err) throw err
        if (!data.user || data.user.identities?.length === 0) throw new Error('Email sudah terdaftar.')
        const { data: updated, error: e2 } = await supabase.from('users')
          .update({ full_name: String(values.full_name).trim(), role: values.role, is_active: true, mosque_id: mosqueId }).eq('id', data.user.id).select()
        if (e2) throw e2
        if (!updated?.length) throw new Error('Akun dibuat tetapi profil belum tersedia. Muat ulang halaman lalu aktifkan dari daftar.')
        toast.success(data.session ? 'Pengguna ditambahkan dan langsung dapat masuk.' : 'Pengguna ditambahkan. Bila konfirmasi email aktif di Supabase, pengguna perlu membuka tautan konfirmasi di emailnya.')
      } else if (mode === 'edit' && editing) {
        const { data, error: err } = await supabase.from('users').update({ full_name: String(values.full_name).trim(), role: values.role, is_active: Boolean(values.is_active) }).eq('id', editing.id).select()
        if (err) throw err
        if (!data?.length) throw new Error('Tidak dapat mengubah pengguna.')
        toast.success('Pengguna diperbarui.')
        if (editing.id === profile?.id) await refreshProfile()
      }
      setMode(null)
      await reload()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!deleting) return
    setSaving(true)
    const { error: err } = await supabase.rpc('admin_delete_user', { p_user_id: deleting.id })
    setSaving(false)
    if (err) return void toast.error(errorMessage(err))
    toast.success('Pengguna dihapus.')
    setDeleting(null)
    await reload()
  }

  return (
    <div>
      <PageHeader title="Manajemen Pengguna" subtitle="Atur siapa saja yang dapat mengelola informasi masjid beserta perannya."
        actions={<Button icon={<Plus />} onClick={() => openForm('create')} data-testid="add-user">Tambah pengguna</Button>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {ROLE_NOTE.map(([r, d]) => (
          <div key={r} className="card flex gap-3 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><div><p className="text-sm font-semibold text-slate-900">{r}</p><p className="text-xs text-slate-500">{d}</p></div></div>
        ))}
      </div>
      <Section title="Daftar pengguna" description="Akun yang mendaftar sendiri berstatus nonaktif sampai diaktifkan Super Admin.">
        {error ? <Alert tone="red">{error}</Alert> : loading ? <Loading /> : (
          <div className="-mx-6 -mb-6 overflow-x-auto border-t border-slate-100">
            <table className="w-full min-w-[640px] text-left text-sm" data-testid="table-users">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-6 py-3">Pengguna</th><th className="px-6 py-3">Peran</th><th className="px-6 py-3">Status</th><th className="px-6 py-3">Terdaftar</th><th className="px-6 py-3 text-right">Aksi</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 font-heading text-sm font-semibold text-emerald-800"><Users className="h-4 w-4" /></span>
                        <div><p className="font-medium text-slate-900">{u.full_name || '(tanpa nama)'} {u.id === profile?.id && <span className="text-xs font-normal text-slate-400">— Anda</span>}</p><p className="text-xs text-slate-500">{u.email}</p></div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5"><Badge tone={u.role === 'super_admin' ? 'amber' : u.role === 'admin_masjid' ? 'green' : 'blue'}>{ROLE_LABEL[u.role]}</Badge></td>
                    <td className="px-6 py-3.5">{u.is_active ? <Badge tone="green">Aktif</Badge> : <Badge tone="red">Nonaktif</Badge>}</td>
                    <td className="px-6 py-3.5 text-slate-600">{fmtDate(u.created_at)}</td>
                    <td className="px-6 py-3.5">
                      <div className="flex justify-end gap-1">
                        <IconButton label={`Edit ${u.email}`} onClick={() => openForm('edit', u)}><Pencil /></IconButton>
                        <IconButton label={`Hapus ${u.email}`} disabled={u.id === profile?.id} className="hover:!bg-red-50 hover:!text-red-600" onClick={() => setDeleting(u)}><Trash2 /></IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Modal open={mode !== null} onClose={() => setMode(null)} title={mode === 'create' ? 'Tambah pengguna' : 'Edit pengguna'}
        footer={<><Button variant="secondary" onClick={() => setMode(null)}>Batal</Button><Button loading={saving} onClick={() => void submit()} data-testid="form-save">Simpan</Button></>}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); void submit() }}>
          <FormFields idPrefix="m-" fields={fields} values={values} errors={errors} mosqueId={mosqueId ?? ''} disabled={saving} columns={1}
            onChange={(patch) => { setValues((v) => ({ ...v, ...patch })); setErrors((e) => { const n = { ...e }; Object.keys(patch).forEach((k) => delete n[k]); return n }) }} />
          <button type="submit" className="hidden" />
        </form>
      </Modal>
      <ConfirmDialog open={!!deleting} title="Hapus pengguna?" loading={saving} onClose={() => setDeleting(null)} onConfirm={() => void remove()}
        message={<>Akun <b>{deleting?.email}</b> akan dihapus permanen dan tidak dapat masuk lagi.</>} />
    </div>
  )
}
