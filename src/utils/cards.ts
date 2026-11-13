// Kartu peserta (PDF A4, 8 kartu per halaman, ukuran 92 × 63 mm) — siap dicetak, dipotong, dan dibagikan.
// Berisi foto, identitas, kode + PIN, dan QR yang membuka halaman masuk peserta dengan kode terisi otomatis.

export interface CardData {
  name: string
  number: string
  school: string
  level: string
  district: string
  code: string
  pin: string
  photoUrl?: string | null
}

export interface CardEvent {
  eventName: string
  organizer: string
  productOwner: string
  /** alamat halaman masuk peserta, mis. https://lomba-rangking1.vercel.app/peserta */
  loginUrl: string
  /** gambar PNG logo (path publik) */
  logoPath?: string
}

const NAVY: [number, number, number] = [11, 27, 63]
const BLUE: [number, number, number] = [31, 123, 255]
const ORANGE: [number, number, number] = [249, 115, 22]
const GRAY: [number, number, number] = [91, 101, 119]
const SOFT: [number, number, number] = [243, 246, 251]

const CARD_W = 92
const CARD_H = 63
const COLS = 2
const ROWS = 4
const GAP_X = 6
const GAP_Y = 4
const MARGIN_X = (210 - (COLS * CARD_W + (COLS - 1) * GAP_X)) / 2
const MARGIN_Y = (297 - (ROWS * CARD_H + (ROWS - 1) * GAP_Y)) / 2

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    if (!blob.type.startsWith('image/')) return null
    return await new Promise((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(typeof r.result === 'string' ? r.result : null)
      r.onerror = () => resolve(null)
      r.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function imageSize(dataUrl: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

const formatOf = (dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' => (dataUrl.startsWith('data:image/png') ? 'PNG' : dataUrl.startsWith('data:image/webp') ? 'WEBP' : 'JPEG')

/** Mengambil banyak foto dengan paralelisme terbatas. */
async function loadPhotos(urls: (string | null | undefined)[], onProgress?: (done: number) => void) {
  const out = new Map<string, { data: string; w: number; h: number }>()
  const unique = [...new Set(urls.filter((u): u is string => !!u))]
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < unique.length) {
      const url = unique[next++]
      const data = await toDataUrl(url)
      const size = data ? await imageSize(data) : null
      if (data && size) out.set(url, { data, ...size })
      onProgress?.(++done)
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, unique.length) }, worker))
  return out
}

