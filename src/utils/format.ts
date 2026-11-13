const idNumber = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })
const idDate = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
const idDateTime = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export const fmtPoints = (n: number | string | null | undefined) => idNumber.format(Number(n ?? 0))
export const fmtInt = (n: number | string | null | undefined) => idNumber.format(Math.round(Number(n ?? 0)))
export const fmtDate = (d: string | null | undefined) => (d ? idDate.format(new Date(d)) : '—')
export const fmtDateTime = (d: string | null | undefined) => (d ? idDateTime.format(new Date(d)) : '—')
/** 2345 → "2,35 dtk" */
export const fmtSeconds = (ms: number | null | undefined) =>
  ms == null ? '—' : `${(Number(ms) / 1000).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} dtk`

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')

export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export const LABELS = {
  sessionStatus: { draft: 'Draf', open: 'Dibuka', running: 'Berjalan', paused: 'Dijeda', finished: 'Selesai', cancelled: 'Dibatalkan' },
  eventStatus: { draft: 'Draf', published: 'Dipublikasikan', ongoing: 'Berlangsung', completed: 'Selesai', archived: 'Diarsipkan' },
  roundMode: { normal: 'Normal', speed: 'Kecepatan', elimination: 'Eliminasi', final: 'Final', tiebreak: 'Soal Tambahan' },
  questionType: { multiple_choice: 'Pilihan Ganda', true_false: 'Benar / Salah', short_answer: 'Jawaban Singkat' },
  difficulty: { easy: 'Mudah', medium: 'Sedang', hard: 'Sulit' },
  cqStatus: { pending: 'Menunggu', active: 'Berjalan', closed: 'Ditutup', revealed: 'Dibuka', cancelled: 'Dibatalkan' },
  registration: { pending: 'Menunggu', verified: 'Terverifikasi', rejected: 'Ditolak' },
  participation: { registered: 'Terdaftar', active: 'Aktif', withdrawn: 'Mundur', disqualified: 'Diskualifikasi' },
  eliminationRule: { none: 'Tanpa eliminasi', wrong_count: 'Jumlah kesalahan', score_threshold: 'Ambang skor', manual: 'Keputusan operator' },
  scope: { all: 'Semua peserta sesi', survivors: 'Peserta yang lolos babak sebelumnya', top_n: 'Peringkat teratas (Top-N)', manual: 'Dipilih operator' },
} as const
