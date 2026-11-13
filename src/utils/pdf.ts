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
}

const RANK_TITLE: Record<number, string> = { 1: 'JUARA 1', 2: 'JUARA 2', 3: 'JUARA 3' }

/** Sertifikat A4 lanskap. Peringkat 1–3 mendapat template pemenang; lainnya template peserta. */
export async function exportCertificates(rows: LeaderboardRow[], info: CertificateInfo, filename: string) {
  const { default: JsPDF } = await import('jspdf')
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = 297
  const H = 210
  rows.forEach((r, i) => {
    if (i > 0) doc.addPage()
    const winner = r.rank <= 3 && !r.is_eliminated
    const accent: [number, number, number] = r.rank === 1 ? [201, 152, 20] : r.rank === 2 ? [128, 138, 152] : r.rank === 3 ? [176, 108, 48] : [31, 123, 255]
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
    // kepala
    doc.setTextColor(11, 27, 63)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(info.organizer.toUpperCase(), W / 2, 31, { align: 'center' })
    doc.setFontSize(34)
    doc.text(winner ? 'PIAGAM PENGHARGAAN' : 'SERTIFIKAT', W / 2, 50, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(12)
    doc.setTextColor(90, 100, 120)
    doc.text('diberikan kepada', W / 2, 64, { align: 'center' })
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
    doc.setFontSize(winner ? 30 : 24)
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
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(130, 140, 155)
    doc.text('"Siapa Cepat, Siapa Tepat, Dialah Juara!"', 26, 186)
  })
  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
}
