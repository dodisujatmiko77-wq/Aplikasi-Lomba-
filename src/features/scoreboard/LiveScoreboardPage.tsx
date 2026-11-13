// Monitor publik /live/:code — TV, proyektor, LED 16:9. Tanpa login; hanya data publik dari RPC get_live_state.
// Kunci jawaban hanya ada pada payload setelah soal berstatus "revealed".
import { memo, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Crown, Expand, Minimize, Radio, Trophy, Users, Wifi, WifiOff } from 'lucide-react'
import { rpc } from '@/services/db'
import { useLiveState } from '@/hooks/useLiveState'
import { useFullscreen } from '@/hooks/useFullscreen'
import { serverNow, useServerNow } from '@/hooks/useServerClock'
import { useQuestionCountdown } from '@/features/competition/Countdown'
import { cn } from '@/lib/utils'
import { fmtPoints, fmtSeconds, LABELS } from '@/utils/format'
import type { LeaderboardRow, LiveState } from '@/types'

const MEDAL = {
  1: { ring: 'ring-gold', bg: 'from-gold/90 to-amber-500', text: 'text-gold', chip: 'bg-gold text-navy-950' },
  2: { ring: 'ring-silver', bg: 'from-silver to-slate-400', text: 'text-silver', chip: 'bg-silver text-navy-950' },
  3: { ring: 'ring-bronze', bg: 'from-bronze to-orange-700', text: 'text-bronze', chip: 'bg-bronze text-white' },
} as const
const medal = (rank: number) => MEDAL[rank as 1 | 2 | 3]
const OPT = ['bg-blue-600', 'bg-orange-500', 'bg-emerald-600', 'bg-purple-600', 'bg-pink-600', 'bg-teal-600']

type Screen = 'waiting' | 'countdown' | 'question' | 'processing' | 'result' | 'leaderboard' | 'podium'
// semua ukuran memakai satuan cqw (lebar panggung) supaya layout 16:9 skala penuh di layar apa pun
const u = (n: number) => `${n}cqw`

function AnimatedNumber({ value, decimals = 2 }: { value: number; decimals?: number }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 900)
      const e = 1 - Math.pow(1 - k, 3)
      setShown(a + (value - a) * e)
      if (k < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{fmtPoints(Number(shown.toFixed(decimals)))}</>
}

const Row = memo(function Row({ r, gain, size }: { r: LeaderboardRow; gain?: number; size: number }) {
  const m = r.rank <= 3 ? medal(r.rank) : null
  return (
    <motion.li layout="position" transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      className={cn('relative flex items-center rounded-2xl border', m ? 'border-white/20 bg-white/[0.11]' : 'border-white/10 bg-white/[0.05]', r.is_eliminated && 'opacity-50')}
      style={{ padding: `${u(size * 0.18)} ${u(size * 0.35)}`, gap: u(size * 0.35) }}>
      <span className={cn('flex shrink-0 items-center justify-center rounded-xl font-heading font-extrabold tabular', m ? `bg-gradient-to-br ${m.bg} text-navy-950` : 'bg-white/10 text-white')}
        style={{ width: u(size * 0.95), height: u(size * 0.95), fontSize: u(size * 0.5) }}>{r.rank === 1 ? <Crown style={{ width: u(size * 0.55), height: u(size * 0.55) }} /> : r.rank}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold leading-tight" style={{ fontSize: u(size * 0.46) }}>{r.name}</span>
        <span className="block truncate text-navy-200" style={{ fontSize: u(size * 0.3) }}>{r.school}{r.district ? ` · ${r.district}` : ''}{r.is_eliminated ? ' · gugur' : ''}</span>
      </span>
      <span className="whitespace-nowrap text-right font-semibold tabular" style={{ fontSize: u(size * 0.42) }}>
        <span className="text-emerald-400">✓ {r.correct}</span>{'   '}<span className="text-red-400">✗ {r.wrong + r.unanswered}</span>
      </span>
      <span className="relative text-right font-heading font-extrabold tabular" style={{ minWidth: u(size * 2.6), fontSize: u(size * 0.6) }}>
        <span className={m?.text}><AnimatedNumber value={Number(r.points)} /></span>
        <AnimatePresence>
          {gain ? <motion.span key={gain} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: -4 }} exit={{ opacity: 0, y: -18 }} transition={{ duration: 0.5 }}
            className="absolute -top-[0.55em] right-0 font-bold text-emerald-400" style={{ fontSize: u(size * 0.34) }}>+{fmtPoints(gain)}</motion.span> : null}
        </AnimatePresence>
      </span>
    </motion.li>
  )
})

