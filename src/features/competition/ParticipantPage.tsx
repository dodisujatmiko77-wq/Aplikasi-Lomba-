import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Hourglass, LogOut, PauseCircle, Send, Skull, Trophy, WifiOff, XCircle } from 'lucide-react'
import { rpc } from '@/services/db'
import { useLiveState } from '@/hooks/useLiveState'
import { serverNow, useServerNow } from '@/hooks/useServerClock'
import { Logo } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TimerBar, useQuestionCountdown } from './Countdown'
import { cn } from '@/lib/utils'
import { fmtPoints, fmtSeconds } from '@/utils/format'
import type { ParticipantState } from '@/types'

const TOKEN_KEY = 'lr1.participant.token'
const store = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } },
  set: (v: string | null) => { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY) } catch { /* abaikan */ } },
}
const LABELS_ABC = ['A', 'B', 'C', 'D', 'E', 'F']
const OPT_COLORS = ['bg-blue-600', 'bg-orange-500', 'bg-emerald-600', 'bg-purple-600', 'bg-pink-600', 'bg-teal-600']

function Shell({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return <div className={cn('min-h-[100dvh] w-full', dark ? 'stage-bg text-white' : 'bg-background')}>{children}</div>
}

function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [code, setCode] = useState('')
  const [pin, setPin] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const r = await rpc<{ ok: boolean; token?: string; message?: string }>('participant_login', { p_code: code, p_pin: pin })
      if (!r.ok || !r.token) throw new Error(r.message ?? 'Gagal masuk')
      onLogin(r.token)
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Gagal masuk') } finally { setBusy(false) }
  }
  return (
    <Shell dark>
      <div className="mx-auto flex min-h-[100dvh] max-w-sm flex-col justify-center px-6 py-10">
        <div className="mb-6 flex flex-col items-center gap-1"><Logo variant="full" size={130} /><p className="text-sm font-semibold text-navy-200">Masuk peserta</p></div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-5 text-foreground shadow-2xl">
          <label className="block space-y-1.5"><span className="text-sm font-medium">Kode peserta</span>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="username" autoCorrect="off" spellCheck={false} required className="h-14 text-center font-mono text-2xl font-bold tracking-[0.2em]" placeholder="R7K2MQ" /></label>
          <label className="block space-y-1.5"><span className="text-sm font-medium">PIN</span>
            <Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} inputMode="numeric" autoComplete="current-password" type="password" required className="h-14 text-center text-2xl font-bold tracking-[0.4em]" placeholder="••••••" /></label>
          {err && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          <Button type="submit" size="lg" variant="flame" className="h-14 w-full text-lg" loading={busy}>Masuk</Button>
        </form>
        <Link to="/" className="mt-6 text-center text-sm text-navy-200 hover:text-white">← Kembali ke beranda</Link>
      </div>
    </Shell>
  )
}

function Header({ s, onLogout, link }: { s: ParticipantState; onLogout: () => void; link: string }) {
  const p = s.participant
  return (
    <header className="flex items-center gap-3 border-b bg-white px-4 py-2.5">
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-navy-900">{p.name}</p><p className="truncate text-xs text-muted-foreground">No. {p.number} · {p.school || p.district}</p></div>
      {link === 'offline' && <WifiOff className="h-4 w-4 text-red-500" aria-label="Offline" />}
      <button onClick={onLogout} className="rounded-md p-2 text-muted-foreground hover:bg-secondary" aria-label="Keluar"><LogOut className="h-4 w-4" /></button>
    </header>
  )
}

function Center({ icon, title, text, tone = 'navy' }: { icon: React.ReactNode; title: string; text?: string; tone?: 'navy' | 'green' | 'red' | 'orange' }) {
  const tones = { navy: 'bg-navy-100 text-navy-700', green: 'bg-emerald-100 text-emerald-700', red: 'bg-red-100 text-red-700', orange: 'bg-orange-100 text-orange-700' }
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
      <span className={cn('flex h-20 w-20 items-center justify-center rounded-full [&_svg]:h-10 [&_svg]:w-10', tones[tone])}>{icon}</span>
      <p className="font-heading text-2xl font-bold text-navy-900 text-balance">{title}</p>
      {text && <p className="max-w-xs text-muted-foreground">{text}</p>}
    </motion.div>
  )
}