export async function exportParticipantCards(
  cards: CardData[],
  ev: CardEvent,
  filename: string,
  opts: { includePhotos?: boolean; onProgress?: (done: number, total: number) => void } = {},
) {
  if (!cards.length) throw new Error('Tidak ada kartu untuk dibuat')
  const [{ default: JsPDF }, { default: QRCode }] = await Promise.all([import('jspdf'), import('qrcode')])
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const total = cards.length

  const logo = await toDataUrl(ev.logoPath ?? '/logo.png')
  const logoSize = logo ? await imageSize(logo) : null
  const photos = opts.includePhotos === false ? new Map() : await loadPhotos(cards.map((c) => c.photoUrl))

  // QR per kartu: membuka halaman masuk dengan kode peserta terisi
  const qrs = await Promise.all(
    cards.map((c) => QRCode.toDataURL(`${ev.loginUrl}?k=${encodeURIComponent(c.code)}`, { margin: 1, width: 360, errorCorrectionLevel: 'M' })),
  )

  const fit = (text: string, width: number, size: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    const lines = doc.splitTextToSize(text, width) as string[]
    return lines
  }
  /** Satu baris yang selalu muat: huruf dikecilkan bertahap (sampai `min`), lalu dipotong dengan "...". */
  const put = (text: string, x: number, y: number, width: number, size: number, o: { bold?: boolean; font?: string; min?: number; align?: 'left' | 'right' | 'center' } = {}) => {
    doc.setFont(o.font ?? 'helvetica', o.bold ? 'bold' : 'normal')
    let sz = size
    doc.setFontSize(sz)
    while (doc.getTextWidth(text) > width && sz > (o.min ?? 5)) { sz -= 0.25; doc.setFontSize(sz) }
    let t = text
    if (doc.getTextWidth(t) > width) {
      while (t.length > 1 && doc.getTextWidth(t + '...') > width) t = t.slice(0, -1)
      t += '...'
    }
    doc.text(t, x, y, o.align ? { align: o.align } : undefined)
  }

  cards.forEach((c, i) => {
    if (i > 0 && i % (COLS * ROWS) === 0) doc.addPage()
    const slot = i % (COLS * ROWS)
    const x = MARGIN_X + (slot % COLS) * (CARD_W + GAP_X)
    const y = MARGIN_Y + Math.floor(slot / COLS) * (CARD_H + GAP_Y)

    // dasar kartu + garis potong tipis
    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(190, 199, 214)
    doc.setLineWidth(0.25)
    doc.setLineDashPattern([1.2, 1.2], 0)
    doc.roundedRect(x, y, CARD_W, CARD_H, 2.5, 2.5, 'FD')
    doc.setLineDashPattern([], 0)

    // kepala navy
    doc.setFillColor(...NAVY)
    doc.roundedRect(x, y, CARD_W, 13.5, 2.5, 2.5, 'F')
    doc.rect(x, y + 7, CARD_W, 6.5, 'F')
    if (logo && logoSize) {
      const lh = 10.5
      const lw = (logoSize.w / logoSize.h) * lh
      doc.addImage(logo, formatOf(logo), x + 2.2, y + 1.5, lw, lh)
    }
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.text('LOMBA RANGKING 1', x + 17, y + 6.2)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.3)
    doc.setTextColor(202, 220, 252)
    put(ev.eventName, x + 17, y + 10.4, 50, 6.3, { min: 5 })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.setTextColor(245, 197, 66)
    doc.text('KARTU PESERTA', x + CARD_W - 3, y + 6.2, { align: 'right' })

    // foto
    const px = x + 3.5
    const py = y + 16.5
    const pw = 19
    const ph = 25
    doc.setFillColor(...SOFT)
    doc.roundedRect(px, py, pw, ph, 1.5, 1.5, 'F')
    const photo = c.photoUrl ? photos.get(c.photoUrl) : undefined
    if (photo) {
      const s = Math.max(pw / photo.w, ph / photo.h)
      const iw = photo.w * s
      const ih = photo.h * s
      doc.saveGraphicsState()
      doc.roundedRect(px, py, pw, ph, 1.5, 1.5, null)
      doc.clip()
      doc.discardPath()
      doc.addImage(photo.data, formatOf(photo.data), px + (pw - iw) / 2, py + (ph - ih) / 2, iw, ih)
      doc.restoreGraphicsState()
    } else {
      const initials = c.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
      doc.setTextColor(...GRAY)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(17)
      doc.text(initials || '?', px + pw / 2, py + ph / 2 + 2.2, { align: 'center' })
    }
    doc.setDrawColor(223, 229, 239)
    doc.setLineWidth(0.2)
    doc.roundedRect(px, py, pw, ph, 1.5, 1.5, 'S')

    // identitas
    const tx = x + 26
    doc.setTextColor(...NAVY)
    const nameLines = fit(c.name, 40, 10.5, true).slice(0, 2)
    nameLines.forEach((l, k) => put(l, tx, y + 19.8 + k * 4.2, 40, 10.5, { bold: true, min: 8 }))
    const infoY = y + 19.8 + nameLines.length * 4.2 + 0.4
    doc.setTextColor(...GRAY)
    put(c.school || '—', tx, infoY, 40, 7, { min: 5.5 })
    put(`No. ${c.number}  ·  ${c.level}  ·  Kec. ${c.district}`, tx, infoY + 3.4, 40, 6.6, { min: 5 })

    // kode + PIN
    const by = y + 34
    doc.setFillColor(...SOFT)
    doc.roundedRect(tx, by, 41, 14.5, 1.8, 1.8, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(5.5)
    doc.setTextColor(...GRAY)
    doc.text('KODE PESERTA', tx + 2.2, by + 3.6)
    doc.text('PIN', tx + 24, by + 3.6)
    doc.setTextColor(...NAVY)
    put(c.code, tx + 2.2, by + 10.6, 19, 12, { bold: true, font: 'courier', min: 7 })
    doc.setTextColor(...ORANGE)
    put(c.pin, tx + 24, by + 10.6, 16, 12, { bold: true, font: 'courier', min: 7 })

    // QR
    const qx = x + CARD_W - 21.5
    const qy = y + 33.5
    doc.addImage(qrs[i], 'PNG', qx, qy, 18, 18)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(5)
    doc.setTextColor(...BLUE)
    doc.text('Pindai untuk masuk', qx + 9, qy + 20.5, { align: 'center' })

    // kaki
    doc.setTextColor(...GRAY)
    put(`Masuk di ${ev.loginUrl.replace(/^https?:\/\//, '')}  ·  Jangan beritahukan PIN kepada siapa pun`, x + 3.5, y + 56.3, CARD_W - 7, 5.3, { min: 4 })
    put(`Penyelenggara: ${ev.organizer}  ·  Produk: ${ev.productOwner}`, x + 3.5, y + 59.6, CARD_W - 7, 5.3, { min: 4 })

    opts.onProgress?.(i + 1, total)
  })

  doc.setProperties({ title: 'Kartu Peserta — Lomba Rangking 1', author: 'Lomba Rangking 1' })
  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
}
