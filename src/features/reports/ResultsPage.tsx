import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Crown, Download, Eye, EyeOff, FileText, Printer } from 'lucide-react'
import { rpc } from '@/services/db'
import { useAuth } from '@/contexts/AuthContext'
import { useAction } from '@/hooks/useAction'
import { NeedEvent } from '@/features/auth/guards'
import { Avatar, EmptyState, ErrorNote, Loading, PageHeader, Pager, SearchInput, SessionStatusBadge, usePaged } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SimpleSelect } from '@/components/ui/select'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { exportExcel } from '@/utils/excel'
import { exportTablePdf } from '@/utils/pdf'
import { fmtPoints, fmtSeconds, LABELS } from '@/utils/format'
import { applyFilter, rankingColumns, rankingPdfBody, rankingPdfHead, rankingRows, status, useEventSessions, useSessionReport } from './reportData'

const MEDAL = ['from-gold to-amber-500 text-navy-950', 'from-silver to-slate-400 text-navy-950', 'from-bronze to-orange-700 text-white']

function Inner({ eventId }: { eventId: string }) {
  const { can } = useAuth()
  const qc = useQueryClient()
  const { busy, run } = useAction()
  const [params, setParams] = useSearchParams()
  const sessions = useEventSessions(eventId)
  const sessionId = params.get('session') || sessions.data?.find((s) => s.status === 'finished')?.id || sessions.data?.[0]?.id || ''
  const [roundId, setRoundId] = useState('')
  const [district, setDistrict] = useState('')
  const [school, setSchool] = useState('')
  const [q, setQ] = useState('')
  const report = useSessionReport(sessionId, roundId)
  const canControl = can(eventId, 'control')

  const rows = report.data?.rows ?? []
  const filtered = useMemo(() => applyFilter(rows, { district, school, q }), [rows, district, school, q])
  const paged = usePaged(filtered, 30)
  const districts = [...new Set(rows.map((r) => r.district))].sort()
  const schools = [...new Set(rows.map((r) => r.school).filter(Boolean))].sort()
  const s = report.data?.session
  const title = `${s?.name ?? ''}${roundId ? ' — ' + report.data?.rounds.find((r) => r.id === roundId)?.name : ''}`

  const togglePublish = () => run(async () => {
    await rpc('set_results_published', { p_session_id: sessionId, p_published: !s?.results_published })
    await qc.invalidateQueries({ queryKey: ['report'] })
  }, s?.results_published ? 'Hasil disembunyikan dari publik' : 'Hasil dipublikasikan')

  return (
    <div>
      <PageHeader title="Hasil Perlombaan" description="Peringkat ditentukan backend: poin → jumlah benar → total waktu benar tercepat → soal tambahan."
        actions={s && (
          <>
            <Button variant="outline" onClick={() => void exportExcel(`hasil-${s.name}`, [{ name: 'Peringkat', columns: rankingColumns, rows: rankingRows(filtered, s.status === 'finished') }])}><Download /> Excel</Button>
            <Button variant="outline" onClick={() => void exportTablePdf({ filename: `hasil-${s.name}`, title: `Hasil ${title}`, subtitle: `${s.event_name} · ${s.level}`, head: rankingPdfHead, body: rankingPdfBody(filtered, s.status === 'finished'), landscape: true })}><FileText /> PDF</Button>
            <Button variant="outline" onClick={() => window.print()}><Printer /> Cetak</Button>
            {canControl && <Button variant={s.results_published ? 'secondary' : 'accent'} loading={busy} onClick={() => void togglePublish()}>{s.results_published ? <><EyeOff /> Sembunyikan dari publik</> : <><Eye /> Publikasikan hasil</>}</Button>}
          </>
        )} />

      <Card className="no-print mb-4">
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <SimpleSelect value={sessionId} onChange={(v) => { setParams(v ? { session: v } : {}); setRoundId('') }} className="w-64" placeholder="Pilih sesi"
            options={(sessions.data ?? []).map((x) => ({ value: x.id, label: x.name }))} />
          <SimpleSelect value={roundId} onChange={setRoundId} allLabel="Semua babak (klasemen sesi)" className="w-60" options={(report.data?.rounds ?? []).map((r) => ({ value: r.id, label: `${r.sequence}. ${r.name}` }))} />
          <SimpleSelect value={district} onChange={setDistrict} allLabel="Semua kecamatan" className="w-48" options={districts.map((d) => ({ value: d, label: d }))} />
          <SimpleSelect value={school} onChange={setSchool} allLabel="Semua sekolah" className="w-56" options={schools.map((d) => ({ value: d, label: d }))} />
          <SearchInput value={q} onChange={setQ} placeholder="Cari peserta…" className="w-52" />
          {s && <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground"><SessionStatusBadge status={s.status} />{s.results_published && <Badge variant="green">Publik</Badge>}</span>}
        </CardContent>
      </Card>

      {sessions.isLoading || report.isLoading ? <Loading /> : report.error ? <ErrorNote message={(report.error as Error).message} /> : !s ? <Card><EmptyState title="Belum ada sesi" /></Card> : (
        <div className="print-area">
          <div className="mb-3 hidden print:block"><h2 className="text-xl font-bold">Hasil {title}</h2><p className="text-sm">{s.event_name} · {s.level}</p></div>
          {!roundId && !district && !school && !q && rows.length >= 3 && (
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              {rows.slice(0, 3).map((r, i) => (
                <Card key={r.participant_id} className="overflow-hidden">
                  <div className={`flex items-center gap-2 bg-gradient-to-r px-4 py-2 font-heading font-bold ${MEDAL[i]}`}>{i === 0 && <Crown className="h-4 w-4" />} {s.status === 'finished' ? 'Juara' : 'Peringkat'} {r.rank}{r.tied && <span className="text-xs font-normal opacity-80">(seri)</span>}</div>
                  <CardContent className="flex items-center gap-3 p-4">
                    <Avatar name={r.name} src={r.photo_url} size={44} />
                    <div className="min-w-0 flex-1"><p className="truncate font-semibold text-navy-900">{r.name}</p><p className="truncate text-xs text-muted-foreground">{r.school}</p></div>
                    <b className="tabular font-heading text-xl text-navy-900">{fmtPoints(r.points)}</b>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <Card>
            {!filtered.length ? <EmptyState title="Belum ada hasil" description="Klasemen terisi setelah babak berjalan." /> : (
              <>
                <Table>
                  <THead><TR><TH>#</TH><TH>Peserta</TH><TH>Sekolah</TH><TH>Kecamatan</TH><TH className="text-right">Poin</TH><TH className="text-right">Benar</TH><TH className="text-right">Salah</TH><TH className="text-right">Kosong</TH><TH className="text-right">Rata² waktu</TH><TH>Status</TH></TR></THead>
                  <TBody>
                    {paged.slice.map((r) => (
                      <TR key={r.participant_id}>
                        <TD className="tabular font-bold text-navy-700">{r.rank}{r.tied && <span className="ml-1 text-xs text-flame-500" title="Nilai seri">=</span>}</TD>
                        <TD><p className="font-semibold text-navy-900">{r.name}</p><p className="text-xs text-muted-foreground">{r.number}</p></TD>
                        <TD>{r.school}</TD><TD>{r.district}</TD>
                        <TD className="tabular text-right font-semibold">{fmtPoints(r.points)}{Number(r.tiebreak_points) > 0 && <span className="block text-xs font-normal text-flame-600" title="Poin soal tambahan">+{fmtPoints(r.tiebreak_points)} TB</span>}</TD>
                        <TD className="tabular text-right text-emerald-700">{r.correct}</TD><TD className="tabular text-right text-red-600">{r.wrong}</TD><TD className="tabular text-right text-muted-foreground">{r.unanswered}</TD>
                        <TD className="tabular text-right">{fmtSeconds(r.avg_ms)}</TD>
                        <TD><Badge variant={r.is_eliminated ? 'red' : r.rank <= 3 && s.status === 'finished' ? 'orange' : 'gray'}>{status(r, s.status === 'finished')}</Badge>{r.elimination_reason && <span className="block text-xs text-muted-foreground">{r.elimination_reason}</span>}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                <Pager page={paged.page} pages={paged.pages} total={paged.total} onPage={paged.setPage} />
              </>
            )}
          </Card>
          <p className="mt-3 text-xs text-muted-foreground">Mode babak: {report.data?.rounds.map((r) => `${r.sequence}. ${LABELS.roundMode[r.mode]}`).join(' · ') || '—'}</p>
        </div>
      )}
    </div>
  )
}
export default function ResultsPage() { return <NeedEvent>{(id) => <Inner key={id} eventId={id} />}</NeedEvent> }
