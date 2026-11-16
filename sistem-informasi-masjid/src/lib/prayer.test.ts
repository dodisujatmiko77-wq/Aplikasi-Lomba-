import { describe, expect, it } from 'vitest'
import { computeDayTimes, fmtCountdown, fmtMinutes, getPrayerState, parseHHMM } from './prayer'
import { resolveSpecialMode, toHijri } from './hijri'
import { inSchedule } from './format'
import type { PrayerSchedule } from './types'

const base: PrayerSchedule = {
  id: 'x', created_at: '', updated_at: 'v1', mosque_id: 'm', mode: 'auto', location_name: 'Jakarta', latitude: -6.175392, longitude: 106.827153,
  timezone: 'WIB', calc_method: 'kemenag', madhab: 'syafii', ihtiyat_minutes: 2, imsak_offset: 10, duha_offset: 28, corrections: {},
  manual_times: { imsak: '04:20', subuh: '04:30', terbit: '05:45', duha: '06:13', zuhur: '12:00', asar: '15:15', magrib: '18:00', isya: '19:10' },
  iqamah_minutes: { subuh: 10, zuhur: 10, asar: 10, magrib: 7, isya: 10 }, adzan_minutes: 4, salat_minutes: 12, jumat_minutes: 45,
  prayer_mode_enabled: true, salat_screen_enabled: true, countdown_enabled: true, notify_sound: false, hijri_offset: 0, imams: {},
  khatib_jumat: '', imam_jumat: '', muazin_jumat: '',
}
// saat (waktu masjid WIB) → epoch ms
const wib = (y: number, m: number, d: number, h: number, mi: number, s = 0) => Date.UTC(y, m - 1, d, h - 7, mi, s)
const near = (actual: number, hhmm: string, tol = 2) => expect(Math.abs(actual - parseHHMM(hhmm)!)).toBeLessThanOrEqual(tol)

describe('jadwal salat otomatis', () => {
  it('mendekati jadwal yang lazim beredar untuk Jakarta, 17 Agustus 2025 (toleransi 2-3 menit)', () => {
    // Acuan pembanding: Subuh 04:43, Terbit 05:57, Zuhur 12:00, Asar 15:20, Magrib 17:57, Isya 19:08
    const t = computeDayTimes(base, 2025, 8, 17)
    near(t.subuh, '04:43'); near(t.terbit, '05:57', 3); near(t.zuhur, '12:00'); near(t.asar, '15:20'); near(t.magrib, '17:57'); near(t.isya, '19:08')
    expect(t.imsak).toBe(t.subuh - 10)
    expect(t.duha).toBeGreaterThan(t.terbit)
  })
  it('urutan waktu selalu naik di tiga zona waktu', () => {
    for (const [lat, lng, tz] of [[5.55, 95.32, 'WIB'], [-5.15, 119.43, 'WITA'], [-2.53, 140.72, 'WIT']] as const) {
      const t = computeDayTimes({ ...base, latitude: lat, longitude: lng, timezone: tz }, 2026, 3, 1)
      const seq = [t.imsak, t.subuh, t.terbit, t.duha, t.zuhur, t.asar, t.magrib, t.isya]
      expect([...seq].sort((a, b) => a - b)).toEqual(seq)
      expect(t.zuhur).toBeGreaterThan(11 * 60 + 30)
      expect(t.zuhur).toBeLessThan(13 * 60)
    }
  })
  it('koreksi manual per waktu diterapkan', () => {
    const a = computeDayTimes(base, 2026, 1, 10)
    const b = computeDayTimes({ ...base, updated_at: 'v2', corrections: { magrib: 3, subuh: -1 } }, 2026, 1, 10)
    expect(b.magrib - a.magrib).toBe(3)
    expect(b.subuh - a.subuh).toBe(-1)
  })
  it('mode manual memakai jam yang diisi admin', () => {
    const t = computeDayTimes({ ...base, mode: 'manual' }, 2026, 1, 10)
    expect(fmtMinutes(t.zuhur)).toBe('12:00')
    expect(fmtMinutes(t.isya)).toBe('19:10')
  })
})

