import type { DisplaySettings, SpecialMode } from './types'

export const HIJRI_MONTHS = ['Muharam', 'Safar', 'Rabiulawal', 'Rabiulakhir', 'Jumadilawal', 'Jumadilakhir', 'Rajab', 'Syakban',
  'Ramadan', 'Syawal', 'Zulkaidah', 'Zulhijah']
export const DAYS = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
export const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

export interface HijriDate { day: number; month: number; year: number; monthName: string; text: string }

let umalqura: Intl.DateTimeFormat | null | undefined

function viaIntl(d: Date): [number, number, number] | null {
  if (umalqura === undefined) {
    try {
      const f = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' })
      umalqura = f.resolvedOptions().calendar.startsWith('islamic') ? f : null
    } catch {
      umalqura = null
    }
  }
  if (!umalqura) return null
  const parts = umalqura.formatToParts(d)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const r: [number, number, number] = [get('day'), get('month'), get('year')]
  return r.every((n) => Number.isFinite(n) && n > 0) ? r : null
}

/** Cadangan untuk peramban lama (mis. sebagian Smart TV): kalender Hijriah tabular (aritmetis). */
function viaTabular(d: Date): [number, number, number] {
  const jd = Math.floor(d.getTime() / 86_400_000) + 2440588
  const l0 = jd - 1948440 + 10632
  const n = Math.floor((l0 - 1) / 10631)
  const l1 = l0 - 10631 * n + 354
  const j = Math.floor((10985 - l1) / 5316) * Math.floor((50 * l1) / 17719) + Math.floor(l1 / 5670) * Math.floor((43 * l1) / 15238)
  const l2 = l1 - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29
  const month = Math.floor((24 * l2) / 709)
  return [l2 - Math.floor((709 * month) / 24), month, 30 * n + j - 30]
}

/**
 * Tanggal Hijriah untuk "jam dinding" masjid (lihat mosqueDate).
 * offsetDays: koreksi admin (-3..3) mengikuti penetapan pemerintah; afterMaghrib: hari Hijriah berganti saat Magrib.
 */
export function toHijri(md: Date, offsetDays = 0, afterMaghrib = false): HijriDate {
  const base = Date.UTC(md.getUTCFullYear(), md.getUTCMonth(), md.getUTCDate(), 12)
  const d = new Date(base + (offsetDays + (afterMaghrib ? 1 : 0)) * 86_400_000)
  const [day, month, year] = viaIntl(d) ?? viaTabular(d)
  const monthName = HIJRI_MONTHS[month - 1] ?? ''
  return { day, month, year, monthName, text: `${day} ${monthName} ${year} H` }
}

export function fmtDateLong(md: Date): string {
  return `${DAYS[md.getUTCDay()]}, ${md.getUTCDate()} ${MONTHS[md.getUTCMonth()]} ${md.getUTCFullYear()}`
}

/** Mode khusus yang berlaku: pilihan admin, atau otomatis dari kalender Hijriah. */
export function resolveSpecialMode(setting: DisplaySettings['special_mode'], h: HijriDate): SpecialMode {
  if (setting !== 'auto') return setting
  if (h.month === 9) return 'ramadan'
  if (h.month === 10 && h.day <= 3) return 'idulfitri'
  if (h.month === 12 && h.day >= 10 && h.day <= 13) return 'iduladha'
  return 'normal'
}
