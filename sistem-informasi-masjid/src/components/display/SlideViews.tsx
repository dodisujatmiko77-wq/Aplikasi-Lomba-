import { BookOpenText, CalendarDays, Clock3, HandCoins, MapPin, Megaphone, Mic2, QrCode, Repeat, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import type { ReactNode } from 'react'
import { ANNOUNCEMENT_CATEGORIES, SLIDE_CATEGORIES, labelOf } from '@/lib/constants'
import { fmtDate, fmtTime, monthLabel, rupiah, rupiahShort } from '@/lib/format'
import { DAYS, MONTHS, toHijri } from '@/lib/hijri'
import { fmtMinutes, mosqueDate, timesForDate } from '@/lib/prayer'
import { routineEvents, upcomingEvents, type Slide } from '@/lib/slides'
import type { DisplayBundle, DonationAccount, SpecialMode } from '@/lib/types'
import { Divider, MosqueMark } from './Ornament'

export interface SlideContext {
  bundle: DisplayBundle
  today: string
  weekday: number
  mode: SpecialMode
  hijriYear: number
  jumatTime: string
}

function Frame({ icon, title, children, tight }: { icon: ReactNode; title: string; children: ReactNode; tight?: boolean }) {
  return (
    <div className={`flex h-full flex-col ${tight ? 'px-12 py-9' : 'px-14 py-10'}`}>
      <div className="flex items-center gap-4 font-heading text-tv-lg font-semibold text-[var(--tv-accent-text)]">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--tv-card-strong)] [&>svg]:h-8 [&>svg]:w-8">{icon}</span>
        {title}
      </div>
      <div className="mt-6 min-h-0 flex-1">{children}</div>
    </div>
  )
}

export function QrBox({ account, size }: { account: DonationAccount; size: number }) {
  if (account.qris_image_url) {
    return <img src={account.qris_image_url} alt="QRIS" className="rounded-3xl bg-white object-contain p-3" style={{ width: size, height: size }} />
  }
  if (account.qr_content) {
    return (
      <div className="rounded-3xl bg-white p-4" style={{ width: size, height: size }}>
        <QRCodeSVG value={account.qr_content} size={size - 32} level="M" />
      </div>
    )
  }
  return null
}

