// Data Kecamatan & Data Jenjang — master data global. Hanya Superadmin yang dapat mengubah.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { insert, list, listByIds, remove, update } from '@/services/db'
import { useAuth } from '@/contexts/AuthContext'
import { useEvent } from '@/contexts/EventContext'
import { useAction } from '@/hooks/useAction'
import { useConfirm } from '@/components/confirm'
import { EmptyState, Loading, PageHeader } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { SwitchRow } from '@/components/ui/switch'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import type { EventParticipant, Participant } from '@/types'

interface MasterRow { id: string; name: string; code: string | null; sort_order: number; is_active: boolean }

function MasterPage({ table, title, description, noun, codeHint }: { table: 'districts' | 'education_levels'; title: string; description: string; noun: string; codeHint: string }) {
  const { isSuperadmin } = useAuth()
  const { eventId, event } = useEvent()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { busy, run } = useAction()
  const [draft, setDraft] = useState<Partial<MasterRow> | null>(null)
  const { data: rows = [], isLoading } = useQuery({ queryKey: [table], queryFn: () => list<MasterRow>(table, { order: [{ column: 'sort_order' }, { column: 'name' }] }) })
  // jumlah peserta event aktif per baris (kelengkapan pendaftaran)
  const { data: counts } = useQuery({
    queryKey: ['master-counts', table, eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const eps = await list<EventParticipant>('event_participants', { filters: { event_id: eventId! } })
      const ps = await listByIds<Participant>('participants', eps.map((e) => e.participant_id))
      const m = new Map<string, number>()
      for (const p of ps) {
        const k = table === 'districts' ? p.district_id : p.education_level_id
        m.set(k, (m.get(k) ?? 0) + 1)
      }
      return m
    },
  })

  const save = async () => {
    if (!draft) return
    const payload = { name: draft.name?.trim(), code: draft.code?.trim() || null, sort_order: Number(draft.sort_order) || 0, is_active: draft.is_active ?? true }
    const ok = await run(async () => {
      if (!payload.name) throw new Error(`Nama ${noun} wajib diisi`)
      if (table === 'education_levels' && !payload.code) throw new Error('Kode jenjang wajib diisi')
      if (draft.id) await update(table, { id: draft.id }, payload)
      else await insert(table, payload)
      await qc.invalidateQueries({ queryKey: [table] })
    }, 'Tersimpan')
    if (ok) setDraft(null)
  }
  const del = async (r: MasterRow) => {
    if (await confirm({ title: `Hapus ${noun} "${r.name}"?`, description: `${noun[0].toUpperCase() + noun.slice(1)} yang masih dipakai peserta tidak dapat dihapus; nonaktifkan saja.`, destructive: true }))
      await run(async () => { await remove(table, { id: r.id }); await qc.invalidateQueries({ queryKey: [table] }) }, 'Dihapus')
  }

  return (
    <div>
      <PageHeader title={title} description={description}
        actions={isSuperadmin && <Button onClick={() => setDraft({ name: '', code: '', sort_order: rows.length + 1, is_active: true })}><Plus /> Tambah {noun}</Button>} />
      <Card>
        {isLoading ? <Loading /> : !rows.length ? <EmptyState title={`Belum ada ${noun}`} /> : (
          <Table>
            <THead><TR><TH className="w-16">Urut</TH><TH>Nama</TH><TH>Kode</TH><TH>Status</TH><TH className="text-right">Peserta{event ? ' (event aktif)' : ''}</TH>{isSuperadmin && <TH className="w-24" />}</TR></THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="tabular text-muted-foreground">{r.sort_order}</TD>
                  <TD className="font-medium text-navy-900">{r.name}</TD>
                  <TD className="font-mono text-xs">{r.code ?? '—'}</TD>
                  <TD><Badge variant={r.is_active ? 'green' : 'gray'}>{r.is_active ? 'Aktif' : 'Nonaktif'}</Badge></TD>
                  <TD className="tabular text-right">{counts?.get(r.id) ?? 0}</TD>
                  {isSuperadmin && (
                    <TD className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => setDraft(r)} aria-label="Ubah"><Pencil /></Button>
                      <Button size="icon" variant="ghost" className="text-red-600" onClick={() => void del(r)} aria-label="Hapus"><Trash2 /></Button>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      {!isSuperadmin && <p className="mt-3 text-xs text-muted-foreground">Data ini dikelola Superadmin.</p>}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{draft?.id ? `Ubah ${noun}` : `Tambah ${noun}`}</DialogTitle></DialogHeader>
          {draft && (
            <DialogBody className="space-y-4">
              <Field label="Nama"><Input value={draft.name ?? ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus /></Field>
              <Field label="Kode" hint={codeHint}><Input value={draft.code ?? ''} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} /></Field>
              <Field label="Urutan tampil"><Input type="number" value={draft.sort_order ?? 0} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })} /></Field>
              <SwitchRow label="Aktif" checked={draft.is_active ?? true} onChange={(v) => setDraft({ ...draft, is_active: v })} />
            </DialogBody>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setDraft(null)}>Batal</Button><Button loading={busy} onClick={() => void save()}>Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export const DistrictsPage = () => (
  <MasterPage table="districts" noun="kecamatan" title="Data Kecamatan" codeHint="Opsional, mis. BRD. Dapat dipakai pada kolom Kecamatan saat impor Excel."
    description="Daftar wilayah asal peserta. Kecamatan dapat ditambah kapan saja untuk event lain." />
)
export const LevelsPage = () => (
  <MasterPage table="education_levels" noun="jenjang" title="Data Jenjang" codeHint="Wajib dan unik, mis. SD, SMP, SMA."
    description="Jenjang pendidikan peserta. Setiap sesi kompetisi berlaku untuk satu jenjang." />
)
