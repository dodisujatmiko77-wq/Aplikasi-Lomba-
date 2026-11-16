import { memo } from 'react'
import { MapPin, Moon } from 'lucide-react'
import type { MosqueProfile } from '@/lib/types'
import { pad } from '@/lib/prayer'
import { MosqueMark } from './Ornament'

interface Props {
  mosque: MosqueProfile
  hijriText: string
  dateText: string
  h: number
  m: number
  s: number
  tz: string
  badge?: string | null
  compact?: boolean
}

export const Header = memo(function Header({ mosque, hijriText, dateText, h, m, s, tz, badge, compact }: Props) {
  const address = [mosque.address, mosque.city, mosque.province].filter(Boolean).join(', ')
  return (
    <header className={compact ? 'flex flex-col gap-6' : 'flex items-center gap-8'} data-testid="tv-header">
      <div className="flex min-w-0 flex-1 items-center gap-6">
        <div className="relative flex h-[124px] w-[124px] shrink-0 items-center justify-center rounded-[32px] border-2 border-tv-accent/70 bg-[var(--tv-card-strong)] p-2 shadow-soft">
          {mosque.logo_url ? (
            <img src={mosque.logo_url} alt="" className="h-full w-full rounded-[24px] object-contain" />
          ) : (
            <MosqueMark className="h-[84px] w-[84px] text-tv-accent" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-4">
            <h1 className="truncate font-heading text-tv-2xl font-bold leading-tight tracking-tight" data-testid="tv-mosque-name">{mosque.name}</h1>
            {badge && (
              <span className="shrink-0 rounded-full px-5 py-1.5 font-heading text-tv-xs font-semibold" style={{ background: 'var(--tv-hl-bg)', color: 'var(--tv-hl-fg)' }}>
                {badge}
              </span>
            )}
          </div>
          {address && (
            <p className="mt-2 flex items-center gap-2.5 text-tv-sm text-tv-muted">
              <MapPin className="h-[1.1em] w-[1.1em] shrink-0 text-tv-accent" />
              <span className="line-clamp-1">{address}</span>
            </p>
          )}
        </div>
      </div>

      <div className={`flex items-center ${compact ? 'justify-between' : 'gap-8'}`}>
        <div className={compact ? '' : 'text-right'}>
          <p className="flex items-center gap-2.5 font-heading text-tv-lg font-semibold text-[var(--tv-accent-text)]" style={compact ? undefined : { justifyContent: 'flex-end' }} data-testid="tv-hijri">
            <Moon className="h-[0.9em] w-[0.9em]" />
            {hijriText}
          </p>
          <p className="mt-1 text-tv-base text-tv-muted" data-testid="tv-date">{dateText}</p>
        </div>
        <div className="tv-card flex items-baseline gap-2 px-8 py-3 shadow-soft" data-testid="tv-clock">
          <span className="tabular font-heading text-tv-4xl font-bold leading-none">{pad(h)}:{pad(m)}</span>
          <span className="tabular font-heading text-tv-xl font-semibold leading-none text-[var(--tv-accent-text)]">{pad(s)}</span>
          <span className="ml-1 text-tv-xs font-semibold tracking-widest text-tv-muted">{tz}</span>
        </div>
      </div>
    </header>
  )
})
