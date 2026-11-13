import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, CalendarDays, Gauge, LockKeyhole, MapPin, MonitorPlay, Radio, ShieldCheck, Smartphone, Target, Timer, Trophy, Users, Zap } from 'lucide-react'
import { rpc } from '@/services/db'
import { isSupabaseConfigured } from '@/lib/supabase/client'
import { Logo, SessionStatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { DEFAULT_BRANDING } from '@/features/settings/GlobalSettingsPage'
import { fmtDate, fmtDateTime, fmtPoints } from '@/utils/format'
import type { Branding, LeaderboardRow, SessionStatus } from '@/types'

interface LandingData {
  app: { branding?: Partial<Branding> }
  events: {
    id: string; name: string; description: string | null; location: string | null; organizer: string | null; logo_url: string | null
    start_date: string | null; end_date: string | null; status: string; participants: number
    sessions: { code: string; name: string; status: SessionStatus; scheduled_at: string | null; level: string; results_published: boolean; winners: LeaderboardRow[] | null }[]
  }[]
  announcements: { id: string; type: 'info' | 'schedule' | 'winner'; title: string; body: string | null; scheduled_at: string | null; created_at: string }[]
}

const MEDAL = ['bg-gold text-navy-950', 'bg-silver text-navy-950', 'bg-bronze text-white']
const GUIDE = [
  { icon: Smartphone, title: 'Buka halaman peserta', text: 'Gunakan HP masing-masing. Pastikan baterai cukup dan koneksi internet stabil.' },
  { icon: LockKeyhole, title: 'Masuk dengan kode & PIN', text: 'Kode peserta dan PIN tertera pada kartu yang dibagikan panitia. Jangan dibagikan ke orang lain.' },
  { icon: Timer, title: 'Tunggu soal tampil', text: 'Soal muncul serentak di monitor dan HP setelah hitung mundur. Waktu mengikuti jam server.' },
  { icon: Zap, title: 'Jawab secepat & setepat mungkin', text: 'Satu soal hanya satu kali jawab dan tidak dapat diubah. Makin cepat benar, makin besar bonusnya.' },
]

export default function LandingPage() {
  const { data } = useQuery({ queryKey: ['landing'], queryFn: () => rpc<LandingData>('get_landing_data'), enabled: isSupabaseConfigured, staleTime: 30_000, retry: 0 })
  const b: Branding = { ...DEFAULT_BRANDING, ...(data?.app?.branding ?? {}) }
  const events = data?.events ?? []
  const sessions = events.flatMap((e) => e.sessions.map((s) => ({ ...s, event: e.name })))
  const liveSession = sessions.find((s) => s.status === 'running' || s.status === 'paused') ?? sessions.find((s) => s.status === 'open')
  const results = sessions.filter((s) => s.results_published && s.winners?.length)

  return (
    <div className="min-h-screen bg-white">
      {/* HERO */}
      <header className="stage-bg relative overflow-hidden text-white">
        <div className="grid-lines absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-5">
          <nav className="flex items-center justify-between py-5">
            <div className="flex items-center gap-3">
              {b.logo_url ? <img src={b.logo_url} alt="" className="h-10 w-10 rounded-xl object-cover" /> : <Logo size={40} />}
              <div className="leading-tight">
                <p className="font-heading font-bold">{b.app_name}</p>
                <p className="text-[11px] text-navy-200">{b.organizer}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" className="hidden text-white hover:bg-white/10 hover:text-white sm:inline-flex"><a href="#jadwal">Jadwal</a></Button>
              <Button asChild variant="ghost" className="hidden text-white hover:bg-white/10 hover:text-white sm:inline-flex"><a href="#hasil">Hasil</a></Button>
              <Button asChild variant="outline" size="sm" className="border-white/25 bg-white/5 text-white hover:bg-white/15 hover:text-white"><Link to="/login">Admin</Link></Button>
            </div>
          </nav>

          <div className="grid items-center gap-10 pb-20 pt-10 lg:grid-cols-[1.15fr_1fr] lg:pb-28 lg:pt-16">
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-electric-400">
                <Radio className="h-3.5 w-3.5" /> Competition Management & Real-Time Scoring
              </p>
              <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] text-balance sm:text-5xl lg:text-6xl">
                Siapa Cepat, Siapa Tepat, <span className="text-flame-400">Dialah Juara!</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-navy-100 sm:text-lg">{b.description}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" variant="flame"><Link to="/peserta"><Smartphone /> Masuk sebagai peserta</Link></Button>
                {liveSession ? (
                  <Button asChild size="lg" variant="outline" className="border-white/25 bg-white/5 text-white hover:bg-white/15 hover:text-white">
                    <Link to={`/live/${liveSession.code}`}><MonitorPlay /> Live Scoreboard</Link>
                  </Button>
                ) : (
                  <Button asChild size="lg" variant="outline" className="border-white/25 bg-white/5 text-white hover:bg-white/15 hover:text-white"><a href="#jadwal"><CalendarDays /> Lihat jadwal</a></Button>
                )}
              </div>
            </motion.div>

            {/* kartu rumus skor */}
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, delay: 0.15 }}
              className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-glow backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-widest text-navy-200">Cara skor dihitung</p>
              <p className="mt-3 font-heading text-2xl font-bold leading-snug">100 poin <span className="text-navy-300">+</span> <span className="text-electric-400">bonus kecepatan</span> hingga 50</p>
              <div className="mt-6 space-y-3">
                {[{ s: 2, p: 145 }, { s: 10, p: 125 }, { s: 18, p: 105 }].map((x, i) => (
                  <div key={x.s}>
                    <div className="mb-1 flex justify-between text-sm"><span className="text-navy-100">Benar pada detik ke-{x.s}</span><b className="tabular">{x.p} poin</b></div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${(x.p / 150) * 100}%` }} transition={{ duration: 0.9, delay: 0.4 + i * 0.15 }}
                        className={`h-full rounded-full ${i === 0 ? 'bg-flame-500' : 'bg-electric-500'}`} />
                    </div>
                  </div>
                ))}
                <div className="flex justify-between border-t border-white/10 pt-3 text-sm"><span className="text-navy-100">Salah atau tidak menjawab</span><b className="tabular">0 poin</b></div>
              </div>
            </motion.div>
          </div>
        </div>
      </header>

      {/* KEUNGGULAN */}
      <section className="mx-auto -mt-10 max-w-6xl px-5">
        <div className="relative grid gap-3 rounded-2xl border bg-white p-4 shadow-soft sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Gauge, t: 'Waktu server', d: 'Countdown dan skor memakai jam server, bukan jam HP.' },
            { icon: ShieldCheck, t: 'Anti curang', d: 'Kunci jawaban tidak pernah dikirim selama soal aktif.' },
            { icon: Target, t: 'Sekali jawab', d: 'Satu peserta, satu jawaban per soal — dijamin database.' },
            { icon: Users, t: '135+ peserta', d: 'Dirancang untuk seluruh peserta menjawab bersamaan.' },
          ].map((f) => (
            <div key={f.t} className="flex gap-3 rounded-xl p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-white"><f.icon className="h-5 w-5" /></span>
              <div><p className="font-semibold text-navy-900">{f.t}</p><p className="text-sm text-muted-foreground">{f.d}</p></div>
            </div>
          ))}
        </div>
      </section>

      {/* EVENT & JADWAL */}
      <section id="jadwal" className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-3xl font-bold text-navy-900">Informasi event & jadwal</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">Jadwal sesi perlombaan setiap jenjang. Sesi yang sedang berlangsung dapat ditonton langsung.</p>
        {!events.length ? (
          <div className="mt-8 rounded-2xl border border-dashed p-10 text-center text-muted-foreground">Jadwal perlombaan akan diumumkan di sini.</div>
        ) : (
          <div className="mt-8 space-y-6">
            {events.map((e) => (
              <article key={e.id} className="overflow-hidden rounded-2xl border shadow-soft">
                <div className="flex flex-wrap items-start gap-4 border-b bg-navy-50/60 p-5">
                  {e.logo_url && <img src={e.logo_url} alt="" className="h-14 w-14 rounded-xl border bg-white object-cover" />}
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xl font-bold text-navy-900">{e.name}</h3>
                    {e.description && <p className="mt-1 text-sm text-muted-foreground">{e.description}</p>}
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-navy-700">
                      <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{fmtDate(e.start_date)}{e.end_date && e.end_date !== e.start_date ? ` – ${fmtDate(e.end_date)}` : ''}</span>
                      {e.location && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{e.location}</span>}
                      <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{e.participants} peserta</span>
                    </div>
                  </div>
                </div>
                {e.sessions.length ? (
                  <ul className="divide-y">
                    {e.sessions.map((s) => (
                      <li key={s.code} className="flex flex-wrap items-center gap-3 px-5 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-navy-900">{s.name} <span className="font-normal text-muted-foreground">· {s.level}</span></p>
                          <p className="text-xs text-muted-foreground">{s.scheduled_at ? fmtDateTime(s.scheduled_at) : 'Waktu menyusul'}</p>
                        </div>
                        <SessionStatusBadge status={s.status} />
                        {s.status !== 'finished' ? (
                          <Button asChild size="sm" variant="outline"><Link to={`/live/${s.code}`}><MonitorPlay /> Live</Link></Button>
                        ) : s.results_published ? (
                          <Button asChild size="sm" variant="outline"><Link to={`/hasil/${s.code}`}><Trophy /> Hasil</Link></Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : <p className="px-5 py-4 text-sm text-muted-foreground">Sesi perlombaan belum dijadwalkan.</p>}
              </article>
            ))}
          </div>
        )}
        {!!data?.announcements.length && (
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {data.announcements.filter((a) => a.type !== 'winner').slice(0, 4).map((a) => (
              <div key={a.id} className="rounded-xl border-l-4 border-flame-500 bg-orange-50/60 p-4">
                <p className="font-semibold text-navy-900">{a.title}</p>
                {a.body && <p className="mt-1 whitespace-pre-line text-sm text-navy-700">{a.body}</p>}
                {a.scheduled_at && <p className="mt-1.5 text-xs font-medium text-flame-600">{fmtDateTime(a.scheduled_at)}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* HASIL */}
      <section id="hasil" className="bg-navy-50/70 py-16">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-3xl font-bold text-navy-900">Hasil perlombaan</h2>
          <p className="mt-2 text-muted-foreground">Juara setiap sesi yang telah diumumkan.</p>
          {!results.length ? (
            <div className="mt-8 rounded-2xl border border-dashed bg-white p-10 text-center text-muted-foreground">Belum ada hasil yang diumumkan.</div>
          ) : (
            <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {results.map((s) => (
                <div key={s.code} className="rounded-2xl border bg-white p-5 shadow-soft">
                  <p className="text-xs font-semibold uppercase tracking-wide text-electric-600">{s.level}</p>
                  <p className="font-heading text-lg font-bold text-navy-900">{s.name}</p>
                  <ol className="mt-4 space-y-2.5">
                    {s.winners!.map((w, i) => (
                      <li key={w.participant_id} className="flex items-center gap-3">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${MEDAL[i]}`}>{w.rank}</span>
                        <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-navy-900">{w.name}</span><span className="block truncate text-xs text-muted-foreground">{w.school}</span></span>
                        <b className="tabular text-sm text-navy-900">{fmtPoints(w.points)}</b>
                      </li>
                    ))}
                  </ol>
                  <Link to={`/hasil/${s.code}`} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-electric-600 hover:underline">Peringkat lengkap <ArrowRight className="h-4 w-4" /></Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* PANDUAN */}
      <section id="panduan" className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-3xl font-bold text-navy-900">Panduan peserta</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {GUIDE.map((g, i) => (
            <li key={g.title} className="relative rounded-2xl border p-5">
              <span className="absolute right-4 top-3 font-heading text-4xl font-extrabold text-navy-100">{i + 1}</span>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-electric-500 text-white"><g.icon className="h-5 w-5" /></span>
              <p className="mt-4 font-semibold text-navy-900">{g.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{g.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-navy-900 p-6 text-white">
            <p className="text-xs font-semibold uppercase tracking-widest text-electric-400">Penyelenggara</p>
            <p className="mt-2 font-heading text-2xl font-bold">{b.organizer}</p>
            <p className="mt-2 text-sm text-navy-200">Penyelenggara dan pemilik produk {b.app_name}.</p>
          </div>
          <div className="rounded-2xl border p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-flame-600">Pengembang</p>
            <p className="mt-2 font-heading text-2xl font-bold text-navy-900">{b.developer}</p>
            <p className="mt-2 text-sm text-muted-foreground">Perancang dan pengembang sistem kompetisi real-time ini.</p>
          </div>
        </div>
      </section>

      <footer className="bg-navy-950 py-10 text-center text-navy-200">
        <p className="font-heading text-lg font-bold tracking-wide text-white">LOMBA RANGKING 1</p>
        <p className="mt-1 text-sm">Produk {b.organizer}</p>
        <p className="text-sm">Dikembangkan oleh {b.developer}.</p>
      </footer>
    </div>
  )
}
