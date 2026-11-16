import { MONTHS } from './hijri'

const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
export const rupiah = (n: number | string | null | undefined) => idr.format(Number(n) || 0)

export function rupiahShort(n: number): string {
  const a = Math.abs(n)
  const f = (x: number) => x.toLocaleString('id-ID', { maximumFractionDigits: 1 })
  if (a >= 1e9) return `Rp ${f(n / 1e9)} M`
  if (a >= 1e6) return `Rp ${f(n / 1e6)} jt`
  if (a >= 1e3) return `Rp ${f(n / 1e3)} rb`
  return `Rp ${f(n)}`
}

/** 'YYYY-MM-DD' → '17 Agu 2026' */
export function fmtDate(iso: string | null | undefined, long = false): string {
  if (!iso) return '-'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return '-'
  return `${d} ${long ? MONTHS[m - 1] : MONTHS[m - 1].slice(0, 3)} ${y}`
}

export const fmtTime = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')
export const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS[m - 1]?.slice(0, 3)} ${String(y).slice(2)}`
}

/** 'YYYY-MM-DD' dari "jam dinding" masjid (atau waktu perangkat bila tanpa argumen). */
export function isoDate(md?: Date): string {
  if (md) return md.toISOString().slice(0, 10)
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

/** Apakah konten sedang dalam masa tayang pada tanggal `today` ('YYYY-MM-DD'). */
export function inSchedule(row: { start_date: string | null; end_date: string | null }, today: string): boolean {
  return (!row.start_date || row.start_date <= today) && (!row.end_date || row.end_date >= today)
}

export function timeAgo(iso: string | null): string {
  if (!iso) return 'belum pernah terhubung'
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 90) return 'baru saja'
  if (s < 3600) return `${Math.round(s / 60)} menit lalu`
  if (s < 86400) return `${Math.round(s / 3600)} jam lalu`
  return `${Math.round(s / 86400)} hari lalu`
}

/** Layar dianggap online bila heartbeat terakhir < 3 menit. */
export const isOnline = (lastSeen: string | null) => !!lastSeen && Date.now() - new Date(lastSeen).getTime() < 180_000

// --- warna ---
const hex2rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
export function mix(a: string, b: string, t: number): string {
  const x = hex2rgb(a), y = hex2rgb(b)
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')
}
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hex2rgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
export function luminance(hex: string): number {
  const [r, g, b] = hex2rgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