/** Mendeteksi pertambahan skor antar snapshot untuk animasi "+poin". */
function useGains(rows: LeaderboardRow[] | null) {
  const prev = useRef<Map<string, number>>(new Map())
  const [gains, setGains] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!rows) return
    const next: Record<string, number> = {}
    for (const r of rows) {
      const before = prev.current.get(r.participant_id)
      if (before !== undefined && Number(r.points) - before > 0.001) next[r.participant_id] = Number((Number(r.points) - before).toFixed(2))
      prev.current.set(r.participant_id, Number(r.points))
    }
    if (Object.keys(next).length) {
      setGains(next)
      const t = setTimeout(() => setGains({}), 3200)
      return () => clearTimeout(t)
    }
  }, [rows])
  return gains
}

function Board({ rows, limit, size }: { rows: LeaderboardRow[]; limit: number; size: number }) {
  const gains = useGains(rows)
  return (
    <ol className="flex flex-col" style={{ gap: u(size * 0.14) }}>
      {rows.slice(0, limit).map((r) => <Row key={r.participant_id} r={r} gain={gains[r.participant_id]} size={size} />)}
    </ol>
  )
}

function Podium({ winners }: { winners: LeaderboardRow[] }) {
  const by = (n: number) => winners.find((w) => w.rank === n)
  const slots: { rank: 1 | 2 | 3; h: number; delay: number }[] = [{ rank: 2, h: 14, delay: 1.2 }, { rank: 1, h: 20, delay: 2.2 }, { rank: 3, h: 9, delay: 0.4 }]
  return (
    <div className="relative flex h-full flex-col items-center justify-end" style={{ paddingBottom: u(3) }}>
      <motion.h2 initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="font-heading font-extrabold uppercase tracking-[0.2em] text-gold" style={{ fontSize: u(2.6), marginBottom: u(1) }}>
        <Trophy className="mr-[0.4em] inline" style={{ width: u(2.4), height: u(2.4) }} />Selamat kepada para juara
      </motion.h2>
      <div className="flex items-end justify-center" style={{ gap: u(2), width: '86%' }}>
        {slots.map(({ rank, h, delay }) => {
          const w = by(rank)
          const m = medal(rank)
          return (
            <div key={rank} className="flex flex-1 flex-col items-center" style={{ minWidth: 0 }}>
              {w && (
                <motion.div initial={{ opacity: 0, y: 30, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: delay + 0.5, type: 'spring', stiffness: 140, damping: 14 }} className="w-full text-center" style={{ marginBottom: u(1.2) }}>
                  {rank === 1 && <motion.div animate={{ rotate: [-6, 6, -6] }} transition={{ repeat: Infinity, duration: 2.4 }}><Crown className="mx-auto text-gold" style={{ width: u(3.6), height: u(3.6) }} /></motion.div>}
                  <p className="truncate font-heading font-extrabold" style={{ fontSize: u(rank === 1 ? 3.2 : 2.5) }}>{w.name}</p>
                  <p className="truncate text-navy-200" style={{ fontSize: u(1.7) }}>{w.school}</p>
                  <p className={cn('font-heading font-extrabold tabular', m.text)} style={{ fontSize: u(rank === 1 ? 3.4 : 2.6) }}>{fmtPoints(w.points)} <span className="font-semibold text-navy-200" style={{ fontSize: u(1.5) }}>poin</span></p>
                </motion.div>
              )}
              <motion.div initial={{ height: 0 }} animate={{ height: u(h) }} transition={{ delay, duration: 1, ease: 'easeOut' }}
                className={cn('flex w-full items-start justify-center overflow-hidden rounded-t-3xl bg-gradient-to-b shadow-2xl', m.bg)}>
                <span className="font-heading font-extrabold text-navy-950/80" style={{ fontSize: u(rank === 1 ? 9 : 6.5), lineHeight: 1.1 }}>{rank}</span>
              </motion.div>
            </div>
          )
        })}
      </div>
      <Confetti />
    </div>
  )
}

