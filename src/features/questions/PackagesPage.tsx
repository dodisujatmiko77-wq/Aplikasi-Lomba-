import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ListChecks, Package, Pencil, Plus, Shuffle, Trash2 } from 'lucide-react'
import { insert, list, listByIds, remove, update } from '@/services/db'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useLevels } from '@/contexts/EventContext'
import { useAction } from '@/hooks/useAction'
import { useConfirm } from '@/components/confirm'
import { NeedEvent } from '@/features/auth/guards'
import { useQuestionBank } from './QuestionsPage'
import { EmptyState, Loading, PageHeader, SearchInput } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { Checkbox, SwitchRow } from '@/components/ui/switch'
import { LABELS } from '@/utils/format'
import type { PackageQuestion, QuestionPackage } from '@/types'

type Draft = Partial<QuestionPackage>

function Inner({ eventId }: { eventId: string }) {
  const { can } = useAuth()
  const { levels, levelMap } = useLevels()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { busy, run } = useAction()
  const canEdit = can(eventId, 'questions')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [picking, setPicking] = useState<QuestionPackage | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [randomN, setRandomN] = useState(10)

  const bank = useQuestionBank(eventId)
  const { data, isLoading } = useQuery({
    queryKey: ['packages', eventId],
    queryFn: async () => {
      const packages = await list<QuestionPackage>('question_packages', { filters: { event_id: eventId }, order: [{ column: 'created_at' }] })
      const links = await listByIds<PackageQuestion>('package_questions', packages.map((p) => p.id), 'package_id')
      return { packages, links }
    },
  })
  const reload = () => qc.invalidateQueries({ queryKey: ['packages', eventId] })
  const linksOf = (id: string) => (data?.links ?? []).filter((l) => l.package_id === id).sort((a, b) => a.sort_order - b.sort_order)

  const save = async () => {
    if (!draft) return
    const payload = { name: draft.name?.trim(), description: draft.description || null, education_level_id: draft.education_level_id || null, shuffle_questions: !!draft.shuffle_questions, shuffle_options: !!draft.shuffle_options }
    const ok = await run(async () => {
      if (!payload.name) throw new Error('Nama paket wajib diisi')
      if (draft.id) await update('question_packages', { id: draft.id }, payload)
      else await insert('question_packages', { ...payload, event_id: eventId })
      await reload()
    }, 'Paket tersimpan')
    if (ok) setDraft(null)
  }
  const del = async (p: QuestionPackage) => {
    if (await confirm({ title: `Hapus paket "${p.name}"?`, description: 'Soal di bank soal tidak ikut terhapus.', destructive: true }))
      await run(async () => { await remove('question_packages', { id: p.id }); await reload() }, 'Paket dihapus')
  }

  const openPick = (p: QuestionPackage) => { setPicking(p); setPicked(linksOf(p.id).map((l) => l.question_id)); setSearch('') }
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (bank.data?.questions ?? []).filter((x) => x.is_active && (!picking?.education_level_id || !x.education_level_id || x.education_level_id === picking.education_level_id) && (!q || x.question_text.toLowerCase().includes(q)))
  }, [bank.data, picking, search])
  const pickRandom = () => {
    const pool = candidates.map((c) => c.id).filter((id) => !picked.includes(id))
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]] }
    setPicked([...picked, ...pool.slice(0, Math.max(0, randomN))])
  }
  const savePick = async () => {
    if (!picking) return
    const ok = await run(async () => {
      const { error } = await supabase.from('package_questions').delete().eq('package_id', picking.id)
      if (error) throw new Error(error.message)
      if (picked.length) await insert('package_questions', picked.map((question_id, i) => ({ package_id: picking.id, question_id, sort_order: i + 1 })))
      await reload()
    }, 'Isi paket diperbarui')
    if (ok) setPicking(null)
  }

  return (
    <div>
      <PageHeader title="Paket Soal" description="Kelompokkan soal dari bank soal menjadi paket siap pakai untuk sebuah babak."
        actions={canEdit && <Button onClick={() => setDraft({ name: '', shuffle_questions: false, shuffle_options: false })}><Plus /> Paket baru</Button>} />
      {isLoading ? <Loading /> : !data?.packages.length ? (
        <Card><EmptyState icon={<Package className="h-6 w-6" />} title="Belum ada paket soal" description="Buat paket lalu pilih soal dari bank soal." /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.packages.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <div>
                  <p className="font-heading font-semibold text-navy-900">{p.name}</p>
                  {p.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="blue">{linksOf(p.id).length} soal</Badge>
                  <Badge>{p.education_level_id ? levelMap.get(p.education_level_id)?.name : 'Semua jenjang'}</Badge>
                  {p.shuffle_questions && <Badge variant="orange"><Shuffle className="h-3 w-3" /> Acak soal</Badge>}
                  {p.shuffle_options && <Badge variant="orange"><Shuffle className="h-3 w-3" /> Acak opsi</Badge>}
                </div>
                {canEdit && (
                  <div className="mt-auto flex gap-2 border-t pt-3">
                    <Button size="sm" variant="accent" className="flex-1" onClick={() => openPick(p)}><ListChecks /> Pilih soal</Button>
                    <Button size="icon" variant="outline" onClick={() => setDraft(p)} aria-label="Ubah"><Pencil /></Button>
                    <Button size="icon" variant="outline" className="text-red-600" onClick={() => void del(p)} aria-label="Hapus"><Trash2 /></Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{draft?.id ? 'Ubah paket' : 'Paket baru'}</DialogTitle></DialogHeader>
          {draft && (
            <DialogBody className="space-y-4">
              <Field label="Nama paket"><Input value={draft.name ?? ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Paket Penyisihan SMP" autoFocus /></Field>
              <Field label="Deskripsi"><Textarea value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
              <Field label="Jenjang"><SimpleSelect value={draft.education_level_id ?? ''} onChange={(v) => setDraft({ ...draft, education_level_id: v || null })} allLabel="Semua jenjang" options={levels.map((l) => ({ value: l.id, label: l.name }))} /></Field>
              <SwitchRow label="Acak urutan soal" hint="Urutan soal diacak server saat paket dimasukkan ke babak." checked={!!draft.shuffle_questions} onChange={(v) => setDraft({ ...draft, shuffle_questions: v })} />
              <SwitchRow label="Acak pilihan jawaban" hint="Urutan opsi diacak server; monitor dan semua HP menampilkan urutan yang sama." checked={!!draft.shuffle_options} onChange={(v) => setDraft({ ...draft, shuffle_options: v })} />
            </DialogBody>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setDraft(null)}>Batal</Button><Button loading={busy} onClick={() => void save()}>Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!picking} onOpenChange={(o) => !o && setPicking(null)}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>Isi paket: {picking?.name}</DialogTitle><DialogDescription>{picked.length} soal dipilih dari {candidates.length} soal aktif yang sesuai jenjang.</DialogDescription></DialogHeader>
          <DialogBody className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={search} onChange={setSearch} placeholder="Cari soal…" className="flex-1" />
              <Input type="number" min={1} className="w-20" value={randomN} onChange={(e) => setRandomN(Number(e.target.value))} aria-label="Jumlah soal acak" />
              <Button variant="outline" onClick={pickRandom}><Shuffle /> Tambah acak</Button>
              <Button variant="ghost" onClick={() => setPicked([])}>Kosongkan</Button>
            </div>
            {bank.isLoading ? <Loading /> : !candidates.length ? <EmptyState title="Tidak ada soal" description="Tambahkan soal di Bank Soal terlebih dahulu." /> : (
              <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-lg border">
                {candidates.map((q) => {
                  const idx = picked.indexOf(q.id)
                  return (
                    <li key={q.id}>
                      <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-navy-50/60">
                        <Checkbox className="mt-0.5" checked={idx >= 0} onCheckedChange={(v) => setPicked(v ? [...picked, q.id] : picked.filter((id) => id !== q.id))} />
                        <span className="min-w-0 flex-1 text-sm"><span className="line-clamp-2 text-navy-900">{q.question_text}</span><span className="text-xs text-muted-foreground">{LABELS.questionType[q.type]} · {LABELS.difficulty[q.difficulty]}</span></span>
                        {idx >= 0 && <Badge variant="blue">#{idx + 1}</Badge>}
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </DialogBody>
          <DialogFooter><Button variant="outline" onClick={() => setPicking(null)}>Batal</Button><Button loading={busy} onClick={() => void savePick()}>Simpan isi paket</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function PackagesPage() {
  return <NeedEvent>{(id) => <Inner key={id} eventId={id} />}</NeedEvent>
}
