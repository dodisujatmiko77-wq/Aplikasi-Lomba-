// Export PDF: tabel laporan dan sertifikat (jsPDF dimuat saat dibutuhkan).
import type { LeaderboardRow } from '@/types'

export interface PdfTable {
  filename: string
  title: string
  subtitle?: string
  head: string[]
  body: (string | number)[][]
  landscape?: boolean
}

export async function exportTablePdf(t: PdfTable) {
  const { default: JsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new JsPDF({ orientation: t.landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
  const w = doc.internal.pageSize.getWidth()
  doc.setFillColor(11, 27, 63)
  doc.rect(0, 0, w, 24, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(t.title, 12, 11)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  if (t.subtitle) doc.text(t.subtitle, 12, 17.5)
  doc.text('LOMBA RANGKING 1', w - 12, 11, { align: 'right' })
  doc.text(`Dicetak ${new Date().toLocaleString('id-ID')}`, w - 12, 17.5, { align: 'right' })
  autoTable(doc, {
    head: [t.head],
    body: t.body,
    startY: 30,
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: [31, 123, 255], textColor: 255 },
    alternateRowStyles: { fillColor: [244, 247, 252] },
    margin: { left: 12, right: 12 },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight()
      doc.setFontSize(8)
      doc.setTextColor(120)
      doc.text('Produk UPT SMPN 1 Baradatu · Dikembangkan oleh Dodi Sujatmiko', 12, h - 6)
      doc.text(`Hal. ${doc.getNumberOfPages()}`, w - 12, h - 6, { align: 'right' })
    },
  })
  doc.save(t.filename.endsWith('.pdf') ? t.filename : `${t.filename}.pdf`)
}

export interface CertificateInfo {
  eventName: string
  sessionName: string
  organizer: string
  location?: string | null
  date: string
  signerName?: string
  signerTitle?: string
  /** penanda tangan kedua (kiri, "Mengetahui"), mis. Ketua PGRI Kabupaten Way Kanan */
  chairName?: string
  chairTitle?: string
  /** logo aplikasi (kiri atas), path publik */
  appLogoUrl?: string | null
  /** logo penyelenggara/event (kanan atas), opsional */
  organizerLogoUrl?: string | null
  /** kode jenjang sesi untuk nomor piagam, mis. SD / SMP / SMA-SMK */
  levelCode?: string
  /** tanggal terbit (bulan Romawi & tahun pada nomor piagam) */
  issuedAt?: Date
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
/** Nomor piagam: <no urut dari no peserta>/PIAGAM/LR1/<jenjang>/PGRI-WK/<bulan Romawi>/<tahun> */
export function certificateNumber(participantNumber: string | null | undefined, rank: number, kind: 'PIAGAM' | 'SERTIFIKAT', levelCode: string, when: Date) {
  const digits = (participantNumber ?? '').match(/(\d+)(?!.*\d)/)?.[1]
  const seq = (digits ?? String(rank)).padStart(3, '0')
  return `${seq}/${kind}/LR1/${levelCode}/PGRI-WK/${ROMAN[when.getMonth()]}/${when.getFullYear()}`
}
/** Kode jenjang untuk nomor: nama jenjang tanpa garis miring (SMA/SMK → SMA-SMK). */
export const levelCodeOf = (level: string | null | undefined) => (level ?? '').trim().toUpperCase().replace(/\s*\/\s*/g, '-') || 'UMUM'

const RANK_TITLE: Record<number, string> = { 1: 'JUARA 1', 2: 'JUARA 2', 3: 'JUARA 3', 4: 'JUARA HARAPAN 1', 5: 'JUARA HARAPAN 2', 6: 'JUARA HARAPAN 3' }
/** Peringkat yang mendapat piagam (juara 1–3 dan juara harapan 1–3). */
export const AWARD_MAX_RANK = 6

async function loadImage(url?: string | null): Promise<{ data: string; w: number; h: number; fmt: 'PNG' | 'JPEG' | 'WEBP'; alias: string } | null> {
  if (!url) return null
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    if (!blob.type.startsWith('image/')) return null
    const data = await new Promise<string | null>((resolve) => { const r = new FileReader(); r.onload = () => resolve(typeof r.result === 'string' ? r.result : null); r.onerror = () => resolve(null); r.readAsDataURL(blob) })
    if (!data) return null
    const size = await new Promise<{ w: number; h: number } | null>((resolve) => { const i = new Image(); i.onload = () => resolve({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => resolve(null); i.src = data })
    if (!size) return null
    const fmt = data.startsWith('data:image/png') ? 'PNG' : data.startsWith('data:image/webp') ? 'WEBP' : 'JPEG'
    return { data, ...size, fmt, alias: 'img-' + url.replace(/[^a-z0-9]/gi, '').slice(-40) }
  } catch {
    return null
  }
}

/** Sertifikat A4 lanskap. Juara 1–3 dan juara harapan 1–3 (peringkat 4–6) mendapat piagam; lainnya sertifikat peserta. */
export async function exportCertificates(rows: LeaderboardRow[], info: CertificateInfo, filename: string) {
  const { default: JsPDF } = await import('jspdf')
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = 297
  const H = 210
  const [appLogo, orgLogo, hut, hgn, ramah, bermutu, hebat] = await Promise.all([
    loadImage(info.appLogoUrl), loadImage(info.organizerLogoUrl),
    loadImage('/piagam/hut-pgri-81.png'), loadImage('/piagam/hgn-2026.png'), loadImage('/piagam/ramah.png'),
    loadImage('/piagam/pendidikan-bermutu.png'), loadImage('/piagam/guru-hebat.png'),
  ])
  const when = info.issuedAt ?? new Date()
  const levelCode = info.levelCode || 'UMUM'
  type Img = NonNullable<typeof appLogo>
  const fit = (img: Img, maxW: number, maxH: number) => { const s = Math.min(maxW / img.w, maxH / img.h); return { w: img.w * s, h: img.h * s } }
  /** Satu baris logo: rata kiri / kanan / tengah, dipusatkan vertikal pada tinggi `h`. */
  const logoRow = (items: { img: Img | null; maxW: number }[], x: number, y: number, h: number, align: 'left' | 'right' | 'center', gap = 3.5) => {
    const list = items.filter((i): i is { img: Img; maxW: number } => !!i.img).map((i) => ({ img: i.img, ...fit(i.img, i.maxW, h) }))
    const total = list.reduce((a, b) => a + b.w, 0) + gap * Math.max(0, list.length - 1)
    let cx = align === 'left' ? x : align === 'right' ? x - total : x - total / 2
    for (const it of list) { doc.addImage(it.img.data, it.img.fmt, cx, y + (h - it.h) / 2, it.w, it.h, it.img.alias, 'FAST'); cx += it.w + gap }
  }
  rows.forEach((r, i) => {
    if (i > 0) doc.addPage()
    const winner = r.rank <= AWARD_MAX_RANK && !r.is_eliminated
    const accent: [number, number, number] = r.is_eliminated ? [31, 123, 255] : r.rank === 1 ? [201, 152, 20] : r.rank === 2 ? [128, 138, 152] : r.rank === 3 ? [176, 108, 48] : r.rank <= AWARD_MAX_RANK ? [234, 88, 12] : [31, 123, 255]
    // bingkai
    doc.setFillColor(11, 27, 63)
    doc.rect(0, 0, W, H, 'F')
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(8, 8, W - 16, H - 16, 3, 3, 'F')
    doc.setDrawColor(...accent)
    doc.setLineWidth(1.2)
    doc.roundedRect(13, 13, W - 26, H - 26, 2, 2, 'S')
    doc.setLineWidth(0.3)
    doc.roundedRect(15.5, 15.5, W - 31, H - 31, 1.5, 1.5, 'S')
    // logo kepala: kiri HUT PGRI + Lomba Rangking 1, kanan Hari Guru Nasional
    logoRow([{ img: hut, maxW: 20 }, { img: appLogo, maxW: 32 }], 22, 19, 25, 'left')
    logoRow([{ img: hgn, maxW: 54 }], W - 22, 21, 21, 'right')
    // kepala
    doc.setTextColor(11, 27, 63)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(info.organizer.toUpperCase(), W / 2, 31, { align: 'center', maxWidth: W - 110 })
    doc.setFontSize(34)
    doc.text(winner ? 'PIAGAM PENGHARGAAN' : 'SERTIFIKAT', W / 2, 50, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10.5)
    doc.setTextColor(60, 70, 90)
    doc.text(`Nomor: ${certificateNumber(r.number, r.rank, winner ? 'PIAGAM' : 'SERTIFIKAT', levelCode, when)}`, W / 2, 57.5, { align: 'center' })
    doc.setFontSize(12)
    doc.setTextColor(90, 100, 120)
    doc.text('diberikan kepada', W / 2, 65, { align: 'center' })
    // nama
    doc.setTextColor(11, 27, 63)
    doc.setFont('times', 'bolditalic')
    doc.setFontSize(32)
    doc.text(r.name, W / 2, 82, { align: 'center', maxWidth: W - 70 })
    doc.setDrawColor(...accent)
    doc.setLineWidth(0.6)
    doc.line(W / 2 - 60, 87, W / 2 + 60, 87)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(12)
    doc.setTextColor(60, 70, 90)
    doc.text(`${r.school}${r.district ? ` · Kecamatan ${r.district}` : ''}`, W / 2, 95, { align: 'center' })
    doc.text('sebagai', W / 2, 108, { align: 'center' })
    // predikat
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(winner ? (r.rank > 3 ? 26 : 30) : 24)
    doc.setTextColor(...accent)
    doc.text(winner ? RANK_TITLE[r.rank] : 'PESERTA', W / 2, 123, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(12)
    doc.setTextColor(60, 70, 90)
    doc.text(`${info.eventName} — ${info.sessionName}`, W / 2, 135, { align: 'center', maxWidth: W - 60 })
    doc.setFontSize(10.5)
    doc.text(`Peringkat ${r.rank} · ${Number(r.points).toLocaleString('id-ID')} poin · ${r.correct} jawaban benar`, W / 2, 142.5, { align: 'center' })
    // tanda tangan
    doc.setFontSize(11)
    doc.text(`${info.location ? info.location + ', ' : ''}${info.date}`, W - 70, 158, { align: 'center' })
    doc.text(info.signerTitle || 'Ketua Panitia', W - 70, 164, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.text(info.signerName || '( ................................ )', W - 70, 186, { align: 'center' })
    // penanda tangan kedua (kiri)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(60, 70, 90)
    doc.text('Mengetahui,', 70, 158, { align: 'center' })
    doc.text(info.chairTitle || 'Ketua PGRI Kabupaten Way Kanan', 70, 164, { align: 'center', maxWidth: 90 })
    doc.setFont('helvetica', 'bold')
    doc.text(info.chairName || '( ................................ )', 70, 186, { align: 'center' })
    // logo kaki (tengah, di antara tanda tangan)
    logoRow([{ img: ramah, maxW: 28 }, { img: bermutu, maxW: 40 }, { img: orgLogo, maxW: 16 }], W / 2, 165, 13, 'center', 5)
    logoRow([{ img: hebat, maxW: 72 }], W / 2, 182.5, 5, 'center')
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7.5)
    doc.setTextColor(130, 140, 155)
    doc.text('"Siapa Cepat, Siapa Tepat, Dialah Juara!"', W / 2, 192.3, { align: 'center' })
  })
  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
}
