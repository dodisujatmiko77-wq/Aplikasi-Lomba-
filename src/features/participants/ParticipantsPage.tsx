import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, Download, FileDown, KeyRound, Pencil, Plus, Printer, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { list, listByIds, rpc, update } from '@/services/db'
import { useAuth } from '@/contexts/AuthContext'
import { useDistricts, useEvent, useLevels } from '@/contexts/EventContext'
import { useAction } from '@/hooks/useAction'
import { useConfirm } from '@/components/confirm'
import { NeedEvent } from '@/features/auth/guards'
import { Avatar, EmptyState, ImageUpload, Loading, PageHeader, Pager, SearchInput, usePaged } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/switch'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { exportExcel, readExcel } from '@/utils/excel'
import { LABELS } from '@/utils/format'
import type { EventParticipant, Participant } from '@/types'

type Row = Participant & { ep: EventParticipant }
interface Draft {
  id?: string; participant_number: string; full_name: string; school: string; education_level_id: string; district_id: string
  photo_url: string | null; code: string; pin: string; registration_status: EventParticipant['registration_status']; participation_status: EventParticipant['participation_status']
}
interface Credential { code: string; pin: string | null; full_name: string; participant_number: string }
interface ImportResult { row: number; ok: boolean; error?: string; code?: string; pin?: string | null; full_name?: string; participant_number?: string; created?: boolean }

const REG_VARIANT = { pending: 'orange', verified: 'green', rejected: 'red' } as const
const PART_VARIANT = { registered: 'gray', active: 'blue', withdrawn: 'orange', disqualified: 'red' } as const

function printCards(creds: Credential[], eventName: string) {
  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) return toast.error('Izinkan pop-up untuk mencetak kartu')
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  w.document.write(`<!doctype html><html><head><title>Kartu Peserta</title><style>
    body{font-family:Inter,Arial,sans-serif;margin:16px;color:#0b1b3f}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
    .card{border:1.5px solid #0b1b3f;border-radius:10px;padding:12px;break-inside:avoid}
    .ev{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#56627a}
    .nm{font-weight:700;font-size:14px;margin:4px 0 8px}
    .kv{display:flex;justify-content:space-between;font-size:12px;border-top:1px dashed #b3c6ea;padding-top:6px;margin-top:6px}
    .mono{font-family:ui-monospace,Menlo,monospace;font-size:18px;font-weight:700;letter-spacing:.12em}
    @media print{body{margin:8mm}}
  </style></head><body><div class="grid">${creds.map((c) => `
    <div class="card"><div class="ev">${esc(eventName)} · No. ${esc(c.participant_number ?? '')}</div>
    <div class="nm">${esc(c.full_name ?? '')}</div>
    <div class="kv"><span>Kode peserta</span><span class="mono">${esc(c.code)}</span></div>
    <div class="kv"><span>PIN</span><span class="mono">${esc(c.pin ?? '—')}</span></div></div>`).join('')}
  </div><script>window.onload=()=>window.print()</` + `script></body></html>`)
  w.document.close()
}