type SubmitState = { status: 'idle' | 'sending' | 'done' | 'error'; message?: string }

function QuestionView({ s, refresh }: { s: ParticipantState; refresh: () => void }) {
  const q = s.question!
  const cd = useQuestionCountdown(q, q.status === 'active')
  const [selected, setSelected] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [sub, setSub] = useState<SubmitState>({ status: 'idle' })
  const keyRef = useRef<{ q: string; key: string } | null>(null)
  useEffect(() => { setSelected(null); setText(''); setSub({ status: 'idle' }); keyRef.current = null }, [q.id])

  const mine = s.my_answer
  const answered = !!mine || sub.status === 'done'
  const active = q.status === 'active' && cd?.phase === 'running' && s.session?.status === 'running'
  const canAnswer = active && !answered && !s.me?.is_eliminated && s.me?.on_roster !== false

  const send = useCallback(async () => {
    if (sub.status === 'sending') return
    if (q.type === 'short_answer' ? !text.trim() : !selected) return
    // idempotency key tetap sama untuk percobaan ulang pada soal yang sama
    if (!keyRef.current || keyRef.current.q !== q.id) keyRef.current = { q: q.id, key: crypto.randomUUID() }
    setSub({ status: 'sending' })
    const token = store.get()
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await rpc<{ ok: boolean; code?: string; message?: string }>('submit_answer', {
          p_token: token, p_competition_question_id: q.id, p_option_id: q.type === 'short_answer' ? null : selected,
          p_answer_text: q.type === 'short_answer' ? text.trim() : null, p_idempotency_key: keyRef.current.key,
        })
        if (r.ok || r.code === 'ALREADY_ANSWERED') { setSub({ status: 'done' }); refresh(); return }
        setSub({ status: 'error', message: r.message ?? 'Jawaban ditolak' }); refresh(); return
      } catch {
        // gangguan jaringan: kirim ulang dengan key yang sama selama masih ada waktu (server yang memutuskan)
        if (Date.parse(q.deadline_at) + 2000 < serverNow()) break
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
      }
    }
    setSub({ status: 'error', message: 'Koneksi terputus. Periksa jaringan lalu coba kirim lagi.' })
  }, [q, selected, text, sub.status, refresh])

  const revealed = q.status === 'revealed'
  const header = (
    <div className="bg-navy-900 px-4 pb-3 pt-3 text-white">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-navy-200"><span>Soal {q.sequence} / {q.total}</span>{q.category && <span>{q.category}</span>}</div>
      {q.status === 'active' && cd && (
        <div className="mt-2 flex items-center gap-3"><TimerBar fraction={cd.fraction} className="flex-1 bg-white/15" /><span className="tabular w-10 text-right font-heading text-2xl font-extrabold">{cd.seconds}</span></div>
      )}
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <h2 className="text-xl font-bold leading-snug text-navy-900">{q.text}</h2>
        {q.image_url && <img src={q.image_url} alt="" className="max-h-56 w-full rounded-xl border object-contain" />}
        {q.type === 'short_answer' ? (
          <Input value={text} onChange={(e) => setText(e.target.value)} disabled={!canAnswer || sub.status === 'sending'} autoComplete="off" autoCorrect="off" spellCheck={false} placeholder="Ketik jawaban…" className="h-16 text-xl" />
        ) : (
          <div className="grid gap-3">
            {q.options.map((o, i) => {
              const chosen = (mine?.option_id ?? selected) === o.id
              const wasMine = mine?.option_id === o.id
              return (
                <button key={o.id} disabled={!canAnswer || sub.status === 'sending'} onClick={() => setSelected(o.id)} aria-pressed={chosen}
                  className={cn('flex min-h-[64px] items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-lg font-semibold transition active:scale-[0.99]',
                    revealed && o.is_correct ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : revealed && wasMine ? 'border-red-400 bg-red-50 text-red-900'
                    : chosen ? 'border-electric-500 bg-blue-50 text-navy-900 ring-2 ring-electric-500/40' : 'border-border bg-white text-navy-900 disabled:opacity-60')}>
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base font-bold text-white', OPT_COLORS[i % 6])}>{LABELS_ABC[i] ?? o.label}</span>
                  <span className="flex-1">{o.text}</span>
                  {revealed && o.is_correct && <CheckCircle2 className="h-6 w-6 text-emerald-600" />}
                </button>
              )
            })}
          </div>
        )}

        {answered && !revealed && (
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900"><CheckCircle2 className="h-7 w-7 shrink-0" /><div><p className="font-bold">Jawaban terkirim</p><p className="text-sm">{mine ? `Dalam ${fmtSeconds(mine.response_time_ms)}. ` : ''}Tunggu hasil dibuka operator.</p></div></div>
        )}
        {!answered && q.status !== 'active' && !revealed && <p className="rounded-2xl bg-amber-50 p-4 text-center font-semibold text-amber-900">Waktu habis. Jawaban tidak diterima.</p>}
        {sub.status === 'error' && <p role="alert" className="rounded-2xl bg-red-50 p-3 text-sm font-medium text-red-800">{sub.message}</p>}
        {revealed && (
          <div className={cn('rounded-2xl p-4', mine ? (mine.is_correct ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900') : 'bg-slate-100 text-slate-700')}>
            <p className="flex items-center gap-2 text-lg font-bold">{mine ? (mine.is_correct ? <><CheckCircle2 /> Benar! +{fmtPoints(mine.points)} poin</> : <><XCircle /> Kurang tepat · 0 poin</>) : 'Anda tidak menjawab soal ini'}</p>
            {q.reveal && <p className="mt-1 text-sm">Jawaban benar: <b>{q.reveal.correct_text}</b></p>}
            {q.reveal?.explanation && <p className="mt-2 text-sm opacity-90">{q.reveal.explanation}</p>}
            {s.me?.rank && <p className="mt-2 text-sm font-semibold">Peringkat Anda: #{s.me.rank} · {fmtPoints(s.me.points)} poin</p>}
          </div>
        )}
      </div>
      {canAnswer && (
        <div className="border-t bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button size="lg" variant="flame" className="h-14 w-full text-lg" loading={sub.status === 'sending'} disabled={q.type === 'short_answer' ? !text.trim() : !selected} onClick={() => void send()}><Send /> Kirim jawaban</Button>
          <p className="mt-1.5 text-center text-xs text-muted-foreground">Jawaban tidak dapat diubah setelah dikirim.</p>
        </div>
      )}
    </div>
  )
}

function Lead({ s }: { s: ParticipantState }) {
  const u = s.upcoming!
  const now = useServerNow(100)
  const secs = Math.max(0, Math.ceil((Date.parse(u.starts_at) - now) / 1000))
  return (
    <div className="stage-bg flex flex-1 flex-col items-center justify-center text-white">
      <p className="text-sm font-semibold uppercase tracking-widest text-electric-400">Soal {u.sequence} dari {u.total}</p>
      <AnimatePresence mode="popLayout"><motion.p key={secs} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="tabular font-heading text-[9rem] font-extrabold leading-none">{secs || '•'}</motion.p></AnimatePresence>
      <p className="text-navy-200">Bersiap…</p>
    </div>
  )
}

export default function ParticipantPage() {
  const [token, setToken] = useState<string | null>(store.get())
  const fetcher = useCallback(() => rpc<ParticipantState & { ok: boolean; code?: string }>('participant_get_state', { p_token: token }), [token])
  const { data, link, refresh } = useLiveState<ParticipantState & { ok: boolean }>({ fetcher, enabled: !!token, jitterMs: 400, fastPollMs: 2500, slowPollMs: 10000 })
  // Jaga layar HP tetap menyala selama peserta masuk (tidak mati di tengah soal).
  useEffect(() => {
    if (!token || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    const acquire = async () => {
      try { lock = await navigator.wakeLock.request('screen') } catch { /* tidak didukung atau ditolak: abaikan */ }
    }
    void acquire()
    const onVisible = () => { if (document.visibilityState === 'visible') void acquire() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { document.removeEventListener('visibilitychange', onVisible); void lock?.release().catch(() => undefined) }
  }, [token])
  const logout = () => { void rpc('participant_logout', { p_token: token }).catch(() => undefined); store.set(null); setToken(null) }

  useEffect(() => { if (data && (data as { ok: boolean; code?: string }).ok === false) { store.set(null); setToken(null) } }, [data])
  if (!token) return <Login onLogin={(t) => { store.set(t); setToken(t) }} />
  if (!data || !data.participant) return <Shell><div className="flex min-h-[100dvh] items-center justify-center text-muted-foreground">Menghubungkan…</div></Shell>

  const s = data
  const sess = s.session
  let body: React.ReactNode
  if (!sess) {
    body = <Center icon={<Hourglass />} title="Belum ada sesi yang dibuka" text="Tetap di halaman ini. Sesi akan muncul otomatis saat panitia membukanya." />
  } else if (sess.status === 'finished') {
    const win = s.winners
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-amber-600"><Trophy className="h-10 w-10" /></span>
        <p className="font-heading text-2xl font-bold">Lomba selesai</p>
        {s.me?.rank && <p className="text-lg">Peringkat Anda <b className="font-heading text-3xl text-electric-600">#{s.me.rank}</b><br /><span className="text-muted-foreground">{fmtPoints(s.me.points)} poin · {s.me.correct} benar</span></p>}
        {win && <ol className="w-full max-w-xs space-y-1.5 text-left">{win.map((w) => <li key={w.participant_id} className="flex gap-2 rounded-lg bg-white p-2.5 shadow-sm"><b className="w-6 text-center">{w.rank}</b><span className="truncate">{w.name}</span><b className="tabular ml-auto">{fmtPoints(w.points)}</b></li>)}</ol>}
      </div>
    )
  } else if (s.me?.is_eliminated && !s.question) {
    body = <Center tone="red" icon={<Skull />} title="Anda tereliminasi" text={s.me.elimination_reason ?? 'Terima kasih sudah berjuang. Tetap semangat!'} />
  } else if (sess.status === 'paused') {
    body = <Center tone="orange" icon={<PauseCircle />} title="Lomba dijeda" text="Tunggu operator melanjutkan. Waktu menjawab tidak berkurang." />
  } else if (s.upcoming) {
    body = <Lead s={s} />
  } else if (s.question) {
    body = <QuestionView s={s as ParticipantState} refresh={() => void refresh()} />
  } else if (s.notice) {
    body = <Center tone="orange" icon={<XCircle />} title={s.notice} text="Soal berikutnya akan segera ditayangkan." />
  } else if (sess.status === 'open') {
    body = <Center icon={<Hourglass />} title="Anda sudah masuk" text={`${sess.name}. Menunggu operator memulai lomba — jangan tutup halaman ini.`} />
  } else if (s.leaderboard && sess.display_screen === 'leaderboard') {
    body = <Center icon={<Trophy />} title={s.me?.rank ? `Peringkat Anda #${s.me.rank}` : 'Klasemen sementara'} text={s.me?.points !== undefined ? `${fmtPoints(s.me.points)} poin` : undefined} />
  } else {
    body = <Center icon={<Hourglass />} title="Bersiap untuk soal berikutnya" text={s.me?.rank ? `Peringkat saat ini #${s.me.rank} · ${fmtPoints(s.me.points)} poin` : undefined} />
  }

  return (
    <Shell>
      <div className="mx-auto flex h-[100dvh] max-w-md flex-col bg-background shadow-xl">
        <Header s={s} onLogout={logout} link={link} />
        {s.me?.is_eliminated && s.question && <div className="bg-red-600 px-4 py-1.5 text-center text-sm font-semibold text-white">Anda tereliminasi — hanya dapat menonton</div>}
        {body}
      </div>
    </Shell>
  )
}
