import { CalculationMethod, type CalculationParameters, Coordinates, Madhab, PrayerTimes, Rounding } from 'adhan'
import type { PrayerKey, PrayerSchedule, Timezone, WajibKey } from './types'

export const PRAYER_KEYS: PrayerKey[] = ['imsak', 'subuh', 'terbit', 'duha', 'zuhur', 'asar', 'magrib', 'isya']
export const WAJIB_KEYS: WajibKey[] = ['subuh', 'zuhur', 'asar', 'magrib', 'isya']
export const PRAYER_LABEL: Record<PrayerKey, string> = {
  imsak: 'Imsak', subuh: 'Subuh', terbit: 'Terbit', duha: 'Duha', zuhur: 'Zuhur', asar: 'Asar', magrib: 'Magrib', isya: 'Isya',
}
export const TZ_OFFSET: Record<Timezone, number> = { WIB: 7, WITA: 8, WIT: 9 }

export const CALC_METHODS: { value: PrayerSchedule['calc_method']; label: string }[] = [
  { value: 'kemenag', label: 'Kemenag RI (Subuh 20°, Isya 18°)' },
  { value: 'singapore', label: 'MUIS Singapura (Subuh 20°, Isya 18°)' },
  { value: 'mwl', label: 'Muslim World League (Subuh 18°, Isya 17°)' },
  { value: 'egyptian', label: 'Egyptian General Authority (19,5° / 17,5°)' },
  { value: 'karachi', label: 'Univ. Islam Karachi (18° / 18°)' },
  { value: 'umm_al_qura', label: 'Umm al-Qura, Makkah' },
]

export type DayTimes = Record<PrayerKey, number> // menit sejak 00:00 waktu masjid

/** "Jam dinding" masjid: Date yang komponen UTC-nya adalah waktu lokal masjid (WIB/WITA/WIT tidak mengenal DST). */
export function mosqueDate(tz: Timezone, nowMs: number = Date.now()): Date {
  return new Date(nowMs + TZ_OFFSET[tz] * 3_600_000)
}

