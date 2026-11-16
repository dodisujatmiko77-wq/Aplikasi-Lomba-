import { AnimatePresence, motion } from 'framer-motion'
import { BellOff, Smartphone } from 'lucide-react'
import { PRAYER_LABEL, fmtCountdown, pad, type Phase } from '@/lib/prayer'
import type { PrayerSchedule } from '@/lib/types'
import { Divider, MosqueMark } from './Ornament'

interface Props {
  phase: Phase
  isFriday: boolean
  clock: { h: number; m: number; s: number }
  prayer: PrayerSchedule
  mosqueName: string
}

const Silent = () => (
  <p className="mt-10 flex items-center gap-4 rounded-full border px-9 py-4 text-tv-lg font-medium" style={{ borderColor: 'rgba(255,255,255,.25)', background: 'rgba(255,255,255,.08)' }}>
    <span className="relative flex">
      <Smartphone className="h-[1.3em] w-[1.3em]" />
      <BellOff className="absolute -right-3 -top-2 h-[0.8em] w-[0.8em] text-[var(--tv-accent)]" />
    </span>
    Mohon nonaktifkan atau senyapkan suara perangkat Anda
  </p>
)

/** Mode layar penuh saat waktu salat: adzan → hitung mundur iqamah → salat berlangsung (atau khutbah Jumat). */
export function PrayerOverlay({ phase, isFriday, clock, prayer, mosqueName }: Props) {
  const active = phase.type !== 'normal'
  const name = active ? (phase.key === 'zuhur' && isFriday ? 'Jumat' : PRAYER_LABEL[phase.key]) : ''
  const time = `${pad(clock.h)}:${pad(clock.m)}`
  return (
    <AnimatePresence>
      {active && (
        <motion.div key="overlay" className="absolute inset-0 z-40 flex flex-col items-center justify-center overflow-hidden text-center text-white"
          style={{ background: phase.type === 'salat' ? '#010d0a' : 'radial-gradient(circle at 50% 30%, #065f46 0%, #022c22 55%, #011712 100%)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1 }} data-testid="tv-overlay" data-phase={phase.type}>
          <div className="islamic-pattern absolute inset-0" style={{ opacity: phase.type === 'salat' ? 0.025 : 0.06 }} />
          <AnimatePresence mode="wait">
            <motion.div key={phase.type} className="relative flex flex-col items-center px-16" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.8 }}>
              {phase.type === 'adzan' && (
                <>
                  <MosqueMark className="h-28 w-28 text-[var(--tv-accent)]" />
                  <p className="mt-6 font-heading text-tv-xl font-medium tracking-wide text-white/80">Telah masuk waktu salat</p>
                  <h2 className="font-heading text-tv-7xl font-bold leading-none text-[var(--tv-accent)]">{name}</h2>
                  <p className="tabular mt-4 font-heading text-tv-4xl font-semibold">{time}</p>
                  <Silent />
                </>
              )}
              {phase.type === 'iqamah' && (
                <>
                  <p className="font-heading text-tv-xl font-medium tracking-wide text-white/80">Menuju iqamah salat {name}</p>
                  <p className="tabular font-heading text-tv-7xl font-bold leading-none text-[var(--tv-accent)]" data-testid="tv-iqamah">{fmtCountdown(phase.remaining)}</p>
                  <div className="mt-6 h-3 w-[720px] overflow-hidden rounded-full bg-white/15">
                    <div className="h-full rounded-full bg-[var(--tv-accent)] transition-[width] duration-1000 ease-linear" style={{ width: `${(1 - phase.remaining / Math.max(1, phase.total)) * 100}%` }} />
                  </div>
                  <p className="mt-8 text-tv-xl text-white/85">Luruskan dan rapatkan saf · Dahulukan saf terdepan</p>
                  <Silent />
                </>
              )}
              {phase.type === 'jumat' && (
                <>
                  <p className="font-heading text-tv-xl font-medium tracking-wide text-white/80">{mosqueName}</p>
                  <h2 className="mt-2 font-heading text-tv-6xl font-bold leading-none text-[var(--tv-accent)]">Khutbah Jumat</h2>
                  <Divider className="my-8 w-[640px]" />
                  {prayer.khatib_jumat && <p className="text-tv-2xl">Khatib: <b>{prayer.khatib_jumat}</b></p>}
                  <p className="mt-5 text-tv-xl text-white/85">Mohon tenang dan menyimak khutbah dengan khidmat</p>
                  <Silent />
                </>
              )}
              {phase.type === 'salat' && (
                <div className="opacity-70">
                  <p className="font-heading text-tv-2xl font-semibold text-[var(--tv-accent)]">Salat {name} sedang berlangsung</p>
                  <p className="mt-4 text-tv-lg text-white/70">Mohon menjaga ketenangan · Perangkat dalam mode senyap</p>
                  <p className="tabular mt-10 font-heading text-tv-3xl font-semibold text-white/60">{time}</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Nada pemberitahuan singkat saat masuk waktu salat (bila diizinkan peramban). */
export function playChime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    ;[0, 0.55, 1.1].forEach((at, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = [660, 784, 988][i]
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at)
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.9)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + at)
      osc.stop(ctx.currentTime + at + 1)
    })
    setTimeout(() => void ctx.close(), 2600)
  } catch {
    /* autoplay diblokir: abaikan */
  }
}