describe('keadaan & mode salat', () => {
  const ps: PrayerSchedule = { ...base, mode: 'manual' }
  it('hitung mundur ke salat berikutnya', () => {
    const s = getPrayerState(ps, wib(2026, 11, 18, 11, 30, 0)) // Rabu
    expect(s.next.key).toBe('zuhur')
    expect(s.next.secondsLeft).toBe(1800)
    expect(s.current).toBe('subuh')
    expect(s.phase.type).toBe('normal')
  })
  it('setelah Isya menunjuk Subuh esok hari', () => {
    const s = getPrayerState(ps, wib(2026, 11, 18, 23, 0, 0))
    expect(s.next).toMatchObject({ key: 'subuh', tomorrow: true, secondsLeft: 5.5 * 3600 })
  })
  it('fase adzan → iqamah → salat → normal', () => {
    expect(getPrayerState(ps, wib(2026, 11, 18, 18, 0, 0)).phase).toMatchObject({ type: 'adzan', key: 'magrib', remaining: 240 })
    expect(getPrayerState(ps, wib(2026, 11, 18, 18, 4, 0)).phase).toMatchObject({ type: 'iqamah', remaining: 420 })
    expect(getPrayerState(ps, wib(2026, 11, 18, 18, 11, 0)).phase).toMatchObject({ type: 'salat', remaining: 720 })
    expect(getPrayerState(ps, wib(2026, 11, 18, 18, 23, 0)).phase.type).toBe('normal')
  })
  it('mode salat dapat dinonaktifkan', () => {
    expect(getPrayerState({ ...ps, prayer_mode_enabled: false }, wib(2026, 11, 18, 18, 1)).phase.type).toBe('normal')
    expect(getPrayerState({ ...ps, salat_screen_enabled: false }, wib(2026, 11, 18, 18, 12)).phase.type).toBe('normal')
  })
  it('Zuhur hari Jumat memakai mode khutbah', () => {
    const fri = getPrayerState(ps, wib(2026, 11, 20, 12, 10)) // Jumat
    expect(fri.isFriday).toBe(true)
    expect(fri.phase).toMatchObject({ type: 'jumat', key: 'zuhur' })
    expect(getPrayerState(ps, wib(2026, 11, 20, 12, 10), { fridayMode: false }).phase.type).toBe('iqamah')
  })
})

describe('kalender Hijriah & utilitas', () => {
  it('1 Ramadan 1447 H = 18 Februari 2026 (Umm al-Qura), dengan koreksi admin', () => {
    const d = new Date(Date.UTC(2026, 1, 18, 9))
    expect(toHijri(d)).toMatchObject({ day: 1, month: 9, year: 1447, monthName: 'Ramadan' })
    expect(toHijri(d, 1).day).toBe(2)
    expect(toHijri(d, 0, true).day).toBe(2)
  })
  it('mode khusus otomatis', () => {
    expect(resolveSpecialMode('auto', toHijri(new Date(Date.UTC(2026, 1, 25))))).toBe('ramadan')
    expect(resolveSpecialMode('auto', toHijri(new Date(Date.UTC(2026, 10, 16))))).toBe('normal')
    expect(resolveSpecialMode('iduladha', toHijri(new Date(Date.UTC(2026, 10, 16))))).toBe('iduladha')
  })
  it('format & masa tayang', () => {
    expect(fmtCountdown(3725)).toBe('01:02:05')
    expect(fmtCountdown(65)).toBe('01:05')
    expect(inSchedule({ start_date: '2026-01-01', end_date: '2026-01-31' }, '2026-01-31')).toBe(true)
    expect(inSchedule({ start_date: '2026-02-01', end_date: null }, '2026-01-31')).toBe(false)
  })
})
