import { memo } from 'react'
import { Clock3, MoonStar, Sun, Sunrise, Sunset, CloudSun, SunMedium, Sparkles } from 'lucide-react'
import { PRAYER_KEYS, PRAYER_LABEL, fmtCountdown, fmtMinutes, type DayTimes } from '@/lib/prayer'
import type { PrayerKey, WajibKey } from '@/lib/types'

const ICON: Record<PrayerKey, typeof Sun> = {
  imsak: Sparkles, subuh: MoonStar, terbit: Sunrise, duha: SunMedium, zuhur: Sun, asar: CloudSun, magrib: Sunset, isya: MoonStar,
}

interface CardsProps {
  times: DayTimes
  next: WajibKey
  nextTomorrow: boolean
  current: WajibKey | null
  nowMinutes: number
  isFriday: boolean
  ramadan: boolean
  variant: 'row' | 'list' | 'grid'
}

/** Kartu 8 waktu; salat berikutnya disorot. */
export const PrayerCards = memo(function PrayerCards({ times, next, nextTomorrow, current, nowMinutes, isFriday, ramadan, variant }: CardsProps) {
  const wrap = variant === 'row' ? 'grid h-full grid-cols-8 gap-4' : variant === 'grid' ? 'grid h-full grid-cols-4 grid-rows-2 gap-4' : 'flex h-full flex-col gap-3'
  return (
    <div className={wrap} data-testid="tv-prayers">
      {PRAYER_KEYS.map((k) => {
        const Icon = ICON[k]
        const isNext = k === next
        const isCurrent = k === current
        const passed = !isNext && !isCurrent && (nextTomorrow || times[k] <= nowMinutes)
        const label = k === 'zuhur' && isFriday ? 'Jumat' : PRAYER_LABEL[k]
        const emphasise = ramadan && k === 'imsak'
        const style = isNext
          ? { background: 'var(--tv-hl-bg)', color: 'var(--tv-hl-fg)', borderColor: 'transparent' }
          : { borderColor: isCurrent || emphasise ? 'var(--tv-accent)' : undefined }
        if (variant === 'list') {
          return (
            <div key={k} data-prayer={k} data-next={isNext || undefined}
              className={`tv-card flex flex-1 items-center gap-4 px-6 transition-all duration-700 ${isNext ? 'scale-[1.03] shadow-soft' : ''} ${passed ? 'opacity-70' : ''}`} style={style}>
              <Icon className={`h-9 w-9 shrink-0 ${isNext ? '' : 'text-tv-accent'}`} />
              <span className="flex-1 font-heading text-tv-lg font-semibold">{label}</span>
              <span className="tabular font-heading text-tv-xl font-bold">{fmtMinutes(times[k])}</span>
            </div>
          )
        }
        return (
          <div key={k} data-prayer={k} data-next={isNext || undefined}
            className={`tv-card relative flex flex-col items-center justify-center gap-1 transition-all duration-700 ${isNext ? '-translate-y-2 shadow-soft' : ''} ${passed ? 'opacity-70' : ''}`} style={style}>
            {isNext && (
              <span className="absolute -top-4 rounded-full bg-[var(--tv-card-strong)] px-4 py-1 text-tv-xs font-semibold text-tv-fg shadow-soft backdrop-blur" style={{ border: '1px solid var(--tv-line)' }}>
                Berikutnya
              </span>
            )}
            <span className={`flex items-center gap-2.5 font-heading text-tv-base font-semibold ${isNext ? '' : 'text-tv-muted'}`}>
              <Icon className={`h-[1em] w-[1em] ${isNext ? '' : 'text-tv-accent'}`} />
              {label}
            </span>
            <span className="tabular font-heading text-tv-3xl font-bold leading-none">{fmtMinutes(times[k])}</span>
          </div>
        )
      })}
    </div>
  )
})

interface CountdownProps {
  label: string
  time: string
  secondsLeft: number
  progress: number
  tomorrow: boolean
  extra?: string | null
}

/** Hitung mundur menuju salat berikutnya. */
export function Countdown({ label, time, secondsLeft, progress, tomorrow, extra }: CountdownProps) {
  const soon = secondsLeft <= 300
  return (
    <section className={`tv-card relative overflow-hidden px-9 py-6 ${soon ? 'animate-pulse-gold' : ''}`} style={soon ? { borderColor: 'var(--tv-accent)' } : undefined} data-testid="tv-countdown">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-3 text-tv-sm font-medium text-tv-muted">
          <Clock3 className="h-[1.1em] w-[1.1em] text-tv-accent" />
          {soon ? 'Segera masuk waktu' : 'Menuju waktu'}
        </p>
        <p className="tabular text-tv-sm font-semibold text-tv-muted">{tomorrow ? 'Besok ' : ''}{time}</p>
      </div>
      <div className="mt-1 flex items-end justify-between gap-4">
        <p className="font-heading text-tv-2xl font-bold text-[var(--tv-accent-text)]" data-testid="tv-next-name">{label}</p>
        <p className="tabular font-heading text-tv-4xl font-bold leading-none" data-testid="tv-countdown-value">−{fmtCountdown(secondsLeft)}</p>
      </div>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[var(--tv-line)]">
        <div className="h-full rounded-full transition-[width] duration-1000 ease-linear" style={{ width: `${(progress * 100).toFixed(2)}%`, background: 'var(--tv-accent)' }} />
      </div>
      {extra && <p className="mt-3 text-tv-xs font-medium text-tv-muted">{extra}</p>}
    </section>
  )
}