function MediaSlide({ slide, onDone }: { slide: Extract<Slide, { kind: 'media' }>; onDone: () => void }) {
  const { item } = slide
  return (
    <div className="relative h-full w-full overflow-hidden bg-black/40">
      {item.media_type === 'video' ? (
        <video src={item.media_url} className="h-full w-full object-contain" autoPlay muted playsInline onEnded={onDone} onError={onDone} />
      ) : (
        <>
          <img src={item.media_url} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl" />
          <img src={item.media_url} alt={item.title} className="relative h-full w-full object-contain" onError={onDone} />
        </>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-10 pb-9 pt-20 text-white">
        <div className="min-w-0">
          <p className="truncate font-heading text-tv-lg font-semibold">{item.title}</p>
          {item.caption && <p className="mt-1 line-clamp-2 text-tv-sm text-white/85">{item.caption}</p>}
        </div>
        <span className="shrink-0 rounded-full bg-white/15 px-5 py-1.5 text-tv-xs font-medium backdrop-blur">{labelOf(SLIDE_CATEGORIES, item.category)}</span>
      </div>
    </div>
  )
}

function IslamicSlide({ slide }: { slide: Extract<Slide, { kind: 'islamic' }> }) {
  const { item } = slide
  const long = item.translation.length > 180
  return (
    <div className="flex h-full flex-col items-center justify-center px-20 py-10 text-center">
      <p className="flex items-center gap-3 font-heading text-tv-sm font-semibold uppercase tracking-[0.25em] text-[var(--tv-accent-text)]">
        <BookOpenText className="h-[1.2em] w-[1.2em]" />
        {item.type === 'ayat' ? 'Firman Allah' : item.type === 'hadis' ? 'Sabda Rasulullah ﷺ' : item.type === 'doa' ? 'Doa' : 'Mutiara Hikmah'}
      </p>
      {item.arabic_text && (
        <p dir="rtl" lang="ar" className={`mt-7 font-arabic font-bold leading-[1.9] ${item.arabic_text.length > 90 ? 'text-tv-2xl' : 'text-tv-3xl'}`}>
          {item.arabic_text}
        </p>
      )}
      <Divider className="my-6 w-2/3" />
      <p className={`max-w-[92%] font-medium leading-snug ${long ? 'text-tv-lg' : 'text-tv-xl'}`}>“{item.translation}”</p>
      <p className="mt-6 rounded-full px-7 py-2 font-heading text-tv-sm font-semibold" style={{ background: 'var(--tv-hl-bg)', color: 'var(--tv-hl-fg)' }}>
        {item.source}
      </p>
    </div>
  )
}

function AnnouncementSlide({ slide }: { slide: Extract<Slide, { kind: 'announcement' }> }) {
  const { item } = slide
  return (
    <Frame icon={<Megaphone />} title={labelOf(ANNOUNCEMENT_CATEGORIES, item.category)}>
      <div className="flex h-full flex-col justify-center">
        <h2 className="font-heading text-tv-3xl font-bold leading-tight">{item.title}</h2>
        {item.content && <p className="mt-7 line-clamp-6 whitespace-pre-line text-tv-xl leading-snug text-tv-muted">{item.content}</p>}
      </div>
    </Frame>
  )
}

function EventsSlide({ ctx }: { ctx: SlideContext }) {
  const upcoming = upcomingEvents(ctx.bundle.events, ctx.today).slice(0, 4)
  const routine = upcoming.length < 4 ? routineEvents(ctx.bundle.events, ctx.weekday).slice(0, 4 - upcoming.length) : []
  return (
    <Frame icon={<CalendarDays />} title="Agenda & Kegiatan Masjid" tight>
      <div className="flex h-full flex-col gap-4">
        {[...upcoming, ...routine].map((e) => {
          const [, mo, d] = (e.event_date ?? '').split('-').map(Number)
          return (
            <div key={e.id} className="tv-card flex min-h-0 flex-1 items-center gap-7 px-7">
              <div className="flex h-[92px] w-[110px] shrink-0 flex-col items-center justify-center rounded-2xl" style={{ background: 'var(--tv-hl-bg)', color: 'var(--tv-hl-fg)' }}>
                {e.is_routine ? (
                  <>
                    <Repeat className="h-7 w-7" />
                    <span className="mt-1 font-heading text-tv-sm font-bold">{DAYS[e.weekday ?? 0]}</span>
                  </>
                ) : (
                  <>
                    <span className="font-heading text-tv-2xl font-bold leading-none">{d}</span>
                    <span className="text-tv-xs font-semibold uppercase">{MONTHS[(mo ?? 1) - 1]?.slice(0, 3)}</span>
                  </>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-heading text-tv-lg font-semibold">{e.name}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-7 gap-y-1 text-tv-sm text-tv-muted">
                  <span className="flex items-center gap-2"><Clock3 className="h-[1em] w-[1em] text-tv-accent" />{fmtTime(e.start_time)}{e.end_time ? `–${fmtTime(e.end_time)}` : ''}</span>
                  {e.speaker && <span className="flex items-center gap-2"><Mic2 className="h-[1em] w-[1em] text-tv-accent" />{e.speaker}</span>}
                  {e.location && <span className="flex items-center gap-2"><MapPin className="h-[1em] w-[1em] text-tv-accent" />{e.location}</span>}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </Frame>
  )
}

function FinanceSlide({ ctx }: { ctx: SlideContext }) {
  const f = ctx.bundle.finance!
  const max = Math.max(1, ...f.monthly.flatMap((m) => [m.income, m.expense]))
  const tiles = [
    { label: 'Saldo Kas', value: f.balance, icon: <Wallet />, hl: true },
    { label: 'Pemasukan bulan ini', value: f.month_income, icon: <TrendingUp /> },
    { label: 'Pengeluaran bulan ini', value: f.month_expense, icon: <TrendingDown /> },
    { label: 'Infak 7 hari terakhir', value: f.week_infak, icon: <HandCoins /> },
  ]
  return (
    <Frame icon={<Wallet />} title={`Laporan Keuangan Masjid${f.last_date ? ` · per ${fmtDate(f.last_date, true)}` : ''}`} tight>
      <div className="flex h-full gap-7">
        <div className="grid w-[46%] grid-cols-1 gap-3.5">
          {tiles.map((t) => (
            <div key={t.label} className="tv-card flex items-center gap-5 px-6" style={t.hl ? { background: 'var(--tv-hl-bg)', color: 'var(--tv-hl-fg)', borderColor: 'transparent' } : undefined}>
              <span className={`[&>svg]:h-9 [&>svg]:w-9 ${t.hl ? '' : 'text-tv-accent'}`}>{t.icon}</span>
              <div>
                <p className={`text-tv-xs font-medium ${t.hl ? 'opacity-80' : 'text-tv-muted'}`}>{t.label}</p>
                <p className="tabular font-heading text-tv-xl font-bold leading-tight">{rupiah(t.value)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="tv-card flex flex-1 flex-col px-7 py-5">
          <div className="flex items-center justify-between text-tv-xs font-medium text-tv-muted">
            <span>6 bulan terakhir</span>
            <span className="flex items-center gap-5">
              <span className="flex items-center gap-2"><i className="h-3.5 w-3.5 rounded-sm" style={{ background: 'var(--tv-primary)' }} />Pemasukan</span>
              <span className="flex items-center gap-2"><i className="h-3.5 w-3.5 rounded-sm" style={{ background: 'var(--tv-accent)' }} />Pengeluaran</span>
            </span>
          </div>
          <div className="mt-3 flex min-h-0 flex-1 items-end gap-4">
            {f.monthly.map((m) => (
              <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="tabular text-[calc(15px*var(--fs))] font-semibold text-tv-muted">{m.income ? rupiahShort(m.income).replace('Rp ', '') : ''}</span>
                <div className="flex w-full flex-1 items-end justify-center gap-1.5">
                  <div className="w-[38%] rounded-t-lg" style={{ height: `${Math.max(1.5, (m.income / max) * 100)}%`, background: 'var(--tv-primary)' }} />
                  <div className="w-[38%] rounded-t-lg" style={{ height: `${Math.max(1.5, (m.expense / max) * 100)}%`, background: 'var(--tv-accent)' }} />
                </div>
                <span className="text-tv-xs font-medium text-tv-muted">{monthLabel(m.month)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  )
}

function DonationSlide({ ctx }: { ctx: SlideContext }) {
  const accounts = ctx.bundle.accounts.slice(0, 3)
  const withQr = accounts.find((a) => a.qris_image_url || a.qr_content)
  return (
    <Frame icon={<HandCoins />} title="Infak, Sedekah & Donasi">
      <div className="flex h-full items-center gap-12">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {accounts.filter((a) => a.account_number).map((a) => (
            <div key={a.id} className="tv-card px-8 py-5">
              <p className="text-tv-sm font-medium text-tv-muted">{a.label}{a.bank_name ? ` · ${a.bank_name}` : ''}</p>
              <p className="tabular mt-1 font-heading text-tv-2xl font-bold tracking-wide text-[var(--tv-accent-text)]">{a.account_number}</p>
              {a.account_holder && <p className="text-tv-sm text-tv-muted">a.n. {a.account_holder}</p>}
            </div>
          ))}
          <p className="text-tv-base italic text-tv-muted">“Perumpamaan orang yang menginfakkan hartanya di jalan Allah seperti sebutir biji yang menumbuhkan tujuh tangkai…” (QS. Al-Baqarah: 261)</p>
        </div>
        {withQr && (
          <div className="flex shrink-0 flex-col items-center gap-4">
            <QrBox account={withQr} size={300} />
            <p className="flex items-center gap-2.5 text-tv-sm font-semibold"><QrCode className="h-[1.1em] w-[1.1em] text-tv-accent" />Pindai untuk berdonasi</p>
          </div>
        )}
      </div>
    </Frame>
  )
}

function ImsakiyahSlide({ ctx }: { ctx: SlideContext }) {
  const ps = ctx.bundle.prayer
  const start = mosqueDate(ps.timezone)
  const rows = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(start.getTime() + i * 86_400_000)
    return { d, h: toHijri(d, ps.hijri_offset), t: timesForDate(ps, d) }
  })
  const cols = ['imsak', 'subuh', 'zuhur', 'asar', 'magrib', 'isya'] as const
  return (
    <Frame icon={<CalendarDays />} title={`Jadwal Imsakiyah Ramadan ${ctx.hijriYear} H`} tight>
      <div className="tv-card h-full overflow-hidden">
        <table className="h-full w-full text-center text-tv-base">
          <thead>
            <tr className="font-heading text-tv-sm" style={{ background: 'var(--tv-hl-bg)', color: 'var(--tv-hl-fg)' }}>
              <th className="px-6 py-3 text-left font-semibold">Tanggal</th>
              {cols.map((c) => <th key={c} className="font-semibold capitalize">{c === 'magrib' ? 'Berbuka' : c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={i === 0 ? 'font-bold text-[var(--tv-accent-text)]' : ''} style={{ borderTop: '1px solid var(--tv-line)' }}>
                <td className="px-6 text-left">
                  {DAYS[r.d.getUTCDay()]}, {r.d.getUTCDate()} {MONTHS[r.d.getUTCMonth()].slice(0, 3)}
                  <span className="ml-3 text-tv-xs font-medium text-tv-muted">{r.h.day} {r.h.monthName}</span>
                </td>
                {cols.map((c) => <td key={c} className="tabular font-heading font-semibold">{fmtMinutes(r.t[c])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Frame>
  )
}


function EidSlide({ ctx }: { ctx: SlideContext }) {
  const fitri = ctx.mode === 'idulfitri'
  const greeting = ctx.bundle.settings.eid_greeting.trim()
  return (
    <div className="flex h-full flex-col items-center justify-center px-20 text-center">
      <p dir="rtl" lang="ar" className="font-arabic text-tv-3xl font-bold leading-[1.8] text-[var(--tv-accent-text)]">
        {fitri ? 'تَقَبَّلَ اللهُ مِنَّا وَمِنْكُمْ' : 'اللهُ أَكْبَرُ اللهُ أَكْبَرُ وَلِلّٰهِ الْحَمْدُ'}
      </p>
      <Divider className="my-6 w-1/2" />
      <p className="text-tv-lg font-medium text-tv-muted">Selamat Hari Raya</p>
      <h2 className="mt-1 font-heading text-tv-4xl font-bold leading-tight">{fitri ? 'Idulfitri' : 'Iduladha'} {ctx.hijriYear} H</h2>
      <p className="mt-6 max-w-[85%] text-tv-xl leading-snug">
        {greeting || (fitri ? 'Mohon maaf lahir dan batin. Semoga Allah menerima amal ibadah kita semua.' : 'Semoga semangat berkurban menjadikan kita hamba yang semakin bertakwa.')}
      </p>
      <p className="mt-7 font-heading text-tv-base font-semibold text-[var(--tv-accent-text)]">Keluarga Besar {ctx.bundle.mosque.name}</p>
    </div>
  )
}

function JumatSlide({ ctx }: { ctx: SlideContext }) {
  const ps = ctx.bundle.prayer
  const people = [
    { label: 'Khatib', value: ps.khatib_jumat },
    { label: 'Imam', value: ps.imam_jumat },
    { label: 'Muazin', value: ps.muazin_jumat },
  ].filter((p) => p.value)
  return (
    <div className="flex h-full flex-col items-center justify-center px-16 text-center">
      <p className="font-heading text-tv-sm font-semibold uppercase tracking-[0.3em] text-[var(--tv-accent-text)]">Sayyidul Ayyam · Hari Jumat</p>
      <h2 className="mt-3 font-heading text-tv-4xl font-bold">Salat Jumat</h2>
      <p className="mt-2 text-tv-xl text-tv-muted">Hari ini pukul <b className="tabular text-tv-fg">{ctx.jumatTime}</b></p>
      <Divider className="my-7 w-1/2" />
      {people.length > 0 ? (
        <div className="flex w-full justify-center gap-6">
          {people.map((p) => (
            <div key={p.label} className="tv-card min-w-[260px] px-8 py-6">
              <p className="text-tv-sm font-medium text-tv-muted">{p.label}</p>
              <p className="mt-1 font-heading text-tv-xl font-bold">{p.value}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="max-w-[80%] text-tv-xl leading-snug">Mari bersegera menuju masjid, memperbanyak selawat, dan membaca Surah Al-Kahfi.</p>
      )}
    </div>
  )
}

function WelcomeSlide({ ctx }: { ctx: SlideContext }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-20 text-center">
      <MosqueMark className="h-36 w-36 text-tv-accent" />
      <p className="mt-6 text-tv-xl text-tv-muted">Selamat datang di</p>
      <h2 className="mt-1 font-heading text-tv-4xl font-bold leading-tight">{ctx.bundle.mosque.name}</h2>
      <Divider className="mt-7 w-1/2" />
    </div>
  )
}

export function SlideView({ slide, ctx, onDone }: { slide: Slide; ctx: SlideContext; onDone: () => void }) {
  switch (slide.kind) {
    case 'media': return <MediaSlide slide={slide} onDone={onDone} />
    case 'islamic': return <IslamicSlide slide={slide} />
    case 'announcement': return <AnnouncementSlide slide={slide} />
    case 'events': return <EventsSlide ctx={ctx} />
    case 'finance': return ctx.bundle.finance ? <FinanceSlide ctx={ctx} /> : <WelcomeSlide ctx={ctx} />
    case 'donation': return <DonationSlide ctx={ctx} />
    case 'imsakiyah': return <ImsakiyahSlide ctx={ctx} />
    case 'eid': return <EidSlide ctx={ctx} />
    case 'jumat': return <JumatSlide ctx={ctx} />
    default: return <WelcomeSlide ctx={ctx} />
  }
}
