import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone, Pencil, Plus, Trash2 } from 'lucide-react'
import { getOne, insert, list, remove, update } from '@/services/db'
import { useAuth } from '@/contexts/AuthContext'
import { useAction } from '@/hooks/useAction'
import { useConfirm } from '@/components/confirm'
import { NeedEvent } from '@/features/auth/guards'
import { ScoringForm, type ScoringValues } from './ScoringForm'
import { EmptyState, Loading, PageHeader } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { SwitchRow } from '@/components/ui/switch'
import { fmtDateTime, toLocalInput } from '@/utils/format'
import type { EventSettings } from '@/types'

interface Announcement { id: string; event_id: string; type: 'info' | 'schedule' | 'winner'; title: string; body: string | null; scheduled_at: string | null; is_published: boolean; created_at: string }
const TYPE_LABEL = { info: 'Informasi', schedule: 'Jadwal', winner: 'Pemenang' }

function Inner({ eventId }: { eventId: string }) {
  const { isSuperadmin, can } = useAuth()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { busy, run } = useAction()
  const canAnnounce = can(eventId, 'control')
  const settings = useQuery({ queryKey: ['event_settings', eventId], queryFn: () => getOne<EventSettings>('event_settings', { event_id: eventId }) })
  const ann = useQuery({ queryKey: ['announcements', eventId], queryFn: () => list<Announcement>('announcements', { filters: { event_id: eventId }, order: [{ column: 'created_at', ascending: false }] }) })
  const [form, setForm] = useState<(ScoringValues & { leaderboard_size: number }) | null>(null)
  const [draft, setDraft] = useState<Partial<Announcement> | null>(null)
  useEffect(() => { if (settings.data) setForm({ ...settings.data }) }, [settings.data])

  const save = () => run(async () => {
    if (!form) return
    await update('event_settings', { event_id: eventId }, {
      base_points: form.base_points, speed_bonus: form.speed_bonus, wrong_penalty: form.wrong_penalty, duration_seconds: form.duration_seconds,
      lead_seconds: form.lead_seconds, rounding_mode: form.rounding_mode, rounding_decimals: form.rounding_decimals, leaderboard_size: form.leaderboard_size,
    })
    await qc.invalidateQueries({ queryKey: ['event_settings', eventId] })
  }, 'Pengaturan penilaian tersimpan')

  const saveAnn = async () => {
    if (!draft) return
    const payload = { title: draft.title?.trim(), body: draft.body || null, type: draft.type ?? 'info', is_published: draft.is_published ?? true, scheduled_at: draft.scheduled_at ? new Date(draft.scheduled_at).toISOString() : null }
    const ok = await run(async () => {
      if (!payload.title) throw new Error('Judul wajib diisi')
      if (draft.id) await update('announcements', { id: draft.id }, payload)
      else await insert('announcements', { ...payload, event_id: eventId })
      await qc.invalidateQueries({ queryKey: ['announcements', eventId] })
    }, 'Pengumuman tersimpan')
    if (ok) setDraft(null)
  }

  return (
    <div>
      <PageHeader title="Pengaturan Event" description="Konfigurasi penilaian default untuk event ini dan pengumuman yang tampil di halaman publik." />
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Penilaian cepat & tepat</CardTitle>
            <CardDescription>Menjadi nilai awal setiap babak baru. Setiap babak dapat menimpanya saat disiapkan.{!isSuperadmin && ' Hanya Superadmin yang dapat mengubah.'}</CardDescription>
          </CardHeader>
          <CardContent>
            {!form ? <Loading /> : (
              <>
                <ScoringForm value={form} onChange={(v) => setForm({ ...form, ...v })} disabled={!isSuperadmin} />
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <Field label="Jumlah baris leaderboard di monitor"><Input type="number" min={3} max={50} disabled={!isSuperadmin} value={form.leaderboard_size} onChange={(e) => setForm({ ...form, leaderboard_size: Number(e.target.value) })} /></Field>
                </div>
                {isSuperadmin && <Button className="mt-5" loading={busy} onClick={() => void save()}>Simpan pengaturan</Button>}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader className="flex-row items-center justify-between">
            <div><CardTitle>Pengumuman</CardTitle><CardDescription>Tampil di landing page bila event bersifat publik.</CardDescription></div>
            {canAnnounce && <Button size="sm" onClick={() => setDraft({ type: 'info', is_published: true })}><Plus /> Baru</Button>}
          </CardHeader>
          <CardContent>
            {ann.isLoading ? <Loading /> : !ann.data?.length ? <EmptyState icon={<Megaphone className="h-6 w-6" />} title="Belum ada pengumuman" /> : (
              <ul className="divide-y">
                {ann.data.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-navy-900">{a.title}</p>
                      {a.body && <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{a.body}</p>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <Badge variant={a.type === 'winner' ? 'orange' : a.type === 'schedule' ? 'blue' : 'default'}>{TYPE_LABEL[a.type]}</Badge>
                        {!a.is_published && <Badge variant="gray">Draf</Badge>}
                        {a.scheduled_at && <span>{fmtDateTime(a.scheduled_at)}</span>}
                      </div>
                    </div>
                    {canAnnounce && (
                      <div className="flex shrink-0">
                        <Button size="icon" variant="ghost" onClick={() => setDraft({ ...a, scheduled_at: toLocalInput(a.scheduled_at) })} aria-label="Ubah"><Pencil /></Button>
                        <Button size="icon" variant="ghost" className="text-red-600" aria-label="Hapus" onClick={async () => {
                          if (await confirm({ title: 'Hapus pengumuman ini?', destructive: true })) await run(async () => { await remove('announcements', { id: a.id }); await qc.invalidateQueries({ queryKey: ['announcements', eventId] }) }, 'Dihapus')
                        }}><Trash2 /></Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{draft?.id ? 'Ubah pengumuman' : 'Pengumuman baru'}</DialogTitle></DialogHeader>
          {draft && (
            <DialogBody className="space-y-4">
              <Field label="Judul"><Input value={draft.title ?? ''} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus /></Field>
              <Field label="Isi"><Textarea rows={4} value={draft.body ?? ''} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Jenis"><SimpleSelect value={draft.type ?? 'info'} onChange={(v) => setDraft({ ...draft, type: v as Announcement['type'] })} options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))} /></Field>
                <Field label="Waktu kegiatan (opsional)"><Input type="datetime-local" value={draft.scheduled_at ?? ''} onChange={(e) => setDraft({ ...draft, scheduled_at: e.target.value })} /></Field>
              </div>
              <SwitchRow label="Publikasikan" checked={draft.is_published ?? true} onChange={(v) => setDraft({ ...draft, is_published: v })} />
            </DialogBody>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setDraft(null)}>Batal</Button><Button loading={busy} onClick={() => void saveAnn()}>Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function SettingsPage() {
  return <NeedEvent>{(id) => <Inner key={id} eventId={id} />}</NeedEvent>
}
