import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpenText, CalendarDays, Clock4, ExternalLink, Images, Megaphone, MonitorSmartphone, Wallet } from 'lucide-react'
import { Alert, Badge, Loading, PageHeader, Section, StatCard } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { useNow } from '@/hooks/useNow'
import { fmtDate, fmtTime, inSchedule, isOnline, isoDate, rupiah, timeAgo } from '@/lib/format'
import { fmtDateLong, toHijri } from '@/lib/hijri'
import { PRAYER_KEYS, PRAYER_LABEL, fmtCountdown, fmtMinutes, getPrayerState, mosqueDate } from '@/lib/prayer'
import { upcomingEvents } from '@/lib/slides'
import { errorMessage, supabase } from '@/lib/supabase'
import type { Announcement, DisplayDevice, FinanceSummary, IslamicContent, MosqueEvent, MosqueProfile, PrayerSchedule, SlideContent } from '@/lib/types'

interface Data {
  mosque: MosqueProfile | null
  prayer: PrayerSchedule | null
  announcements: Announcement[]
  slides: SlideContent[]
  events: MosqueEvent[]
  islamic: IslamicContent[]
  devices: DisplayDevice[]
  finance: FinanceSummary | null
}

export default function DashboardPage() {
  const { mosqueId, canManage, profile } = useAuth()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const now = useNow()

  useEffect(() => {
    if (!mosqueId) return
    let alive = true
    const load = async () => {
      const by = (t: string) => supabase.from(t).select('*').eq('mosque_id', mosqueId)
      const [m, p, a, s, e, i, d, f] = await Promise.all([
        supabase.from('mosque_profiles').select('*').eq('id', mosqueId).limit(1), by('prayer_schedules').limit(1), by('announcements'), by('slideshow_contents'),
        by('mosque_events'), by('islamic_contents'), by('display_devices').order('created_at'),
        canManage ? supabase.rpc('get_finance_summary', { p_mosque_id: mosqueId }) : Promise.resolve({ data: null, error: null }),
      ])
      if (!alive) return
      const failed = [m, p, a, s, e, i, d].find((r) => r.error)
      if (failed?.error) return setError(errorMessage(failed.error))
      const ps = p.data?.[0] as PrayerSchedule | undefined
      setError(null)
      setData({
        mosque: (m.data?.[0] as MosqueProfile) ?? null,
        prayer: ps ? { ...ps, latitude: Number(ps.latitude), longitude: Number(ps.longitude) } : null,
        announcements: a.data ?? [], slides: s.data ?? [], events: e.data ?? [], islamic: i.data ?? [], devices: d.data ?? [],
        finance: (f.data as FinanceSummary | null) ?? null,
      })
    }
    void load()
    const t = setInterval(() => void load(), 30_000) // status perangkat diperbarui berkala
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [mosqueId, canManage])

  const today = isoDate(data?.prayer ? mosqueDate(data.prayer.timezone, now) : undefined)
  const stats = useMemo(() => {
    if (!data) return null
    const live = <T extends { is_active: boolean; start_date: string | null; end_date: string | null }>(l: T[]) => l.filter((r) => r.is_active && inSchedule(r, today)).length
    return {
      announcements: live(data.announcements),
      slides: live(data.slides),
      upcoming: upcomingEvents(data.events.filter((e) => e.is_active), today),
      routine: data.events.filter((e) => e.is_active && e.is_routine).length,
      islamic: data.islamic.filter((c) => c.is_active).length,
      online: data.devices.filter((d) => isOnline(d.last_seen_at)).length,
    }
  }, [data, today])

  if (error) return <Alert tone="red">{error}</Alert>
  if (!data || !stats) return <Loading />

  const ps = data.prayer
  const state = ps ? getPrayerState(ps, now) : null
  const md = ps ? mosqueDate(ps.timezone, now) : null
  const needsSetup = data.mosque?.name === 'Masjid Kami'

  return (
    <div>
      <PageHeader title={`Assalamu’alaikum, ${profile?.full_name?.split(' ')[0] || 'Pengurus'}`}
        subtitle={md && ps ? `${fmtDateLong(md)} · ${toHijri(md, ps.hijri_offset).text} · ${data.mosque?.name ?? ''}` : undefined} />

      {needsSetup && canManage && (
        <div className="mb-5"><Alert tone="amber">Nama dan alamat masjid belum diatur. Lengkapi di menu <Link to="/admin/profil" className="font-semibold underline">Profil Masjid</Link>, lalu periksa lokasi pada <Link to="/admin/jadwal-salat" className="font-semibold underline">Jadwal Salat</Link>.</Alert></div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link to="/admin/pengumuman"><StatCard icon={<Megaphone />} label="Pengumuman tayang" value={stats.announcements} hint={`${data.announcements.length} total`} /></Link>
        <Link to="/admin/kegiatan"><StatCard icon={<CalendarDays />} label="Kegiatan mendatang" value={stats.upcoming.length} hint={`${stats.routine} kegiatan rutin`} tone="sky" /></Link>
        <Link to="/admin/slideshow"><StatCard icon={<Images />} label="Konten slideshow tayang" value={stats.slides} hint={`${data.slides.length} total · ${stats.islamic} ayat & hadis`} tone="gold" /></Link>
        <Link to={canManage ? '/admin/display' : '/admin'}><StatCard icon={<MonitorSmartphone />} label="Layar display online" value={`${stats.online} / ${data.devices.length}`} hint="Diperbarui tiap 30 detik" tone={stats.online ? 'emerald' : 'rose'} /></Link>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {state && ps && (
            <Section title="Jadwal salat hari ini" description={`${ps.mode === 'auto' ? `Otomatis · ${ps.location_name}` : 'Manual'} · ${ps.timezone}`}
              aside={<Badge tone="green"><Clock4 className="h-3 w-3" /> {PRAYER_LABEL[state.next.key]} dalam {fmtCountdown(state.next.secondsLeft)}</Badge>}>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {PRAYER_KEYS.map((k) => (
                  <div key={k} className={`rounded-xl px-2 py-2.5 text-center ${k === state.next.key ? 'bg-emerald-700 text-white shadow' : 'bg-slate-50 text-slate-700'}`}>
                    <p className={`text-xs ${k === state.next.key ? 'text-emerald-100' : 'text-slate-500'}`}>{PRAYER_LABEL[k]}</p>
                    <p className="tabular font-heading text-lg font-bold">{fmtMinutes(state.times[k])}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}
          <Section title="Kegiatan terdekat" aside={<Link to="/admin/kegiatan" className="text-sm font-semibold text-emerald-700 hover:underline">Kelola</Link>}>
            {stats.upcoming.length === 0 ? <p className="text-sm text-slate-500">Belum ada kegiatan terjadwal.</p> : (
              <ul className="divide-y divide-slate-100">
                {stats.upcoming.slice(0, 5).map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                    <div className="min-w-0"><p className="truncate font-medium text-slate-900">{e.name}</p><p className="truncate text-xs text-slate-500">{[e.speaker, e.location].filter(Boolean).join(' · ') || '-'}</p></div>
                    <p className="shrink-0 text-right text-slate-600">{fmtDate(e.event_date)}<br /><span className="text-xs">{fmtTime(e.start_time)}</span></p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="space-y-5">
          <Section title="Status perangkat display" aside={<a href="/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline">Buka layar <ExternalLink className="h-3.5 w-3.5" /></a>}>
            {data.devices.length === 0 ? <p className="text-sm text-slate-500">Belum ada perangkat.</p> : (
              <ul className="space-y-3" data-testid="device-status">
                {data.devices.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0"><p className="truncate font-medium text-slate-900">{d.name}</p><p className="truncate text-xs text-slate-500">/display/{d.code} · {timeAgo(d.last_seen_at)}</p></div>
                    {!d.is_active ? <Badge>Nonaktif</Badge> : isOnline(d.last_seen_at) ? <Badge tone="green">● Online</Badge> : <Badge tone="red">○ Offline</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {canManage && data.finance && (
            <Section title="Kas masjid" aside={<Link to="/admin/keuangan" className="text-sm font-semibold text-emerald-700 hover:underline">Rincian</Link>}>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><Wallet className="h-5 w-5" /></span>
                <div><p className="text-xs text-slate-500">Saldo saat ini</p><p className="font-heading text-xl font-bold text-slate-900">{rupiah(data.finance.balance)}</p></div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-emerald-50 px-3 py-2"><p className="text-xs text-emerald-800/70">Masuk bulan ini</p><p className="font-semibold text-emerald-800">{rupiah(data.finance.month_income)}</p></div>
                <div className="rounded-xl bg-rose-50 px-3 py-2"><p className="text-xs text-rose-800/70">Keluar bulan ini</p><p className="font-semibold text-rose-700">{rupiah(data.finance.month_expense)}</p></div>
              </div>
            </Section>
          )}
          <Section title="Konten islami">
            <p className="flex items-center gap-2 text-sm text-slate-600"><BookOpenText className="h-4 w-4 text-emerald-600" /> {stats.islamic} ayat &amp; hadis aktif tampil bergantian.</p>
            <Link to="/admin/ayat-hadis" className="mt-2 inline-block text-sm font-semibold text-emerald-700 hover:underline">Kelola ayat &amp; hadis</Link>
          </Section>
        </div>
      </div>
    </div>
  )
}
