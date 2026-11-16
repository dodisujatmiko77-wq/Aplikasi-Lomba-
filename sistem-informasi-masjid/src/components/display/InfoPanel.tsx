import { memo, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BookOpen, CalendarDays, HandCoins, Landmark, Phone, UserRound, Users } from 'lucide-react'
import { fmtDate, fmtTime } from '@/lib/format'
import { DAYS } from '@/lib/hijri'
import { PRAYER_LABEL, WAJIB_KEYS } from '@/lib/prayer'
import { routineEvents, upcomingEvents } from '@/lib/slides'
import type { DisplayBundle, WajibKey } from '@/lib/types'
import { QrBox } from './SlideViews'

interface Props {
  bundle: DisplayBundle
  today: string
  weekday: number
  nextPrayer: WajibKey
  friday: boolean
  duration: number
}

interface Page { id: string; title: string; icon: ReactNode; body: ReactNode }

const Row = ({ label, value, strong }: { label: ReactNode; value: ReactNode; strong?: boolean }) => (
  <div className="flex items-center justify-between gap-5 py-3" style={{ borderBottom: '1px solid var(--tv-line)' }}>
    <span className={`shrink-0 text-tv-sm ${strong ? 'font-semibold text-[var(--tv-accent-text)]' : 'text-tv-muted'}`}>{label}</span>
    <span className={`truncate text-right text-tv-base ${strong ? 'font-bold' : 'font-semibold'}`}>{value}</span>
  </div>
)

