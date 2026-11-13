import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Globe, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { insert, remove, update } from '@/services/db'
import { useAuth } from '@/contexts/AuthContext'
import { useEvent } from '@/contexts/EventContext'
import { useAction } from '@/hooks/useAction'
import { useConfirm } from '@/components/confirm'
import { EmptyState, ImageUpload, Loading, PageHeader } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { SwitchRow } from '@/components/ui/switch'
import { fmtDate, LABELS } from '@/utils/format'
import type { EventRow } from '@/types'

type Draft = Partial<EventRow>
const EMPTY: Draft = { name: '', description: '', location: '', organizer: 'PGRI Kabupaten Way Kanan', status: 'draft', is_public: true, participants_per_district: 3, logo_url: null, start_date: null, end_date: null }

export default function EventsPage() {
  const { isSuperadmin } = useAuth()
  const { events, loading, eventId, setEventId } = useEvent()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { busy, run } = useAction()
  const [draft, setDraft] = useState<Draft | null>(null)
  const set = (patch: Draft) => setDraft((d) => ({ ...d, ...patch }))

  const save = async () => {
    if (!draft) return
    const payload = {
      name: draft.name?.trim(), description: draft.description || null, location: draft.location || null,
      organizer: draft.organizer || null, logo_url: draft.logo_url || null, start_date: draft.start_date || null,
      end_date: draft.end_date || null, status: draft.status, is_public: draft.is_public,
      participants_per_district: Number(draft.participants_per_district) || 3,
    }
    const ok = await run(async () => {
      if (!payload.name) throw new Error('Nama event wajib diisi')
      if (draft.id) await update('events', { id: draft.id }, payload)
      else {
        const [row] = await insert<EventRow>('events', payload)
        setEventId(row.id)
      }
      await qc.invalidateQueries({ queryKey: ['events'] })
    }, 'Event tersimpan')
    if (ok) setDraft(null)
  }

  const del = async (e: EventRow) => {
    const yes = await confirm({
      title: `Hapus event "${e.name}"?`,
      description: 'Seluruh soal, sesi, jawaban, dan hasil pada event ini ikut terhapus permanen.',
      destructive: true, confirmLabel: 'Hapus event',
    })
    if (yes) await run(async () => { await remove('events', { id: e.id }); await qc.invalidateQueries() }, 'Event dihapus')
  }

  return (
    <div>
      <PageHeader
        title="Event Perlombaan"
        description="Setiap event memiliki peserta, bank soal, sesi kompetisi, dan konfigurasi penilaian sendiri."
        actions={isSuperadmin && <Button onClick={() => setDraft(EMPTY)}><Plus /> Event baru</Button>}
      />
      {loading ? <Loading /> : !events.length ? (
        <Card><EmptyState title="Belum ada event" description={isSuperadmin ? 'Buat event pertama untuk mulai menyiapkan lomba.' : 'Anda belum ditugaskan ke event mana pun.'} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {events.map((e) => (
            <Card key={e.id} className={e.id === eventId ? 'ring-2 ring-electric-500' : ''}>
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-start gap-3">
                  {e.logo_url ? <img src={e.logo_url} alt="" className="h-12 w-12 rounded-lg border object-cover" /> : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-white"><CalendarDays className="h-5 w-5" /></span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-heading font-semibold leading-snug text-navy-900">{e.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant={e.status === 'ongoing' ? 'green' : e.status === 'published' ? 'blue' : 'gray'}>{LABELS.eventStatus[e.status]}</Badge>
                      {e.is_public && <Badge variant="outline"><Globe className="h-3 w-3" /> Publik</Badge>}
                    </div>
                  </div>
                </div>
                {e.description && <p className="line-clamp-2 text-sm text-muted-foreground">{e.description}</p>}
                <div className="mt-auto space-y-1 text-xs text-muted-foreground">
                  <p className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> {fmtDate(e.start_date)}{e.end_date && e.end_date !== e.start_date ? ` – ${fmtDate(e.end_date)}` : ''}</p>
                  {e.location && <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {e.location}</p>}
                </div>
                <div className="flex gap-2 border-t pt-3">
                  <Button size="sm" variant={e.id === eventId ? 'secondary' : 'accent'} className="flex-1" disabled={e.id === eventId} onClick={() => setEventId(e.id)}>
                    {e.id === eventId ? 'Sedang dikelola' : 'Kelola event ini'}
                  </Button>
                  {isSuperadmin && (
                    <>
                      <Button size="icon" variant="outline" onClick={() => setDraft(e)} aria-label="Ubah"><Pencil /></Button>
                      <Button size="icon" variant="outline" className="text-red-600" onClick={() => void del(e)} aria-label="Hapus"><Trash2 /></Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>{draft?.id ? 'Ubah event' : 'Event baru'}</DialogTitle></DialogHeader>
          {draft && (
            <DialogBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Nama event" className="sm:col-span-2"><Input value={draft.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder="Lomba Rangking 1 Tingkat Kabupaten" /></Field>
              <Field label="Deskripsi" className="sm:col-span-2"><Textarea value={draft.description ?? ''} onChange={(e) => set({ description: e.target.value })} /></Field>
              <Field label="Penyelenggara"><Input value={draft.organizer ?? ''} onChange={(e) => set({ organizer: e.target.value })} /></Field>
              <Field label="Lokasi"><Input value={draft.location ?? ''} onChange={(e) => set({ location: e.target.value })} /></Field>
              <Field label="Tanggal mulai"><Input type="date" value={draft.start_date ?? ''} onChange={(e) => set({ start_date: e.target.value || null })} /></Field>
              <Field label="Tanggal selesai"><Input type="date" value={draft.end_date ?? ''} onChange={(e) => set({ end_date: e.target.value || null })} /></Field>
              <Field label="Status">
                <SimpleSelect value={draft.status} onChange={(v) => set({ status: v as EventRow['status'] })} options={Object.entries(LABELS.eventStatus).map(([value, label]) => ({ value, label }))} />
              </Field>
              <Field label="Kuota peserta per kecamatan / jenjang" hint="Dipakai sebagai acuan kelengkapan pendaftaran.">
                <Input type="number" min={1} value={draft.participants_per_district ?? 3} onChange={(e) => set({ participants_per_district: Number(e.target.value) })} />
              </Field>
              <div className="sm:col-span-2">
                <SwitchRow label="Tampilkan di halaman publik" hint="Event, jadwal sesi, dan hasil yang diumumkan muncul di landing page." checked={!!draft.is_public} onChange={(v) => set({ is_public: v })} />
              </div>
              <Field label="Logo penyelenggara" className="sm:col-span-2">
                <ImageUpload bucket="branding" value={draft.logo_url} onChange={(url) => set({ logo_url: url })} label="Unggah logo" />
              </Field>
            </DialogBody>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Batal</Button>
            <Button loading={busy} onClick={() => void save()}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
