import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { Loader2, Maximize, Minimize, MonitorOff, Settings, TriangleAlert, WifiOff } from 'lucide-react'
import { Header } from '@/components/display/Header'
import { InfoPanel } from '@/components/display/InfoPanel'
import { PrayerOverlay, playChime } from '@/components/display/PrayerOverlay'
import { Countdown, PrayerCards } from '@/components/display/PrayerTimes'
import { RunningText } from '@/components/display/RunningText'
import { Slideshow } from '@/components/display/Slideshow'
import type { SlideContext } from '@/components/display/SlideViews'
import { useDisplayData } from '@/hooks/useDisplayData'
import { useFullscreen } from '@/hooks/useFullscreen'
import { useNow } from '@/hooks/useNow'
import { DEVICE_CODE_KEY } from '@/lib/displayData'
import { isoDate } from '@/lib/format'
import { fmtDateLong, resolveSpecialMode, toHijri } from '@/lib/hijri'
import { PRAYER_LABEL, fmtCountdown, fmtMinutes, getPrayerState, mosqueDate, pad } from '@/lib/prayer'
import { buildSlides, tickerItems } from '@/lib/slides'
import { buildTheme } from '@/lib/theme'

function useViewport() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return size
}

function FullMessage({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-950 p-8 text-center text-white">
      <div className="islamic-pattern absolute inset-0 opacity-5" />
      <div className="relative flex max-w-xl flex-col items-center">
        <div className="text-gold-400 [&>svg]:h-16 [&>svg]:w-16">{icon}</div>
        <h1 className="mt-5 font-heading text-2xl font-semibold">{title}</h1>
        {children && <div className="mt-3 text-emerald-100/80">{children}</div>}
      </div>
    </div>
  )
}