function Confetti() {
  const pieces = useRef(Array.from({ length: 46 }, (_, i) => ({ i, x: Math.random() * 100, d: 3 + Math.random() * 3, delay: 2.2 + Math.random() * 3, c: ['#f5c542', '#1f7bff', '#f97316', '#ffffff', '#c9d1dc'][i % 5], r: Math.random() * 360 })))
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.current.map((p) => (
        <motion.span key={p.i} initial={{ y: '-10%', opacity: 0, rotate: 0 }} animate={{ y: '110%', opacity: [0, 1, 1, 0], rotate: p.r + 540 }} transition={{ delay: p.delay, duration: p.d, repeat: Infinity, repeatDelay: 1.5, ease: 'linear' }}
          className="absolute top-0 block rounded-sm" style={{ left: `${p.x}%`, width: u(0.8), height: u(1.4), background: p.c }} />
      ))}
    </div>
  )
}

function CountdownScreen({ startsAt, seq, total }: { startsAt: string; seq: number; total: number }) {
  const now = useServerNow(50)
  const secs = Math.max(0, Math.ceil((Date.parse(startsAt) - now) / 1000))
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <p className="font-heading font-bold uppercase tracking-[0.3em] text-electric-400" style={{ fontSize: u(2.2) }}>Soal {seq} dari {total}</p>
      <div className="relative flex items-center justify-center" style={{ width: u(26), height: u(26), marginTop: u(2) }}>
        <span className="absolute inset-0 animate-pulse-ring rounded-full border-2 border-electric-400/60" />
        <AnimatePresence mode="popLayout"><motion.span key={secs} initial={{ scale: 1.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.35 }}
          className="font-heading font-extrabold tabular" style={{ fontSize: u(20), lineHeight: 1 }}>{secs || '!'}</motion.span></AnimatePresence>
      </div>
      <p className="text-navy-200" style={{ fontSize: u(2.4), marginTop: u(2) }}>Bersiap membaca soal…</p>
    </div>
  )
}