/** Panel informasi khusus yang berganti otomatis: petugas, kajian rutin, agenda, donasi, kontak. */
export const InfoPanel = memo(function InfoPanel({ bundle, today, weekday, nextPrayer, friday, duration }: Props) {
  const pages = useMemo<Page[]>(() => {
    const ps = bundle.prayer
    const out: Page[] = []

    const jumat = [['Khatib', ps.khatib_jumat], ['Imam', ps.imam_jumat], ['Muazin', ps.muazin_jumat]].filter(([, v]) => v)
    const imams = WAJIB_KEYS.filter((k) => ps.imams?.[k])
    if (imams.length || jumat.length) {
      const jumatBlock = jumat.length > 0 && (
        <div className={friday ? '' : 'mt-3'}>
          <p className="pb-1 pt-2 font-heading text-tv-sm font-semibold text-[var(--tv-accent-text)]">Petugas Salat Jumat</p>
          {jumat.map(([l, v]) => <Row key={l} label={l} value={v} strong={friday} />)}
        </div>
      )
      const imamBlock = imams.length > 0 && (
        <div>
          {friday && <p className="pb-1 pt-4 font-heading text-tv-sm font-semibold text-[var(--tv-accent-text)]">Imam Salat</p>}
          {imams.slice(0, friday && jumat.length ? 3 : 5).map((k) => <Row key={k} label={PRAYER_LABEL[k]} value={ps.imams[k]} strong={k === nextPrayer} />)}
        </div>
      )
      out.push({
        id: 'petugas', title: friday && jumat.length ? 'Petugas Jumat & Imam' : 'Imam Salat & Khatib', icon: <UserRound />,
        body: friday ? <>{jumatBlock}{imamBlock}</> : <>{imamBlock}{imams.length <= 3 && jumatBlock}</>,
      })
      if (!friday && imams.length > 3 && jumat.length) out.push({ id: 'jumat', title: 'Petugas Salat Jumat', icon: <Users />, body: <>{jumat.map(([l, v]) => <Row key={l} label={l} value={v} />)}</> })
    }

    const routine = routineEvents(bundle.events, weekday).slice(0, 4)
    if (routine.length) {
      out.push({
        id: 'kajian', title: 'Kajian & Kegiatan Rutin', icon: <BookOpen />,
        body: routine.map((e) => (
          <div key={e.id} className="py-3" style={{ borderBottom: '1px solid var(--tv-line)' }}>
            <div className="flex items-baseline justify-between gap-4">
              <p className="truncate text-tv-base font-semibold">{e.name}</p>
              <p className="tabular shrink-0 text-tv-sm font-semibold text-[var(--tv-accent-text)]">{e.weekday === weekday ? 'Hari ini' : DAYS[e.weekday ?? 0]} {fmtTime(e.start_time)}</p>
            </div>
            {(e.speaker || e.location) && <p className="truncate text-tv-xs text-tv-muted">{[e.speaker, e.location].filter(Boolean).join(' · ')}</p>}
          </div>
        )),
      })
    }

    const upcoming = upcomingEvents(bundle.events, today).slice(0, 4)
    if (upcoming.length) {
      out.push({
        id: 'agenda', title: 'Agenda Kegiatan', icon: <CalendarDays />,
        body: upcoming.map((e) => (
          <div key={e.id} className="py-3" style={{ borderBottom: '1px solid var(--tv-line)' }}>
            <div className="flex items-baseline justify-between gap-4">
              <p className="truncate text-tv-base font-semibold">{e.name}</p>
              <p className="tabular shrink-0 text-tv-sm font-semibold text-[var(--tv-accent-text)]">{e.event_date === today ? 'Hari ini' : fmtDate(e.event_date).replace(/ \d{4}$/, '')} · {fmtTime(e.start_time)}</p>
            </div>
            {(e.speaker || e.location) && <p className="truncate text-tv-xs text-tv-muted">{[e.speaker, e.location].filter(Boolean).join(' · ')}</p>}
          </div>
        )),
      })
    }

    const acc = bundle.accounts[0]
    if (acc) {
      const hasQr = !!(acc.qris_image_url || acc.qr_content)
      out.push({
        id: 'donasi', title: 'Infak & Donasi', icon: <HandCoins />,
        body: (
          <div className="flex h-full items-center gap-6">
            {hasQr && <QrBox account={acc} size={190} />}
            <div className="min-w-0 flex-1">
              <p className="text-tv-sm text-tv-muted">{acc.label}</p>
              {acc.account_number ? (
                <>
                  <p className="mt-1 text-tv-base font-semibold">{acc.bank_name}</p>
                  <p className="tabular font-heading text-tv-xl font-bold text-[var(--tv-accent-text)]">{acc.account_number}</p>
                  {acc.account_holder && <p className="text-tv-xs text-tv-muted">a.n. {acc.account_holder}</p>}
                </>
              ) : (
                <p className="mt-1 text-tv-base font-semibold">Pindai kode QR untuk berdonasi</p>
              )}
            </div>
          </div>
        ),
      })
    }

    const contacts = (bundle.mosque.contacts ?? []).filter((c) => c.name).slice(0, 4)
    if (contacts.length) {
      out.push({
        id: 'kontak', title: 'Kontak Pengurus', icon: <Phone />,
        body: contacts.map((c, i) => (
          <div key={i} className="flex items-center justify-between gap-4 py-3" style={{ borderBottom: '1px solid var(--tv-line)' }}>
            <div className="min-w-0">
              <p className="truncate text-tv-base font-semibold">{c.name}</p>
              <p className="truncate text-tv-xs text-tv-muted">{c.position}</p>
            </div>
            <p className="tabular shrink-0 text-tv-base font-semibold text-[var(--tv-accent-text)]">{c.phone}</p>
          </div>
        )),
      })
    }
    if (!out.length) {
      // Belum ada data petugas/kegiatan/donasi/kontak: tampilkan identitas masjid dari profil.
      const m = bundle.mosque
      const lines = [['Alamat', [m.address, m.city, m.province].filter(Boolean).join(', ')], ['Telepon', m.phone], ['Email', m.email], ['Situs', m.website]].filter(([, v]) => v)
      out.push({
        id: 'profil', title: 'Tentang Masjid', icon: <Landmark />,
        body: (
          <div>
            <p className="pb-2 font-heading text-tv-xl font-bold text-[var(--tv-accent-text)]">{m.name}</p>
            {lines.map(([l, v]) => (
              <div key={l} className="py-2.5" style={{ borderTop: '1px solid var(--tv-line)' }}>
                <p className="text-tv-xs text-tv-muted">{l}</p>
                <p className="line-clamp-2 text-tv-base font-semibold">{v}</p>
              </div>
            ))}
            {m.vision && <p className="mt-2 line-clamp-4 text-tv-sm italic text-tv-muted">“{m.vision}”</p>}
          </div>
        ),
      })
    }
    return out
  }, [bundle, today, weekday, nextPrayer, friday])

  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (pages.length < 2) return
    const t = setInterval(() => setIndex((i) => i + 1), duration * 1000)
    return () => clearInterval(t)
  }, [pages.length, duration])

  const page = pages[index % pages.length]
  return (
    <section className="tv-card relative flex h-full min-h-0 flex-col overflow-hidden px-8 py-6" data-testid="tv-info" data-page={page.id}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={page.id} className="flex min-h-0 flex-1 flex-col" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.45 }}>
          <h3 className="flex items-center gap-3.5 font-heading text-tv-lg font-semibold">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl text-tv-accent [&>svg]:h-7 [&>svg]:w-7" style={{ background: 'var(--tv-card-strong)' }}>{page.icon}</span>
            {page.title}
          </h3>
          <div className="mt-3 min-h-0 flex-1 overflow-hidden">{page.body}</div>
        </motion.div>
      </AnimatePresence>
      {pages.length > 1 && (
        <div className="absolute right-8 top-9 flex gap-1.5">
          {pages.map((p, i) => <span key={p.id} className="h-2 w-2 rounded-full" style={{ background: i === index % pages.length ? 'var(--tv-accent)' : 'var(--tv-line)' }} />)}
        </div>
      )}
    </section>
  )
})