export default function DisplayPage() {
  const { code: codeParam } = useParams()
  const [search] = useSearchParams()
  const code = codeParam ? codeParam.toLowerCase() : null
  const savedCode = useMemo(() => {
    try { return localStorage.getItem(DEVICE_CODE_KEY) } catch { return null }
  }, [])

  // Layar mengingat kodenya: membuka alamat utama langsung menampilkan layar yang sama (auto start).
  useEffect(() => {
    if (code) try { localStorage.setItem(DEVICE_CODE_KEY, code) } catch { /* abaikan */ }
  }, [code])

  const { bundle, status, fatal } = useDisplayData(code)
  const fs = useFullscreen()
  const { w, h } = useViewport()

  // ?waktu=2026-03-01T18:00:00 → pratinjau tampilan pada waktu tertentu (untuk uji mode salat/Ramadan).
  const offset = useMemo(() => {
    const t = search.get('waktu')
    const ms = t ? new Date(t).getTime() : NaN
    return Number.isFinite(ms) ? ms - Date.now() : 0
  }, [search])
  const now = useNow() + offset

  // kontrol melayang: muncul saat ada gerakan, lalu sembunyi
  const [idle, setIdle] = useState(true)
  const autoFs = bundle?.settings.auto_fullscreen ?? false
  const triedFs = useRef(false)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const wake = () => {
      setIdle(false)
      clearTimeout(t)
      t = setTimeout(() => setIdle(true), 3500)
    }
    const gesture = (e: Event) => {
      wake()
      if ((e.target as HTMLElement | null)?.closest?.('[data-controls]')) return
      if (autoFs && !triedFs.current) {
        triedFs.current = true
        fs.enter()
      }
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') fs.toggle()
      else gesture(e)
    }
    window.addEventListener('mousemove', wake)
    window.addEventListener('pointerdown', gesture)
    window.addEventListener('keydown', key)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousemove', wake)
      window.removeEventListener('pointerdown', gesture)
      window.removeEventListener('keydown', key)
    }
  }, [autoFs, fs])

  const ps = bundle?.prayer
  const settings = bundle?.settings
  const md = ps ? mosqueDate(ps.timezone, now) : null
  const state = ps ? getPrayerState(ps, now, { fridayMode: settings?.friday_mode_enabled }) : null
  const today = md ? isoDate(md) : ''
  const nowMinutes = md ? md.getUTCHours() * 60 + md.getUTCMinutes() : 0
  const afterMaghrib = !!state && nowMinutes >= state.times.magrib
  const hijri = useMemo(
    () => (md && ps ? toHijri(md, ps.hijri_offset, afterMaghrib) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, ps?.hijri_offset, afterMaghrib],
  )
  const mode = settings && hijri ? resolveSpecialMode(settings.special_mode, hijri) : 'normal'
  const friday = !!state?.isFriday && !!settings?.friday_mode_enabled
  const weekday = md?.getUTCDay() ?? 0

  const slides = useMemo(() => (bundle ? buildSlides(bundle, { today, mode, isFriday: friday }) : []), [bundle, today, mode, friday])
  const ticker = useMemo(() => {
    if (!bundle) return []
    const items = tickerItems(bundle, today)
    return items.length ? items : [`Selamat datang di ${bundle.mosque.name}`]
  }, [bundle, today])
  const jumatTime = state ? fmtMinutes(state.times.zuhur) : ''
  const slideCtx = useMemo<SlideContext | null>(
    () => (bundle && hijri ? { bundle, today, weekday, mode, hijriYear: hijri.year, jumatTime } : null),
    [bundle, today, weekday, mode, hijri, jumatTime],
  )

  // bunyi pemberitahuan saat masuk waktu salat
  const phaseType = state?.phase.type ?? 'normal'
  const prevPhase = useRef(phaseType)
  useEffect(() => {
    if (prevPhase.current === 'normal' && phaseType === 'adzan' && ps?.notify_sound) playChime()
    prevPhase.current = phaseType
  }, [phaseType, ps?.notify_sound])

  useEffect(() => {
    if (bundle) document.title = `${bundle.mosque.name} — Informasi Masjid`
  }, [bundle?.mosque.name]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!code && savedCode) return <Navigate to={`/display/${savedCode}`} replace />

  if (fatal) {
    return (
      <FullMessage icon={<TriangleAlert />} title="Layar belum dapat ditampilkan">
        <p>{fatal}</p>
        <Link to="/admin" className="mt-5 inline-block rounded-xl bg-gold-500 px-5 py-2.5 font-semibold text-emerald-950">Buka halaman Admin</Link>
      </FullMessage>
    )
  }
  if (!bundle || !ps || !settings || !md || !state || !hijri || !slideCtx) {
    return status === 'offline' ? (
      <FullMessage icon={<WifiOff />} title="Tidak ada koneksi internet">
        Layar akan tampil otomatis setelah koneksi tersambung. Data terakhir akan disimpan agar tetap tampil saat offline berikutnya.
      </FullMessage>
    ) : (
      <FullMessage icon={<Loader2 className="animate-spin" />} title="Memuat informasi masjid…" />
    )
  }
  if (bundle.device && !bundle.device.is_active) {
    return <FullMessage icon={<MonitorOff />} title="Layar ini sedang dinonaktifkan">Aktifkan kembali melalui Admin › Pengaturan Display › Perangkat.</FullMessage>
  }

  const portrait = w / h < 1
  const W = portrait ? 1080 : 1920
  const H = portrait ? 1920 : 1080
  const scale = Math.min(w / W, h / H)
  const layout = portrait ? 'portrait' : bundle.device?.layout ?? settings.layout
  const fontScale = Number(bundle.device?.font_scale ?? settings.font_scale) || 1
  const theme = buildTheme(settings, fontScale)
  const clock = { h: md.getUTCHours(), m: md.getUTCMinutes(), s: md.getUTCSeconds() }

  const badge = mode === 'ramadan' && hijri.month === 9 ? `Ramadan hari ke-${hijri.day}` : mode === 'ramadan' ? 'Ramadan Mubarak'
    : mode === 'idulfitri' ? 'Idulfitri' : mode === 'iduladha' ? 'Iduladha' : friday ? 'Jumat Mubarak' : null

  // Ramadan: info tambahan menuju berbuka / imsak
  let extra: string | null = null
  if (mode === 'ramadan') {
    const sec = nowMinutes * 60 + clock.s
    if (sec < state.times.imsak * 60) extra = `Imsak dalam ${fmtCountdown(state.times.imsak * 60 - sec)}`
    else if (sec < state.times.magrib * 60 && sec >= state.times.subuh * 60) extra = `Berbuka puasa dalam ${fmtCountdown(state.times.magrib * 60 - sec)}`
  }

  const header = (
    <Header mosque={bundle.mosque} hijriText={hijri.text} dateText={fmtDateLong(md)} h={clock.h} m={clock.m} s={clock.s}
      tz={ps.timezone} badge={badge} compact={portrait} />
  )
  const cards = (variant: 'row' | 'list' | 'grid') => (
    <PrayerCards times={state.times} next={state.next.key} nextTomorrow={state.next.tomorrow} current={state.current}
      nowMinutes={nowMinutes} isFriday={friday} ramadan={mode === 'ramadan'} variant={variant} />
  )
  const countdown = ps.countdown_enabled && (
    <Countdown label={state.next.key === 'zuhur' && friday && !state.next.tomorrow ? 'Jumat' : PRAYER_LABEL[state.next.key]}
      time={fmtMinutes(state.next.minutes)} secondsLeft={state.next.secondsLeft} progress={state.progress} tomorrow={state.next.tomorrow} extra={extra} />
  )
  const slideshow = settings.slideshow_enabled && <Slideshow slides={slides} ctx={slideCtx} defaultDuration={settings.slideshow_duration} />
  const info = settings.show_info_panel && (
    <InfoPanel bundle={bundle} today={today} weekday={weekday} nextPrayer={state.next.key} friday={friday} duration={settings.info_panel_duration} />
  )
  const tickerEl = settings.running_text_enabled && <RunningText items={ticker} speed={settings.running_text_speed} />
  const tickerH = settings.running_text_enabled ? (portrait ? 84 : 68) : 0

  return (
    <div className={`tv-root ${idle ? 'idle' : ''}`} style={theme} data-testid="tv-root" data-layout={layout} data-mode={mode} data-status={status}>
      <div className={`${settings.theme === 'dark' ? 'islamic-pattern' : 'islamic-pattern-dark'} absolute inset-0`} style={{ opacity: 'var(--tv-pattern-opacity)' }} />
      <div className="absolute left-1/2 top-1/2 overflow-hidden" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}>
        <div className="absolute inset-x-0 top-0 flex flex-col gap-6 px-10 pt-8" style={{ bottom: tickerH, paddingBottom: 24 }}>
          {header}
          {layout === 'portrait' ? (
            <>
              {countdown}
              <div className="h-[330px] shrink-0 pt-3">{cards('grid')}</div>
              <div className="min-h-0 flex-1">{slideshow || info}</div>
              {slideshow && info && <div className="h-[400px] shrink-0">{info}</div>}
            </>
          ) : layout === 'side' ? (
            <div className="flex min-h-0 flex-1 gap-6">
              <div className="w-[400px] shrink-0">{cards('list')}</div>
              <div className="min-w-0 flex-1">{slideshow || info}</div>
              {(countdown || (slideshow && info)) && (
                <div className="flex w-[540px] shrink-0 flex-col gap-6">
                  {countdown}
                  {slideshow && info && <div className="min-h-0 flex-1">{info}</div>}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex min-h-0 flex-1 gap-6">
                <div className="min-w-0 flex-1">{slideshow || info}</div>
                {(countdown || (slideshow && info)) && (
                  <div className="flex w-[580px] shrink-0 flex-col gap-6">
                    {countdown}
                    {slideshow && info && <div className="min-h-0 flex-1">{info}</div>}
                  </div>
                )}
              </div>
              <div className="h-[158px] shrink-0 pt-3">{cards('row')}</div>
            </>
          )}
        </div>
        {tickerEl && <div className="absolute inset-x-0 bottom-0" style={{ height: tickerH }}>{tickerEl}</div>}
        <PrayerOverlay phase={state.phase} isFriday={friday} clock={clock} prayer={ps} mosqueName={bundle.mosque.name} />
      </div>

      {status === 'offline' && (
        <div className="absolute right-4 top-4 z-50 flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-medium text-amber-300 backdrop-blur" data-testid="tv-offline">
          <WifiOff className="h-4 w-4" />
          Offline · data terakhir {(() => { const d = mosqueDate(ps.timezone, bundle.fetchedAt); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` })()}
        </div>
      )}

      <div data-controls className={`absolute bottom-24 right-5 z-50 flex items-center gap-2 transition-opacity duration-500 ${idle ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
        {bundle.device && <span className="rounded-full bg-black/55 px-4 py-2 text-sm text-white/90 backdrop-blur">{bundle.device.name}</span>}
        {fs.supported && (
          <button onClick={fs.toggle} className="flex items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-sm font-medium text-white backdrop-blur hover:bg-black/75" data-testid="tv-fullscreen">
            {fs.active ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            {fs.active ? 'Keluar layar penuh' : 'Layar penuh (F)'}
          </button>
        )}
        <Link to="/admin" className="flex items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-sm font-medium text-white backdrop-blur hover:bg-black/75">
          <Settings className="h-4 w-4" />
          Admin
        </Link>
      </div>
    </div>
  )
}

