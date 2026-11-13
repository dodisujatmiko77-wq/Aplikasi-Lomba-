import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer, Trophy } from 'lucide-react'
import { rpc } from '@/services/db'
import { Loading, SearchInput } from '@/components/common'
import { Button } from '@/components/ui/button'
import { fmtDateTime, fmtPoints, fmtSeconds } from '@/utils/format'
import type { LeaderboardRow } from '@/types'

interface Result { ok: boolean; message?: string; session: { code: string; name: string; finished_at: string | null; event_name: string; organizer: string | null; level: string }; rows: LeaderboardRow[] }
const MEDAL = ['bg-gold text-navy-950', 'bg-silver text-navy-950', 'bg-bronze text-white']

/** Hasil publik: hanya tampil bila operator telah mengumumkan/mempublikasikan hasil. */
export default function PublicResultsPage() {
  const { code = '' } = useParams()
  const [q, setQ] = useState('')
  const { data, isLoading } = useQuery({ queryKey: ['public-results', code], queryFn: () => rpc<Result>('get_public_results', { p_code: code }) })
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => !q || `${r.name} ${r.school} ${r.district}`.toLowerCase().includes(q.toLowerCase())), [data, q])
  if (isLoading) return <Loading className="min-h-screen" />
  if (!data?.ok) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <Trophy className="h-10 w-10 text-navy-300" /><p className="font-heading text-xl font-bold text-navy-900">{data?.message ?? 'Hasil tidak tersedia'}</p>
      <Button asChild><Link to="/">Kembali ke beranda</Link></Button>
    </div>
  )
  return (
    <div className="min-h-screen bg-background">
      <header className="stage-bg no-print text-white">
        <div className="mx-auto max-w-4xl px-5 py-8">
          <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-navy-200 hover:text-white"><ArrowLeft className="h-4 w-4" /> Beranda</Link>
          <p className="text-xs font-semibold uppercase tracking-widest text-electric-400">{data.session.level} · {data.session.event_name}</p>
          <h1 className="mt-1 text-3xl font-extrabold">{data.session.name}</h1>
          <p className="mt-1 text-sm text-navy-200">Hasil resmi{data.session.finished_at ? ` · ${fmtDateTime(data.session.finished_at)}` : ''}</p>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-6">
        <div className="no-print mb-4 flex gap-2"><SearchInput value={q} onChange={setQ} placeholder="Cari nama atau sekolah…" className="flex-1" /><Button variant="outline" onClick={() => window.print()}><Printer /> Cetak</Button></div>
        <div className="print-area overflow-hidden rounded-2xl border bg-white shadow-soft">
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.participant_id} className="flex items-center gap-3 px-4 py-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold ${r.rank <= 3 ? MEDAL[r.rank - 1] : 'bg-navy-50 text-navy-700'}`}>{r.rank}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-navy-900">{r.name}</span><span className="block truncate text-xs text-muted-foreground">{r.school} · {r.district}</span></span>
                <span className="hidden text-right text-xs text-muted-foreground sm:block">{r.correct} benar · {r.wrong + r.unanswered} salah/kosong<br />rata-rata {fmtSeconds(r.avg_ms)}</span>
                <b className="tabular w-20 text-right text-lg text-navy-900">{fmtPoints(r.points)}</b>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  )
}