function QuestionScreen({ s }: { s: LiveState }) {
  const q = s.question!
  const cd = useQuestionCountdown(q, q.status === 'active')
  const frac = cd?.fraction ?? 0
  const urgent = frac < 0.25 && cd?.phase === 'running'
  return (
    <div className="flex h-full flex-col" style={{ gap: u(1.6) }}>
      <div className="flex items-center" style={{ gap: u(2) }}>
        <span className="rounded-2xl bg-white/10 font-heading font-extrabold" style={{ padding: `${u(0.6)} ${u(1.6)}`, fontSize: u(2.4) }}>Soal {q.sequence}<span className="text-navy-300">/{q.total}</span></span>
        {q.category && <span className="rounded-full bg-electric-500/20 font-semibold text-electric-400" style={{ padding: `${u(0.4)} ${u(1.2)}`, fontSize: u(1.6) }}>{q.category}</span>}
        <div className="ml-auto flex items-center" style={{ gap: u(1.4) }}>
          <span className="text-navy-200" style={{ fontSize: u(1.8) }}><Check className="mr-1 inline" style={{ width: u(1.8), height: u(1.8) }} />{s.counts.answered}/{s.counts.active} sudah menjawab</span>
          <motion.span animate={urgent ? { scale: [1, 1.08, 1], color: ['#fff', '#f87171', '#fff'] } : {}} transition={{ repeat: Infinity, duration: 0.8 }}
            className="font-heading font-extrabold tabular" style={{ fontSize: u(7), lineHeight: 1, minWidth: u(9), textAlign: 'right' }}>{cd?.seconds ?? 0}</motion.span>
        </div>
      </div>
      <div className="overflow-hidden rounded-full bg-white/10" style={{ height: u(1) }}>
        <div className={cn('h-full rounded-full transition-[width] duration-100 ease-linear', frac > 0.5 ? 'bg-emerald-400' : frac > 0.25 ? 'bg-amber-400' : 'bg-red-500')} style={{ width: `${frac * 100}%` }} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-center" style={{ gap: u(2) }}>
        <div className="flex items-center" style={{ gap: u(2.4) }}>
          {q.image_url && <img src={q.image_url} alt="" className="shrink-0 rounded-2xl object-contain" style={{ maxHeight: u(18), maxWidth: u(26) }} />}
          <h2 className="font-heading font-bold leading-tight text-balance" style={{ fontSize: u(q.text.length > 140 ? 2.7 : q.text.length > 80 ? 3.3 : 4) }}>{q.text}</h2>
        </div>
        {q.type === 'short_answer'
          ? <p className="rounded-2xl border border-dashed border-white/25 text-center text-navy-200" style={{ padding: u(2), fontSize: u(2.4) }}>Ketik jawaban singkat di HP masing-masing</p>
          : (
            <div className={cn('grid', q.options.length > 2 ? 'grid-cols-2' : 'grid-cols-1')} style={{ gap: u(1.4) }}>
              {q.options.map((o, i) => (
                <div key={o.id} className="flex items-center rounded-2xl border border-white/15 bg-white/[0.08]" style={{ gap: u(1.4), padding: `${u(1.1)} ${u(1.6)}` }}>
                  <span className={cn('flex shrink-0 items-center justify-center rounded-xl font-heading font-extrabold', OPT[i % 6])} style={{ width: u(4.4), height: u(4.4), fontSize: u(2.4) }}>{o.label}</span>
                  <span className="font-semibold leading-snug" style={{ fontSize: u(2.6) }}>{o.text}</span>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  )
}

function ProcessingScreen({ s }: { s: LiveState }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }} className="rounded-full border-electric-400 border-t-transparent" style={{ width: u(9), height: u(9), borderWidth: u(0.8), borderStyle: 'solid' }} />
      <p className="font-heading font-extrabold" style={{ fontSize: u(4), marginTop: u(3) }}>Waktu habis — memproses jawaban…</p>
      <p className="text-navy-200" style={{ fontSize: u(2.4), marginTop: u(1) }}>{s.counts.answered} dari {s.counts.active} peserta menjawab</p>
    </div>
  )
}

function ResultScreen({ s }: { s: LiveState }) {
  const q = s.question!
  const r = q.reveal
  const max = Math.max(1, ...q.options.map((o) => o.count ?? 0))
  const top = (s.leaderboard ?? []).slice(0, 5)
  return (
    <div className="grid h-full grid-cols-[1.35fr_1fr]" style={{ gap: u(2.4) }}>
      <div className="flex min-h-0 flex-col" style={{ gap: u(1.6) }}>
        <p className="font-heading font-bold uppercase tracking-[0.25em] text-emerald-400" style={{ fontSize: u(1.9) }}>Jawaban benar · Soal {q.sequence}</p>
        <h2 className="font-heading font-bold leading-tight" style={{ fontSize: u(2.7) }}>{q.text}</h2>
        {q.type === 'short_answer' ? (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-3xl border-2 border-emerald-400 bg-emerald-500/15 text-center" style={{ padding: u(2.6) }}>
            <p className="font-heading font-extrabold text-emerald-300" style={{ fontSize: u(5.5) }}>{r?.correct_text}</p>
            {!!r?.accepted && r.accepted.length > 1 && <p className="text-navy-200" style={{ fontSize: u(1.8), marginTop: u(0.8) }}>Juga diterima: {r.accepted.slice(1).join(', ')}</p>}
          </motion.div>
        ) : (
          <ul className="flex flex-col" style={{ gap: u(1) }}>
            {q.options.map((o, i) => (
              <motion.li key={o.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: o.is_correct ? 1 : 0.55, x: 0 }} transition={{ delay: i * 0.08 }}
                className={cn('relative overflow-hidden rounded-2xl border', o.is_correct ? 'border-emerald-400 bg-emerald-500/20' : 'border-white/10 bg-white/5')} style={{ padding: `${u(0.9)} ${u(1.4)}` }}>
                <span className="absolute inset-y-0 left-0 bg-white/10" style={{ width: `${((o.count ?? 0) / max) * 100}%` }} />
                <span className="relative flex items-center" style={{ gap: u(1.2) }}>
                  <span className={cn('flex shrink-0 items-center justify-center rounded-lg font-heading font-extrabold', o.is_correct ? 'bg-emerald-500' : 'bg-white/15')} style={{ width: u(3.4), height: u(3.4), fontSize: u(1.9) }}>{o.is_correct ? <Check style={{ width: u(2.4), height: u(2.4) }} /> : o.label}</span>
                  <span className="flex-1 font-semibold" style={{ fontSize: u(2.2) }}>{o.text}</span>
                  <span className="font-bold tabular text-navy-100" style={{ fontSize: u(2) }}>{o.count ?? 0}</span>
                </span>
              </motion.li>
            ))}
          </ul>
        )}
        {r && (
          <div className="flex flex-wrap text-navy-100" style={{ gap: u(1.6), fontSize: u(1.8) }}>
            <span className="rounded-full bg-white/10" style={{ padding: `${u(0.4)} ${u(1.2)}` }}>Benar: <b>{r.correct_count}</b> dari {r.answered}</span>
            {r.fastest && <span className="rounded-full bg-amber-400/20 text-amber-300" style={{ padding: `${u(0.4)} ${u(1.2)}` }}>⚡ Tercepat: <b>{r.fastest.name}</b> · {fmtSeconds(r.fastest.ms)}</span>}
          </div>
        )}
        {r?.explanation && <p className="text-navy-200" style={{ fontSize: u(1.7) }}>{r.explanation}</p>}
      </div>
      <div className="rounded-3xl border border-white/10 bg-white/[0.04]" style={{ padding: u(1.6) }}>
        <p className="font-heading font-bold uppercase tracking-widest text-navy-200" style={{ fontSize: u(1.6), marginBottom: u(1) }}>Klasemen sementara</p>
        <Board rows={top} limit={5} size={2.3} />
      </div>
    </div>
  )
}

function WaitingScreen({ s, paused }: { s: LiveState; paused: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <img src={s.session.logo_url || '/logo.png'} alt="" className="object-contain" style={{ height: u(s.session.logo_url ? 11 : 17), maxWidth: u(26) }} />
      <p className="font-heading font-extrabold leading-tight text-balance" style={{ fontSize: u(5), marginTop: u(2.4) }}>{s.session.event_name}</p>
      <p className="font-heading font-bold text-electric-400" style={{ fontSize: u(3), marginTop: u(0.8) }}>{s.session.name} · {s.session.level}</p>
      <div className="inline-flex items-center rounded-full bg-white/10" style={{ gap: u(1.2), padding: `${u(0.8)} ${u(2.4)}`, marginTop: u(3), fontSize: u(2.4) }}>
        {paused ? <span className="font-bold text-amber-300">⏸ Lomba dijeda</span> : <><span className="h-[0.6em] w-[0.6em] animate-pulse rounded-full bg-emerald-400" /> {s.session.status === 'draft' ? 'Sesi belum dibuka' : s.notice ?? 'Menunggu operator memulai…'}</>}
      </div>
      <p className="flex items-center text-navy-200" style={{ gap: u(0.8), fontSize: u(2.2), marginTop: u(2.4) }}><Users style={{ width: u(2.4), height: u(2.4) }} />{s.counts.online} dari {s.counts.participants} peserta online</p>
      <p className="text-navy-300" style={{ fontSize: u(1.8), marginTop: u(3) }}>Peserta masuk di <b className="text-white">{location.host}/peserta</b></p>
      <p className="italic text-navy-300" style={{ fontSize: u(1.7), marginTop: u(0.6) }}>Siapa Cepat, Siapa Tepat, Dialah Juara!</p>
    </div>
  )
}

function LeaderboardScreen({ s }: { s: LiveState }) {
  const rows = s.leaderboard ?? []
  const n = rows.length > 8 ? 10 : Math.max(5, rows.length)
  return (
    <div className="flex h-full flex-col" style={{ gap: u(1.2) }}>
      <h2 className="font-heading font-extrabold" style={{ fontSize: u(3.6) }}><Trophy className="mr-[0.4em] inline text-gold" style={{ width: u(3.4), height: u(3.4) }} />Klasemen · {s.round?.name ?? s.session.name}</h2>
      <div className="min-h-0 flex-1"><Board rows={rows} limit={n} size={n > 8 ? 2.35 : 3} /></div>
    </div>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="stage-bg flex h-screen w-screen items-center justify-center overflow-hidden text-white">
      <div className="grid-lines relative" style={{ width: 'min(100vw, 177.78vh)', height: 'min(56.25vw, 100vh)', containerType: 'size' }}>{children}</div>
    </div>
  )
}

export default function LiveScoreboardPage() {
  const { code = '' } = useParams()
  const { isFullscreen, toggle } = useFullscreen()
  const { data, error, link, answered } = useLiveState<LiveState>({
    fetcher: () => rpc<LiveState>('get_live_state', { p_code: code }), code: code.toUpperCase(), fastPollMs: 1500, slowPollMs: 5000, jitterMs: 150,
  })
  const [hideUi, setHideUi] = useState(false)
  useEffect(() => {
    let t: number
    const show = () => { setHideUi(false); window.clearTimeout(t); t = window.setTimeout(() => setHideUi(true), 4000) }
    show()
    window.addEventListener('mousemove', show); window.addEventListener('keydown', show)
    return () => { window.clearTimeout(t); window.removeEventListener('mousemove', show); window.removeEventListener('keydown', show) }
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'f') toggle() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  if (!data) {
    return (
      <Frame>
        <div className="flex h-full items-center justify-center text-center" style={{ fontSize: u(2.6) }}>
          {error && /tidak ditemukan|NOT_FOUND/i.test(error) ? 'Sesi tidak ditemukan. Periksa kode pada tautan monitor.' : 'Menghubungkan ke server…'}
        </div>
      </Frame>
    )
  }
  if (data.ok === false) return <Frame><div className="flex h-full items-center justify-center" style={{ fontSize: u(3) }}>{data.message ?? 'Sesi tidak ditemukan'}</div></Frame>

  const s = { ...data, counts: { ...data.counts, answered: Math.max(answered, data.counts.answered) } }
  const paused = s.session.status === 'paused'
  const q = s.question
  let screen: Screen = 'waiting'
  if (s.session.status === 'finished' || s.session.display_screen === 'podium') screen = s.winners?.length ? 'podium' : 'leaderboard'
  else if (paused) screen = 'waiting'
  else if (s.upcoming && serverNow() < Date.parse(s.upcoming.starts_at) + 150) screen = 'countdown'
  else if (s.session.display_screen === 'leaderboard' && s.leaderboard) screen = 'leaderboard'
  else if (q) screen = q.status === 'active' ? 'question' : q.status === 'closed' ? 'processing' : 'result'

  return (
    <Frame>
      <div className="absolute inset-0 flex flex-col" style={{ padding: `${u(1.6)} ${u(2.6)} ${u(2)}` }}>
        <header className="flex shrink-0 items-center" style={{ gap: u(1.4), marginBottom: u(1.2) }}>
          {s.session.logo_url ? <img src={s.session.logo_url} alt="" className="rounded-xl object-cover" style={{ width: u(3.6), height: u(3.6) }} /> : <img src="/logo-mark.png" alt="" className="object-contain" style={{ width: u(4.4), height: u(4.4) }} />}
          <div className="min-w-0 leading-tight">
            <p className="truncate font-heading font-bold" style={{ fontSize: u(1.9) }}>{s.session.event_name}</p>
            <p className="truncate text-navy-200" style={{ fontSize: u(1.3) }}>{s.session.level} · {s.session.name}{s.round ? ` · ${s.round.name} (${LABELS.roundMode[s.round.mode]})` : ''}</p>
          </div>
          <div className="ml-auto flex items-center" style={{ gap: u(1.2), fontSize: u(1.3) }}>
            <span className="rounded-full bg-white/10 text-navy-100" style={{ padding: `${u(0.3)} ${u(1)}` }}><Users className="mr-1 inline" style={{ width: u(1.4), height: u(1.4) }} />{s.counts.active} aktif</span>
            <span className={cn('rounded-full font-semibold', s.session.status === 'running' ? 'bg-emerald-500/25 text-emerald-300' : paused ? 'bg-amber-500/25 text-amber-300' : 'bg-white/10 text-navy-100')} style={{ padding: `${u(0.3)} ${u(1)}` }}>
              {s.session.status === 'running' && <Radio className="mr-1 inline animate-pulse" style={{ width: u(1.3), height: u(1.3) }} />}{LABELS.sessionStatus[s.session.status].toUpperCase()}
            </span>
            {link !== 'live' && <span className="text-amber-300" title="Mode cadangan (polling)">{link === 'offline' ? <WifiOff style={{ width: u(1.5), height: u(1.5) }} /> : <Wifi style={{ width: u(1.5), height: u(1.5) }} />}</span>}
          </div>
        </header>
        <main className="relative min-h-0 flex-1">
          <AnimatePresence mode="wait">
            <motion.div key={screen + (screen === 'question' || screen === 'result' || screen === 'processing' ? q?.id : '')} className="h-full" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.28 }}>
              {screen === 'waiting' && <WaitingScreen s={s} paused={paused} />}
              {screen === 'countdown' && s.upcoming && <CountdownScreen startsAt={s.upcoming.starts_at} seq={s.upcoming.sequence} total={s.upcoming.total} />}
              {screen === 'question' && q && <QuestionScreen s={s} />}
              {screen === 'processing' && <ProcessingScreen s={s} />}
              {screen === 'result' && q && <ResultScreen s={s} />}
              {screen === 'leaderboard' && <LeaderboardScreen s={s} />}
              {screen === 'podium' && s.winners && <Podium winners={s.winners} />}
            </motion.div>
          </AnimatePresence>
        </main>
        <footer className="flex shrink-0 justify-between text-navy-300" style={{ fontSize: u(1.1), marginTop: u(0.8) }}>
          <span>LOMBA RANGKING 1 · Produk UPT SMPN 1 Baradatu</span>{s.session.organizer && <span>Penyelenggara: {s.session.organizer}</span>}<span>Dikembangkan oleh Dodi Sujatmiko</span>
        </footer>
      </div>
      <button onClick={toggle} aria-label={isFullscreen ? 'Keluar layar penuh' : 'Layar penuh'}
        className={cn('absolute bottom-[3%] right-[2%] rounded-full bg-white/10 p-[0.9cqw] text-white backdrop-blur transition-opacity hover:bg-white/25', hideUi && 'opacity-0')}>
        {isFullscreen ? <Minimize style={{ width: u(1.8), height: u(1.8) }} /> : <Expand style={{ width: u(1.8), height: u(1.8) }} />}
      </button>
    </Frame>
  )
}