export const pad = (n: number) => String(n).padStart(2, '0')
export const fmtMinutes = (m: number) => {
  const x = ((Math.round(m) % 1440) + 1440) % 1440
  return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`
}
export const parseHHMM = (s: string | undefined | null): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(s ?? '')
  if (!m) return null
  const h = Number(m[1]), mi = Number(m[2])
  return h < 24 && mi < 60 ? h * 60 + mi : null
}

function methodParams(ps: Pick<PrayerSchedule, 'calc_method' | 'madhab'>): CalculationParameters {
  let p: CalculationParameters
  switch (ps.calc_method) {
    case 'singapore': p = CalculationMethod.Singapore(); break
    case 'mwl': p = CalculationMethod.MuslimWorldLeague(); break
    case 'egyptian': p = CalculationMethod.Egyptian(); break
    case 'karachi': p = CalculationMethod.Karachi(); break
    case 'umm_al_qura': p = CalculationMethod.UmmAlQura(); break
    default:
      // Kriteria Kementerian Agama RI: Subuh saat matahari -20°, Isya -18°.
      p = CalculationMethod.Other()
      p.fajrAngle = 20
      p.ishaAngle = 18
  }
  p.madhab = ps.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi
  p.rounding = Rounding.None
  p.methodAdjustments = { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 }
  return p
}

const cache = new Map<string, DayTimes>()

/** Jadwal salat satu hari (tahun, bulan 1-12, tanggal) menurut pengaturan masjid. */
export function computeDayTimes(ps: PrayerSchedule, y: number, m: number, d: number): DayTimes {
  const corr = (k: PrayerKey) => Number(ps.corrections?.[k] ?? 0) || 0

  if (ps.mode === 'manual') {
    const out = {} as DayTimes
    for (const k of PRAYER_KEYS) out[k] = parseHHMM(ps.manual_times?.[k]) ?? 0
    return out
  }

  const key = [ps.updated_at, ps.latitude, ps.longitude, ps.timezone, ps.calc_method, ps.madhab, ps.ihtiyat_minutes,
    ps.imsak_offset, ps.duha_offset, JSON.stringify(ps.corrections), y, m, d].join('|')
  const hit = cache.get(key)
  if (hit) return hit

  const pt = new PrayerTimes(new Coordinates(Number(ps.latitude), Number(ps.longitude)), new Date(y, m - 1, d), methodParams(ps))
  const off = TZ_OFFSET[ps.timezone] * 60
  // menit (pecahan) sejak tengah malam waktu masjid
  const mins = (t: Date) => (((t.getTime() / 60000 + off) % 1440) + 1440) % 1440
  const iht = Number(ps.ihtiyat_minutes) || 0
  // Kaidah ihtiyat: waktu salat dibulatkan ke atas lalu ditambah ihtiyat; Terbit dibulatkan ke bawah lalu dikurangi.
  const up = (t: Date, k: PrayerKey) => Math.ceil(mins(t) - 1e-6) + iht + corr(k)
  const subuh = up(pt.fajr, 'subuh')
  const terbit = Math.floor(mins(pt.sunrise)) - iht + corr('terbit')
  const out: DayTimes = {
    imsak: subuh - (Number(ps.imsak_offset) || 0) + corr('imsak'),
    subuh,
    terbit,
    duha: terbit + iht + (Number(ps.duha_offset) || 0) + corr('duha'),
    zuhur: up(pt.dhuhr, 'zuhur'),
    asar: up(pt.asr, 'asar'),
    magrib: up(pt.maghrib, 'magrib'),
    isya: up(pt.isha, 'isya'),
  }
  if (cache.size > 200) cache.clear()
  cache.set(key, out)
  return out
}

export function timesForDate(ps: PrayerSchedule, md: Date): DayTimes {
  return computeDayTimes(ps, md.getUTCFullYear(), md.getUTCMonth() + 1, md.getUTCDate())
}

export type Phase =
  | { type: 'normal' }
  | { type: 'adzan' | 'iqamah' | 'salat' | 'jumat'; key: WajibKey; remaining: number; total: number }

export interface PrayerState {
  times: DayTimes
  /** salat wajib berikutnya */
  next: { key: WajibKey; minutes: number; secondsLeft: number; tomorrow: boolean }
  /** salat wajib yang waktunya sedang berjalan (null sebelum Subuh) */
  current: WajibKey | null
  /** kemajuan 0..1 dari salat sebelumnya menuju berikutnya */
  progress: number
  phase: Phase
  isFriday: boolean
}

/** Keadaan jadwal pada suatu saat: salat berikutnya, hitung mundur, dan fase mode salat. */
export function getPrayerState(ps: PrayerSchedule, nowMs: number, opts: { fridayMode?: boolean } = {}): PrayerState {
  const md = mosqueDate(ps.timezone, nowMs)
  const times = timesForDate(ps, md)
  const sec = md.getUTCHours() * 3600 + md.getUTCMinutes() * 60 + md.getUTCSeconds()
  const isFriday = md.getUTCDay() === 5

  let next: PrayerState['next'] | null = null
  let current: WajibKey | null = null
  for (const k of WAJIB_KEYS) {
    if (times[k] * 60 > sec) {
      next = { key: k, minutes: times[k], secondsLeft: times[k] * 60 - sec, tomorrow: false }
      break
    }
    current = k
  }
  let prevStart: number // detik relatif terhadap 00:00 hari ini
  if (!next) {
    const tm = timesForDate(ps, new Date(md.getTime() + 86_400_000))
    next = { key: 'subuh', minutes: tm.subuh, secondsLeft: 86400 - sec + tm.subuh * 60, tomorrow: true }
    prevStart = times.isya * 60
  } else if (current) {
    prevStart = times[current] * 60
  } else {
    const yd = timesForDate(ps, new Date(md.getTime() - 86_400_000))
    prevStart = yd.isya * 60 - 86400
  }
  const span = sec + next.secondsLeft - prevStart
  const progress = span > 0 ? Math.min(1, Math.max(0, (sec - prevStart) / span)) : 0

  let phase: Phase = { type: 'normal' }
  if (current && ps.prayer_mode_enabled) {
    const since = sec - times[current] * 60
    const adzan = ps.adzan_minutes * 60
    if (isFriday && current === 'zuhur' && opts.fridayMode !== false) {
      const jumat = ps.jumat_minutes * 60
      if (since < adzan) phase = { type: 'adzan', key: current, remaining: adzan - since, total: adzan }
      else if (since < adzan + jumat) phase = { type: 'jumat', key: current, remaining: adzan + jumat - since, total: jumat }
    } else {
      const iqamah = (Number(ps.iqamah_minutes?.[current]) || 0) * 60
      const salat = ps.salat_screen_enabled ? ps.salat_minutes * 60 : 0
      if (since < adzan) phase = { type: 'adzan', key: current, remaining: adzan - since, total: adzan }
      else if (since < adzan + iqamah) phase = { type: 'iqamah', key: current, remaining: adzan + iqamah - since, total: iqamah }
      else if (since < adzan + iqamah + salat) phase = { type: 'salat', key: current, remaining: adzan + iqamah + salat - since, total: salat }
    }
  }
  return { times, next, current, progress, phase, isFriday }
}

export function fmtCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`
}
