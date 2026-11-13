import { useState } from 'react'
import { Award, BarChart3, FileSpreadsheet, FileText, History, MapPin, Printer, School } from 'lucide-react'
import { toast } from 'sonner'
import { rpc } from '@/services/db'
import { useAction } from '@/hooks/useAction'
import { NeedEvent } from '@/features/auth/guards'
import { ErrorNote, Loading, PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { SimpleSelect } from '@/components/ui/select'
import { exportExcel } from '@/utils/excel'
import { exportCertificates, exportTablePdf } from '@/utils/pdf'
import { fmtDate } from '@/utils/format'
import type { AnswerHistoryRow } from '@/types'
import { historyColumns, historyRows, rankingColumns, rankingPdfBody, rankingPdfHead, rankingRows, recap, useEventSessions, useSessionReport } from './reportData'

function Inner({ eventId }: { eventId: string }) {
  const sessions = useEventSessions(eventId)
  const [sid, setSid] = useState('')
  const [roundId, setRoundId] = useState('')
  const [signer, setSigner] = useState({ name: '', title: 'Ketua Panitia' })
  const { busyKey, run } = useAction()
  const sessionId = sid || sessions.data?.find((s) => s.status === 'finished')?.id || sessions.data?.[0]?.id || ''
  const report = useSessionReport(sessionId, roundId)
  const rep = report.data
  const rows = rep?.rows ?? []
  const fin = rep?.session.status === 'finished'

  if (sessions.isLoading) return <Loading />
  const need = () => { if (!rep || !rows.length) { toast.error('Belum ada data hasil untuk laporan ini'); return false } return true }
  const info = () => ({ eventName: rep!.session.event_name, sessionName: rep!.session.name, organizer: rep!.session.organizer ?? 'Panitia', location: rep!.session.location, date: fmtDate(rep!.session.finished_at ?? new Date().toISOString()), signerName: signer.name || undefined, signerTitle: signer.title })
  const base = () => `${rep!.session.name}${roundId ? '-' + (rep!.rounds.find((r) => r.id === roundId)?.name ?? '') : ''}`
  const sub = () => `${rep!.session.event_name} · ${rep!.session.level}`

  const items: { key: string; icon: typeof FileText; title: string; desc: string; actions: { label: string; fn: () => Promise<unknown> | void }[] }[] = [
    { key: 'rank', icon: BarChart3, title: 'Ranking semua peserta', desc: 'Peringkat, nilai akhir, benar/salah/kosong, total & rata-rata waktu respons, status eliminasi.', actions: [
      { label: 'Excel', fn: () => need() && exportExcel(`ranking-${base()}`, [{ name: 'Ranking', columns: rankingColumns, rows: rankingRows(rows, fin) }]) },
      { label: 'PDF', fn: () => need() && exportTablePdf({ filename: `ranking-${base()}`, title: `Ranking ${base()}`, subtitle: sub(), head: rankingPdfHead, body: rankingPdfBody(rows, fin), landscape: true }) },
      { label: 'Cetak', fn: () => { if (need()) window.open(`/admin/results?session=${sessionId}`, '_blank') } },
    ] },
    { key: 'win', icon: Award, title: 'Daftar juara 1, 2, dan 3', desc: 'Hanya tiga besar, siap ditempel atau dilampirkan pada berita acara.', actions: [
      { label: 'PDF', fn: () => need() && exportTablePdf({ filename: `juara-${base()}`, title: `Juara ${base()}`, subtitle: sub(), head: ['Juara', 'Nama', 'Sekolah', 'Kecamatan', 'Poin'], body: rows.slice(0, 3).map((r) => [r.rank, r.name, r.school, r.district, Number(r.points).toLocaleString('id-ID')]) }) },
      { label: 'Excel', fn: () => need() && exportExcel(`juara-${base()}`, [{ name: 'Juara', columns: rankingColumns, rows: rankingRows(rows.slice(0, 3)) }]) },
    ] },
    { key: 'hist', icon: History, title: 'Riwayat jawaban per soal', desc: 'Setiap jawaban: soal, jawaban peserta, benar/salah, waktu respons, dan poin.', actions: [
      { label: 'Excel', fn: async () => { if (!need()) return; const h = await rpc<AnswerHistoryRow[]>('admin_get_answer_history', { p_session_id: sessionId, p_round_id: roundId || null }); await exportExcel(`riwayat-jawaban-${base()}`, [{ name: 'Riwayat', columns: historyColumns, rows: historyRows(h) }]) } },
    ] },
    { key: 'dist', icon: MapPin, title: 'Rekap per kecamatan', desc: 'Jumlah peserta, total & rata-rata poin, poin tertinggi tiap kecamatan.', actions: [
      { label: 'Excel', fn: () => need() && exportExcel(`rekap-kecamatan-${base()}`, [{ name: 'Kecamatan', columns: recapCols('Kecamatan'), rows: recap(rows, 'district') }]) },
    ] },
    { key: 'school', icon: School, title: 'Rekap per sekolah', desc: 'Perbandingan perolehan antar sekolah asal peserta.', actions: [
      { label: 'Excel', fn: () => need() && exportExcel(`rekap-sekolah-${base()}`, [{ name: 'Sekolah', columns: recapCols('Sekolah'), rows: recap(rows, 'school') }]) },
    ] },
  ]

  return (
    <div>
      <PageHeader title="Laporan" description="Unduh hasil dalam Excel/PDF, cetak, dan buat sertifikat peserta serta pemenang." />
      <Card className="mb-4"><CardContent className="flex flex-wrap items-end gap-3 p-4">
        <Field label="Sesi"><SimpleSelect value={sessionId} onChange={(v) => { setSid(v); setRoundId('') }} className="w-64" options={(sessions.data ?? []).map((x) => ({ value: x.id, label: x.name }))} /></Field>
        <Field label="Babak"><SimpleSelect value={roundId} onChange={setRoundId} allLabel="Klasemen sesi (semua babak)" className="w-64" options={(rep?.rounds ?? []).map((r) => ({ value: r.id, label: `${r.sequence}. ${r.name}` }))} /></Field>
        <p className="pb-2 text-sm text-muted-foreground">{report.isLoading ? 'Memuat…' : `${rows.length} peserta dalam laporan`}</p>
      </CardContent></Card>
      {report.error && <ErrorNote message={(report.error as Error).message} />}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((it) => (
          <Card key={it.key}><CardHeader><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-900 text-white"><it.icon className="h-5 w-5" /></span><CardTitle>{it.title}</CardTitle></div><CardDescription>{it.desc}</CardDescription></CardHeader>
            <CardContent className="flex gap-2">{it.actions.map((a) => <Button key={a.label} size="sm" variant="outline" disabled={!rep} loading={busyKey === it.key + a.label} onClick={() => void run(async () => a.fn(), undefined, it.key + a.label)}>{a.label === 'Cetak' ? <Printer /> : a.label === 'Excel' ? <FileSpreadsheet /> : <FileText />}{a.label}</Button>)}</CardContent></Card>
        ))}
        <Card className="md:col-span-2 xl:col-span-3">
          <CardHeader><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-flame-500 text-white"><Award className="h-5 w-5" /></span><CardTitle>Sertifikat</CardTitle></div><CardDescription>Template piagam untuk juara 1–3 dan sertifikat untuk peserta lain (A4 lanskap, PDF).</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Nama penandatangan"><Input value={signer.name} onChange={(e) => setSigner({ ...signer, name: e.target.value })} placeholder="Nama Kepala Sekolah / Ketua Panitia" /></Field><Field label="Jabatan"><Input value={signer.title} onChange={(e) => setSigner({ ...signer, title: e.target.value })} /></Field></div>
            <div className="flex flex-wrap gap-2">
              <Button variant="flame" disabled={!rep} loading={busyKey === 'cw'} onClick={() => void run(async () => { if (need()) await exportCertificates(rows.filter((r) => r.rank <= 3 && !r.is_eliminated), info(), `piagam-juara-${base()}`) }, undefined, 'cw')}><Award /> Piagam juara 1–3</Button>
              <Button variant="outline" disabled={!rep} loading={busyKey === 'ca'} onClick={() => void run(async () => { if (need()) await exportCertificates(rows, info(), `sertifikat-semua-peserta-${base()}`) }, undefined, 'ca')}><Award /> Sertifikat semua peserta ({rows.length})</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
const recapCols = (label: string) => [{ header: label, key: 'name', width: 30 }, { header: 'Jumlah Peserta', key: 'peserta', width: 16 }, { header: 'Total Poin', key: 'total', width: 14 }, { header: 'Rata-rata Poin', key: 'rata', width: 16 }, { header: 'Poin Tertinggi', key: 'tertinggi', width: 16 }, { header: 'Jawaban Benar', key: 'benar', width: 15 }, { header: 'Salah/Kosong', key: 'salah', width: 14 }]
export default function ReportsPage() { return <NeedEvent>{(id) => <Inner key={id} eventId={id} />}</NeedEvent> }
