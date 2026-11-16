import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { SettingsForm, type SettingsSection } from '@/components/admin/SettingsForm'
import { Alert, Button, IconButton, Loading, PageHeader } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { useSingleRow } from '@/hooks/useTable'
import type { Values } from '@/lib/form'
import { removeMedia } from '@/lib/storage'
import type { Contact, MosqueProfile } from '@/lib/types'

const sections: SettingsSection[] = [
  {
    title: 'Identitas masjid', description: 'Tampil di bagian atas layar TV.',
    fields: [
      { name: 'logo_url', label: 'Logo masjid', type: 'file', accept: 'image', folder: 'logo', pathField: 'logo_path', hint: 'Disarankan gambar persegi berlatar transparan (PNG/SVG).' },
      { name: 'name', label: 'Nama masjid', type: 'text', required: true, minLength: 2, maxLength: 120, full: true, placeholder: 'Mis. Masjid Jami’ Al-Ikhlas' },
      { name: 'address', label: 'Alamat lengkap', type: 'textarea', required: true, maxLength: 250, rows: 2, placeholder: 'Jalan, nomor, kelurahan, kecamatan' },
      { name: 'city', label: 'Kota / Kabupaten', type: 'text', maxLength: 80 },
      { name: 'province', label: 'Provinsi', type: 'text', maxLength: 80 },
    ],
  },
  {
    title: 'Tentang masjid',
    fields: [
      { name: 'history', label: 'Sejarah singkat', type: 'textarea', maxLength: 3000, rows: 4 },
      { name: 'vision', label: 'Visi', type: 'textarea', maxLength: 1000, rows: 2 },
      { name: 'mission', label: 'Misi', type: 'textarea', maxLength: 2000, rows: 4, hint: 'Tulis satu misi per baris.' },
    ],
  },
  {
    title: 'Kontak resmi',
    fields: [
      { name: 'phone', label: 'Telepon / WhatsApp', type: 'text', maxLength: 30, pattern: { regex: /^[0-9+() -]{6,}$/, message: 'Nomor telepon tidak valid' } },
      { name: 'email', label: 'Email', type: 'email', maxLength: 120 },
      { name: 'website', label: 'Situs web / media sosial', type: 'text', maxLength: 200, full: true },
    ],
  },
]

export default function ProfilePage() {
  const { mosqueId } = useAuth()
  const { row, loading, error, save } = useSingleRow<MosqueProfile>('mosque_profiles', mosqueId, 'id')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactErrors, setContactErrors] = useState<Record<number, string>>({})
  useEffect(() => setContacts(row?.contacts ?? []), [row])

  if (loading) return <Loading />
  if (error || !row) return <Alert tone="red">{error ?? 'Profil masjid tidak ditemukan.'}</Alert>

  const dirtyContacts = JSON.stringify(contacts) !== JSON.stringify(row.contacts ?? [])
  const setContact = (i: number, patch: Partial<Contact>) => setContacts((list) => list.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  const validate = (): Record<string, string> => {
    const errs: Record<number, string> = {}
    contacts.forEach((c, i) => {
      if (!c.name.trim()) errs[i] = 'Nama wajib diisi'
      else if (!/^[0-9+() -]{6,}$/.test(c.phone.trim())) errs[i] = 'Nomor telepon tidak valid'
    })
    setContactErrors(errs)
    return Object.keys(errs).length ? { contacts: 'Periksa kontak pengurus' } : {}
  }

  const contactSection: SettingsSection = {
    title: 'Kontak pengurus', description: 'Tampil bergantian di panel informasi layar TV (maksimal 4 teratas).', fields: [],
    extra: () => (
      <div className="space-y-3">
        {contacts.length === 0 && <p className="text-sm text-slate-500">Belum ada kontak pengurus.</p>}
        {contacts.map((c, i) => (
          <div key={i}>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <input className="input" placeholder="Nama" aria-label={`Nama pengurus ${i + 1}`} value={c.name} maxLength={80} onChange={(e) => setContact(i, { name: e.target.value })} />
              <input className="input" placeholder="Jabatan (mis. Ketua DKM)" aria-label={`Jabatan pengurus ${i + 1}`} value={c.position} maxLength={60} onChange={(e) => setContact(i, { position: e.target.value })} />
              <input className="input" placeholder="No. telepon / WA" aria-label={`Telepon pengurus ${i + 1}`} value={c.phone} maxLength={30} onChange={(e) => setContact(i, { phone: e.target.value })} />
              <IconButton label={`Hapus kontak ${i + 1}`} className="mt-1 hover:!bg-red-50 hover:!text-red-600" onClick={() => setContacts((l) => l.filter((_, j) => j !== i))}><Trash2 /></IconButton>
            </div>
            {contactErrors[i] && <p className="mt-1 text-xs font-medium text-red-600">{contactErrors[i]}</p>}
          </div>
        ))}
        <Button variant="secondary" size="sm" icon={<Plus />} disabled={contacts.length >= 8} onClick={() => setContacts((l) => [...l, { name: '', position: '', phone: '' }])}>Tambah kontak</Button>
      </div>
    ),
  }

  return (
    <div>
      <PageHeader title="Profil Masjid" subtitle="Identitas masjid yang tampil di layar informasi." />
      <SettingsForm row={row as unknown as Values} sections={[...sections.slice(0, 1), contactSection, ...sections.slice(1)]}
        validate={validate} extraDirty={dirtyContacts} onReset={() => { setContacts(row.contacts ?? []); setContactErrors({}) }}
        extraPayload={() => ({ contacts: contacts.map((c) => ({ name: c.name.trim(), position: c.position.trim(), phone: c.phone.trim() })) })}
        onSave={async (payload) => {
          const oldLogo = row.logo_path
          await save(payload)
          if (oldLogo && oldLogo !== payload.logo_path) void removeMedia(oldLogo)
        }} />
    </div>
  )
}
