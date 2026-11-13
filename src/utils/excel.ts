// Import/export Excel (exceljs dimuat saat dibutuhkan agar bundle awal tetap kecil).
export interface SheetColumn { header: string; key: string; width?: number }
export interface SheetSpec { name: string; columns: SheetColumn[]; rows: Record<string, unknown>[]; note?: string }

function saveBlob(data: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportExcel(filename: string, sheets: SheetSpec[]) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Lomba Rangking 1'
  wb.created = new Date()
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31))
    ws.columns = s.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? Math.max(12, c.header.length + 4) }))
    ws.addRows(s.rows)
    const head = ws.getRow(1)
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1B3F' } }
    head.alignment = { vertical: 'middle' }
    head.height = 22
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    if (s.note) ws.getCell(1, s.columns.length + 2).value = s.note
  }
  const buf = await wb.xlsx.writeBuffer()
  saveBlob(buf, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
}

const cellText = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'object') {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] }
    if (o.richText) return o.richText.map((r) => r.text).join('')
    if (o.text != null) return String(o.text)
    if (o.result != null) return String(o.result)
    if (v instanceof Date) return v.toISOString()
  }
  return String(v)
}

/** Membaca sheet pertama. Kunci objek = judul kolom yang dinormalisasi (huruf kecil, tanpa spasi/tanda baca). */
export async function readExcel(file: File): Promise<Record<string, string>[]> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Ukuran berkas maksimal 5 MB')
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(await file.arrayBuffer())
  } catch {
    throw new Error('Berkas tidak dapat dibaca. Gunakan format .xlsx dari template.')
  }
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('Berkas tidak memiliki sheet')
  const headers: string[] = []
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = cellText(cell.value).toLowerCase().replace(/[^a-z0-9]/g, '')
  })
  const rows: Record<string, string>[] = []
  ws.eachRow((row, n) => {
    if (n === 1) return
    const obj: Record<string, string> = {}
    let filled = false
    headers.forEach((h, col) => {
      if (!h) return
      const t = cellText(row.getCell(col).value).trim()
      if (t) filled = true
      obj[h] = t
    })
    if (filled) rows.push(obj)
  })
  return rows
}