function Inner({ eventId }: { eventId: string }) {
  const { can } = useAuth()
  const { event } = useEvent()
  const { districts, districtMap } = useDistricts()
  const { levels, levelMap } = useLevels()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { busy, run } = useAction()
  const canEdit = can(eventId, 'participants')
  const fileRef = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState('')
  const [level, setLevel] = useState('')
  const [district, setDistrict] = useState('')
  const [reg, setReg] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState<Draft | null>(null)
  const [creds, setCreds] = useState<Credential[] | null>(null)
  const [importResult, setImportResult] = useState<ImportResult[] | null>(null)

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['participants', eventId],
    queryFn: async (): Promise<Row[]> => {
      const eps = await list<EventParticipant>('event_participants', { filters: { event_id: eventId } })
      const ps = await listByIds<Participant>('participants', eps.map((e) => e.participant_id))
      const byId = new Map(eps.map((e) => [e.participant_id, e]))
      return ps.map((p) => ({ ...p, ep: byId.get(p.id)! })).sort((a, b) => a.participant_number.localeCompare(b.participant_number, 'id', { numeric: true }))
    },
  })
  const reload = () => qc.invalidateQueries({ queryKey: ['participants', eventId] })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) =>
      (!level || r.education_level_id === level) && (!district || r.district_id === district) && (!reg || r.ep.registration_status === reg) &&
      (!q || [r.full_name, r.school, r.participant_number, r.code].some((v) => v.toLowerCase().includes(q))))
  }, [rows, search, level, district, reg])
  const paged = usePaged(filtered, 25)

  const summary = useMemo(() => levels.filter((l) => l.is_active).map((l) => {
    const n = rows.filter((r) => r.education_level_id === l.id).length
    const target = districts.filter((d) => d.is_active).length * (event?.participants_per_district ?? 3)
    return { ...l, n, target }
  }), [levels, rows, districts, event])

  const openNew = () => setDraft({ participant_number: '', full_name: '', school: '', education_level_id: level || levels[0]?.id || '', district_id: district || districts[0]?.id || '', photo_url: null, code: '', pin: '', registration_status: 'verified', participation_status: 'registered' })
  const openEdit = (r: Row) => setDraft({ id: r.id, participant_number: r.participant_number, full_name: r.full_name, school: r.school, education_level_id: r.education_level_id, district_id: r.district_id, photo_url: r.photo_url, code: r.code, pin: '', registration_status: r.ep.registration_status, participation_status: r.ep.participation_status })

  const save = async () => {
    if (!draft) return
    const ok = await run(async () => {
      const res = await rpc<{ id: string; code: string; pin: string | null }>('admin_save_participant', {
        p_event_id: eventId,
        p_data: { ...draft, pin: draft.pin || undefined, code: draft.code || undefined },
      })
      await reload()
      if (res.pin) setCreds([{ code: res.code, pin: res.pin, full_name: draft.full_name, participant_number: draft.participant_number }])
    }, 'Peserta tersimpan')
    if (ok) setDraft(null)
  }

  const del = async (r: Row) => {
    if (await confirm({ title: `Hapus peserta "${r.full_name}"?`, description: 'Peserta dikeluarkan dari event ini.', destructive: true }))
      await run(async () => { await rpc('admin_delete_participant', { p_event_id: eventId, p_participant_id: r.id }); await reload() }, 'Peserta dihapus')
  }

  const resetPins = async (ids: string[]) => {
    if (!ids.length) return
    if (!(await confirm({ title: `Reset PIN ${ids.length} peserta?`, description: 'PIN lama langsung tidak berlaku dan peserta yang sedang login akan dikeluarkan. PIN baru hanya ditampilkan satu kali.', confirmLabel: 'Reset PIN' }))) return
    await run(async () => {
      const out = await rpc<Credential[]>('admin_reset_pins', { p_event_id: eventId, p_participant_ids: ids })
      setCreds(out)
      setSelected(new Set())
    })
  }

  const verify = async (ids: string[]) => {
    await run(async () => {
      for (let i = 0; i < ids.length; i += 100)
        await update('event_participants', { event_id: eventId, participant_id: { in: ids.slice(i, i + 100) } }, { registration_status: 'verified' })
      await reload()
      setSelected(new Set())
    }, `${ids.length} peserta diverifikasi`)
  }

  const doExport = () => exportExcel(`peserta-${event?.name ?? 'event'}`, [{
    name: 'Peserta',
    columns: [
      { header: 'No Peserta', key: 'no', width: 14 }, { header: 'Kode', key: 'code', width: 12 }, { header: 'Nama Lengkap', key: 'name', width: 32 },
      { header: 'Asal Sekolah', key: 'school', width: 30 }, { header: 'Jenjang', key: 'level', width: 10 }, { header: 'Kecamatan', key: 'district', width: 20 },
      { header: 'Status Registrasi', key: 'reg', width: 18 }, { header: 'Status Keikutsertaan', key: 'part', width: 20 },
    ],
    rows: filtered.map((r) => ({ no: r.participant_number, code: r.code, name: r.full_name, school: r.school, level: levelMap.get(r.education_level_id)?.code, district: districtMap.get(r.district_id)?.name, reg: LABELS.registration[r.ep.registration_status], part: LABELS.participation[r.ep.participation_status] })),
  }])

  const template = () => exportExcel('template-import-peserta', [{
    name: 'Peserta',
    columns: [
      { header: 'No Peserta', key: 'no', width: 14 }, { header: 'Nama Lengkap', key: 'name', width: 32 }, { header: 'Asal Sekolah', key: 'school', width: 30 },
      { header: 'Jenjang', key: 'level', width: 10 }, { header: 'Kecamatan', key: 'district', width: 20 }, { header: 'PIN', key: 'pin', width: 10 },
    ],
    rows: [
      { no: 'SMP-001', name: 'Contoh Peserta Satu', school: 'SMPN 1 Baradatu', level: 'SMP', district: 'Baradatu', pin: '' },
      { no: 'SD-001', name: 'Contoh Peserta Dua', school: 'SDN 1 Banjit', level: 'SD', district: 'Banjit', pin: '' },
    ],
    note: 'Jenjang: SD / SMP / SMA. Kecamatan harus sesuai Data Kecamatan. PIN boleh dikosongkan (dibuat otomatis, 6 digit).',
  }])

  const doImport = async (file?: File) => {
    if (!file) return
    await run(async () => {
      const raw = await readExcel(file)
      const data = raw.map((r) => ({
        participant_number: r.nopeserta || r.nomorpeserta || r.no || '', full_name: r.namalengkap || r.nama || '',
        school: r.asalsekolah || r.sekolah || '', level: r.jenjang || '', district: r.kecamatan || '',
        pin: r.pin || undefined, code: r.kode || r.kodepeserta || undefined,
      }))
      if (!data.length) throw new Error('Tidak ada baris data pada berkas')
      const out: ImportResult[] = []
      for (let i = 0; i < data.length; i += 200) {
        const part = await rpc<ImportResult[]>('admin_import_participants', { p_event_id: eventId, p_rows: data.slice(i, i + 200) })
        out.push(...part.map((r) => ({ ...r, row: r.row + i })))
      }
      setImportResult(out)
      await reload()
    })
    if (fileRef.current) fileRef.current.value = ''
  }

  const credsExcel = (list: Credential[]) => exportExcel('kartu-peserta-kode-pin', [{
    name: 'Kredensial',
    columns: [{ header: 'No Peserta', key: 'participant_number', width: 14 }, { header: 'Nama Lengkap', key: 'full_name', width: 32 }, { header: 'Kode Peserta', key: 'code', width: 16 }, { header: 'PIN', key: 'pin', width: 12 }],
    rows: list as unknown as Record<string, unknown>[],
  }])

  const allOnPage = paged.slice.length > 0 && paged.slice.every((r) => selected.has(r.id))
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const newCreds = importResult?.filter((r) => r.ok && r.pin).map((r) => ({ code: r.code!, pin: r.pin!, full_name: r.full_name ?? '', participant_number: r.participant_number ?? '' })) ?? []

  return (
    <div>
      <PageHeader
        title="Data Peserta"
        description="Peserta masuk memakai kode peserta + PIN. PIN hanya tersimpan sebagai hash dan ditampilkan sekali saat dibuat."
        actions={
          <>
            <Button variant="outline" onClick={() => void doExport()} disabled={!rows.length}><Download /> Export</Button>
            {canEdit && (
              <>
                <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => void doImport(e.target.files?.[0])} />
                <Button variant="outline" onClick={() => void template()}><FileDown /> Template</Button>
                <Button variant="outline" loading={busy} onClick={() => fileRef.current?.click()}><Upload /> Import Excel</Button>
                <Button onClick={openNew}><Plus /> Tambah peserta</Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {summary.map((l) => (
          <Card key={l.id} className="p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-semibold text-navy-800">{l.name}</p>
              <p className="tabular text-sm text-muted-foreground"><b className="text-lg text-navy-900">{l.n}</b> / {l.target}</p>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy-100">
              <div className={`h-full rounded-full ${l.n >= l.target ? 'bg-emerald-500' : 'bg-electric-500'}`} style={{ width: `${Math.min(100, (l.n / Math.max(1, l.target)) * 100)}%` }} />
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Cari nama, sekolah, nomor, kode…" className="w-full sm:w-72" />
          <SimpleSelect value={level} onChange={setLevel} allLabel="Semua jenjang" options={levels.map((l) => ({ value: l.id, label: l.name }))} className="w-40" />
          <SimpleSelect value={district} onChange={setDistrict} allLabel="Semua kecamatan" options={districts.map((d) => ({ value: d.id, label: d.name }))} className="w-48" />
          <SimpleSelect value={reg} onChange={setReg} allLabel="Semua status" options={Object.entries(LABELS.registration).map(([value, label]) => ({ value, label }))} className="w-44" />
          {canEdit && selected.size > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs font-semibold text-navy-700">{selected.size} dipilih</span>
              <Button size="sm" variant="outline" onClick={() => void verify([...selected])}><BadgeCheck /> Verifikasi</Button>
              <Button size="sm" variant="outline" onClick={() => void resetPins([...selected])}><KeyRound /> Reset PIN</Button>
            </div>
          )}
        </div>
        {isLoading ? <Loading /> : !filtered.length ? (
          <EmptyState title={rows.length ? 'Tidak ada peserta yang cocok' : 'Belum ada peserta'} description={rows.length ? 'Ubah kata kunci atau filter.' : 'Tambahkan satu per satu atau impor dari Excel.'} />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  {canEdit && <TH className="w-10"><Checkbox checked={allOnPage} onCheckedChange={(v) => setSelected((s) => { const n = new Set(s); paged.slice.forEach((r) => (v ? n.add(r.id) : n.delete(r.id))); return n })} aria-label="Pilih semua" /></TH>}
                  <TH>No</TH><TH>Peserta</TH><TH>Kode</TH><TH>Jenjang</TH><TH>Kecamatan</TH><TH>Registrasi</TH><TH>Keikutsertaan</TH>{canEdit && <TH className="w-28" />}
                </TR>
              </THead>
              <TBody>
                {paged.slice.map((r) => (
                  <TR key={r.id}>
                    {canEdit && <TD><Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label={`Pilih ${r.full_name}`} /></TD>}
                    <TD className="tabular whitespace-nowrap font-medium">{r.participant_number}</TD>
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar name={r.full_name} src={r.photo_url} size={34} />
                        <div className="min-w-0"><p className="truncate font-semibold text-navy-900">{r.full_name}</p><p className="truncate text-xs text-muted-foreground">{r.school || '—'}</p></div>
                      </div>
                    </TD>
                    <TD className="font-mono text-xs font-semibold tracking-wider">{r.code}</TD>
                    <TD>{levelMap.get(r.education_level_id)?.code}</TD>
                    <TD>{districtMap.get(r.district_id)?.name}</TD>
                    <TD><Badge variant={REG_VARIANT[r.ep.registration_status]}>{LABELS.registration[r.ep.registration_status]}</Badge></TD>
                    <TD><Badge variant={PART_VARIANT[r.ep.participation_status]}>{LABELS.participation[r.ep.participation_status]}</Badge></TD>
                    {canEdit && (
                      <TD className="whitespace-nowrap text-right">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(r)} aria-label="Ubah"><Pencil /></Button>
                        <Button size="icon" variant="ghost" onClick={() => void resetPins([r.id])} aria-label="Reset PIN"><KeyRound /></Button>
                        <Button size="icon" variant="ghost" className="text-red-600" onClick={() => void del(r)} aria-label="Hapus"><Trash2 /></Button>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pager page={paged.page} pages={paged.pages} total={paged.total} onPage={paged.setPage} />
          </>
        )}
      </Card>

      {/* Form peserta */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>{draft?.id ? 'Ubah peserta' : 'Tambah peserta'}</DialogTitle></DialogHeader>
          {draft && (
            <DialogBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Nomor peserta"><Input value={draft.participant_number} onChange={(e) => setDraft({ ...draft, participant_number: e.target.value })} placeholder="SMP-001" /></Field>
              <Field label="Nama lengkap"><Input value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} /></Field>
              <Field label="Asal sekolah" className="sm:col-span-2"><Input value={draft.school} onChange={(e) => setDraft({ ...draft, school: e.target.value })} /></Field>
              <Field label="Jenjang"><SimpleSelect value={draft.education_level_id} onChange={(v) => setDraft({ ...draft, education_level_id: v })} options={levels.map((l) => ({ value: l.id, label: l.name }))} /></Field>
              <Field label="Kecamatan"><SimpleSelect value={draft.district_id} onChange={(v) => setDraft({ ...draft, district_id: v })} options={districts.map((d) => ({ value: d.id, label: d.name }))} /></Field>
              <Field label="Status registrasi"><SimpleSelect value={draft.registration_status} onChange={(v) => setDraft({ ...draft, registration_status: v as Draft['registration_status'] })} options={Object.entries(LABELS.registration).map(([value, label]) => ({ value, label }))} /></Field>
              <Field label="Status keikutsertaan"><SimpleSelect value={draft.participation_status} onChange={(v) => setDraft({ ...draft, participation_status: v as Draft['participation_status'] })} options={Object.entries(LABELS.participation).map(([value, label]) => ({ value, label }))} /></Field>
              {!draft.id && <Field label="Kode peserta" hint="Kosongkan agar dibuat otomatis."><Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} maxLength={20} /></Field>}
              <Field label={draft.id ? 'PIN baru' : 'PIN'} hint={draft.id ? 'Kosongkan bila tidak ingin mengganti PIN.' : 'Kosongkan agar dibuat otomatis (6 digit).'}>
                <Input value={draft.pin} onChange={(e) => setDraft({ ...draft, pin: e.target.value.replace(/\D/g, '').slice(0, 8) })} inputMode="numeric" autoComplete="off" />
              </Field>
              <Field label="Foto peserta" className="sm:col-span-2"><ImageUpload bucket="participant-photos" value={draft.photo_url} onChange={(url) => setDraft({ ...draft, photo_url: url })} label="Unggah foto" /></Field>
            </DialogBody>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setDraft(null)}>Batal</Button><Button loading={busy} onClick={() => void save()}>Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kredensial (sekali tampil) */}
      <Dialog open={!!creds} onOpenChange={(o) => !o && setCreds(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kode & PIN peserta</DialogTitle>
            <DialogDescription>Simpan sekarang. PIN tidak dapat ditampilkan lagi setelah jendela ini ditutup — hanya bisa direset.</DialogDescription>
          </DialogHeader>
          <DialogBody className="p-0">
            <Table>
              <THead><TR><TH>No</TH><TH>Nama</TH><TH>Kode</TH><TH>PIN</TH></TR></THead>
              <TBody>{creds?.map((c) => (
                <TR key={c.code}><TD>{c.participant_number}</TD><TD>{c.full_name}</TD><TD className="font-mono font-semibold tracking-wider">{c.code}</TD><TD className="font-mono font-semibold tracking-wider">{c.pin}</TD></TR>
              ))}</TBody>
            </Table>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => creds && printCards(creds, event?.name ?? '')}><Printer /> Cetak kartu</Button>
            <Button onClick={() => creds && void credsExcel(creds)}><Download /> Unduh Excel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hasil import */}
      <Dialog open={!!importResult} onOpenChange={(o) => !o && setImportResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hasil import</DialogTitle>
            <DialogDescription>
              {importResult?.filter((r) => r.ok).length ?? 0} baris berhasil ({importResult?.filter((r) => r.ok && r.created).length ?? 0} baru), {importResult?.filter((r) => !r.ok).length ?? 0} gagal.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {importResult?.some((r) => !r.ok) ? (
              <ul className="space-y-1.5 text-sm">
                {importResult.filter((r) => !r.ok).map((r) => (
                  <li key={r.row} className="rounded-md bg-red-50 px-3 py-2 text-red-800">Baris {r.row + 1}{r.full_name ? ` (${r.full_name})` : ''}: {r.error}</li>
                ))}
              </ul>
            ) : <p className="text-sm text-emerald-700">Semua baris berhasil diimpor.</p>}
            {newCreds.length > 0 && <p className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900"><b>{newCreds.length} PIN baru</b> dibuat. Unduh atau cetak sekarang — PIN tidak dapat ditampilkan lagi.</p>}
          </DialogBody>
          <DialogFooter>
            {newCreds.length > 0 && (
              <>
                <Button variant="outline" onClick={() => printCards(newCreds, event?.name ?? '')}><Printer /> Cetak kartu</Button>
                <Button onClick={() => void credsExcel(newCreds)}><Download /> Unduh kode & PIN</Button>
              </>
            )}
            <Button variant="outline" onClick={() => setImportResult(null)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function ParticipantsPage() {
  return <NeedEvent>{(id) => <Inner key={id} eventId={id} />}</NeedEvent>
}
