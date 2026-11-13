import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, Copy, MonitorPlay, Play, Plus, Settings2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { insert, list, remove } from '@/services/db'
import { useAuth } from '@/contexts/AuthContext'
import { useLevels } from '@/contexts/EventContext'
import { useAction } from '@/hooks/useAction'
import { useConfirm } from '@/components/confirm'
import { NeedEvent } from '@/features/auth/guards'
import { EmptyState, Loading, PageHeader, SessionStatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { fmtDateTime } from '@/utils/format'
import type { CompetitionSession } from '@/types'

function Inner({ eventId }: { eventId: string }) {
  const { can } = useAuth()
  const { levels, levelMap } = useLevels()
  const qc = useQueryClient()
  const nav = useNavigate()
  const confirm = useConfirm()
  const { busy, run } = useAction()
  const canControl = can(eventId, 'control')
  const [draft, setDraft] = useState<{ name: string; education_level_id: string; scheduled_at: string } | null>(null)
  const { data = [], isLoading } = useQuery({
    queryKey: ['sessions', eventId],
    queryFn: () => list<CompetitionSession>('competition_sessions', { filters: { event_id: eventId }, order: [{ column: 'created_at', ascending: false }] }),
    refetchInterval: 10_000,
  })
  const reload = () => qc.invalidateQueries({ queryKey: ['sessions', eventId] })

  const create = async () => {
    if (!draft) return
    let id = ''
    const ok = await run(async () => {
      if (!draft.name.trim()) throw new Error('Nama sesi wajib diisi')
      if (!draft.education_level_id) throw new Error('Pilih jenjang')
      const [row] = await insert<CompetitionSession>('competition_sessions', {
        event_id: eventId, name: draft.name.trim(), education_level_id: draft.education_level_id,
        scheduled_at: draft.scheduled_at ? new Date(draft.scheduled_at).toISOString() : null,
      })
      id = row.id
      await reload()
    }, 'Sesi dibuat')
    if (ok) { setDraft(null); nav(`/admin/sessions/${id}`) }
  }
  const del = async (s: CompetitionSession) => {
    if (await confirm({ title: `Hapus sesi "${s.name}"?`, destructive: true, description: 'Hanya sesi draf atau dibatalkan yang dapat dihapus oleh Admin.' }))
      await run(async () => { await remove('competition_sessions', { id: s.id }); await reload() }, 'Sesi dihapus')
  }
  const copy = (path: string) => { void navigator.clipboard.writeText(location.origin + path); toast.success('Tautan disalin') }

  return (
    <div>
      <PageHeader title="Sesi Kompetisi" description="Satu sesi = satu jenjang. Atur peserta, babak, dan soal, lalu jalankan dari panel kontrol."
        actions={canControl && <Button onClick={() => setDraft({ name: '', education_level_id: levels[0]?.id ?? '', scheduled_at: '' })}><Plus /> Sesi baru</Button>} />
      <Card>
        {isLoading ? <Loading /> : !data.length ? <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="Belum ada sesi" description="Buat sesi untuk setiap jenjang yang akan dilombakan." /> : (
          <Table>
            <THead><TR><TH>Sesi</TH><TH>Jenjang</TH><TH>Kode</TH><TH>Jadwal</TH><TH>Status</TH><TH className="text-right">Aksi</TH></TR></THead>
            <TBody>
              {data.map((s) => (
                <TR key={s.id}>
                  <TD className="font-semibold text-navy-900">{s.name}</TD>
                  <TD>{levelMap.get(s.education_level_id)?.name}</TD>
                  <TD className="font-mono text-xs font-semibold tracking-wider">{s.code}</TD>
                  <TD className="whitespace-nowrap text-muted-foreground">{s.scheduled_at ? fmtDateTime(s.scheduled_at) : '—'}</TD>
                  <TD><SessionStatusBadge status={s.status} /></TD>
                  <TD className="whitespace-nowrap text-right">
                    <Button size="sm" variant="outline" asChild><Link to={`/admin/sessions/${s.id}`}><Settings2 /> Atur</Link></Button>{' '}
                    {canControl && <Button size="sm" variant="accent" asChild><Link to={`/admin/control/${s.id}`}><Play /> Kontrol</Link></Button>}{' '}
                    <Button size="icon" variant="ghost" onClick={() => copy(`/live/${s.code}`)} aria-label="Salin tautan monitor"><Copy /></Button>
                    <Button size="icon" variant="ghost" asChild><a href={`/live/${s.code}`} target="_blank" rel="noreferrer" aria-label="Buka monitor"><MonitorPlay /></a></Button>
                    {canControl && ['draft', 'cancelled'].includes(s.status) && <Button size="icon" variant="ghost" className="text-red-600" onClick={() => void del(s)} aria-label="Hapus"><Trash2 /></Button>}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Sesi baru</DialogTitle></DialogHeader>
          {draft && (
            <DialogBody className="space-y-4">
              <Field label="Nama sesi"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Final SMP" autoFocus /></Field>
              <Field label="Jenjang"><SimpleSelect value={draft.education_level_id} onChange={(v) => setDraft({ ...draft, education_level_id: v })} options={levels.map((l) => ({ value: l.id, label: l.name }))} /></Field>
              <Field label="Jadwal (opsional)"><Input type="datetime-local" value={draft.scheduled_at} onChange={(e) => setDraft({ ...draft, scheduled_at: e.target.value })} /></Field>
            </DialogBody>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setDraft(null)}>Batal</Button><Button loading={busy} onClick={() => void create()}>Buat sesi</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function SessionsPage() {
  return <NeedEvent>{(id) => <Inner key={id} eventId={id} />}</NeedEvent>
}
