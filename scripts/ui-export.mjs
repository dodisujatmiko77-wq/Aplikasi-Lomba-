// Uji ekspor/impor di Chromium: Excel peserta (export + import hasil edit), Excel hasil, PDF hasil, PDF sertifikat.
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
const { chromium } = (() => { try { return require('playwright') } catch { return require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright') } })()
const ExcelJS = require('exceljs')
const API = 'http://127.0.0.1:54400', WEB = 'http://127.0.0.1:5173', OUT = '/tmp/lr1-dl'
mkdirSync(OUT, { recursive: true })
const demo = await (await fetch(API + '/__demo')).json()
let pass = 0, fail = 0
const check = (n, ok, extra = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`) }
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.goto(WEB + '/login'); await p.fill('input[type=email]', 'admin@demo.local'); await p.fill('input[type=password]', 'rahasia123'); await p.click('button[type=submit]'); await p.waitForURL('**/admin')
const dl = async (action, name) => { const [d] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), action()]); const path = `${OUT}/${name}`; await d.saveAs(path); return [path, d.suggestedFilename()] }

await p.goto(WEB + '/admin/participants'); await p.getByText('Peserta SD-1').first().waitFor()
const [xl, xlName] = await dl(() => p.getByRole('button', { name: /Export/ }).click(), 'peserta.xlsx')
let wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(xl)
check('export Excel peserta: 135 baris data + judul kolom', wb.worksheets[0].rowCount === 136 && String(wb.worksheets[0].getCell('C1').value) === 'Nama Lengkap', `${xlName}, ${wb.worksheets[0].rowCount - 1} baris`)

// impor: 3 baris valid + 1 kecamatan salah
const imp = new ExcelJS.Workbook(); const ws = imp.addWorksheet('Peserta')
ws.addRow(['No Peserta', 'Nama Lengkap', 'Asal Sekolah', 'Jenjang', 'Kecamatan', 'PIN'])
ws.addRow(['IMP-1', 'Budi Impor', 'SDN 1 Banjit', 'SD', 'Banjit', '']); ws.addRow(['IMP-2', 'Sari Impor', 'SMAN 1 Kasui', 'SMA', 'Kasui', '654321'])
ws.addRow(['IMP-3', 'Dewi Impor', 'SMPN 2 Umpu', 'SMP', 'umpu semenguk', '']); ws.addRow(['IMP-4', 'Salah Wilayah', 'X', 'SMP', 'Atlantis', ''])
await imp.xlsx.writeFile(`${OUT}/impor.xlsx`)
await p.setInputFiles('input[type=file][accept=".xlsx"]', `${OUT}/impor.xlsx`)
await p.getByText('Hasil import').waitFor({ timeout: 15000 })
const txt = await p.locator('[role=dialog]').innerText()
check('import Excel: 3 berhasil, 1 gagal dengan alasan jelas', /3 baris berhasil/.test(txt) && /1 gagal/.test(txt) && /Kecamatan tidak dikenal: Atlantis/.test(txt), txt.split('\n').find((l) => /baris berhasil/.test(l)))
check('import Excel: PIN baru dibuat otomatis untuk baris tanpa PIN (2 PIN baru + 1 PIN eksplisit)', /3 PIN baru/.test(txt))
const [kx] = await dl(() => p.getByRole('button', { name: /Unduh kode & PIN/ }).click(), 'kredensial.xlsx')
wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(kx)
const rows = []; wb.worksheets[0].eachRow((r, n) => { if (n > 1) rows.push([r.getCell(3).value, String(r.getCell(4).value)]) })
check('unduh kode & PIN: 3 baris, PIN 6 digit, PIN eksplisit tetap 654321', rows.length === 3 && rows.every(([c, pin]) => /^R/.test(String(c)) && /^\d{6}$/.test(pin)) && rows.some(([, pin]) => pin === '654321'))
await p.keyboard.press('Escape')

await p.goto(WEB + `/admin/results?session=${demo.sessionId}`); await p.getByText('Peserta SMP-1').first().waitFor()
const [rx] = await dl(() => p.getByRole('button', { name: 'Excel' }).click(), 'hasil.xlsx')
wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(rx)
check('export Excel hasil: peringkat terurut & lengkap', wb.worksheets[0].rowCount === 46 && wb.worksheets[0].getCell('A2').value === 1)
const [rp, rpName] = await dl(() => p.getByRole('button', { name: 'PDF' }).click(), 'hasil.pdf')
const fs = await import('node:fs'); const head = fs.readFileSync(rp).subarray(0, 5).toString()
check('export PDF hasil valid', head === '%PDF-' && fs.statSync(rp).size > 3000, rpName)

await p.goto(WEB + '/admin/reports'); await p.getByText('Sertifikat').first().waitFor(); await new Promise((r) => setTimeout(r, 1500))
const [cp] = await dl(() => p.getByRole('button', { name: /Piagam juara 1–3/ }).click(), 'piagam.pdf')
check('sertifikat PDF (piagam juara) terbentuk', fs.readFileSync(cp).subarray(0, 5).toString() === '%PDF-' && fs.statSync(cp).size > 5000)
const [hx] = await dl(() => p.getByRole('button', { name: 'Excel' }).nth(2).click(), 'riwayat.xlsx')
wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(hx)
check('export Excel riwayat jawaban per soal', wb.worksheets[0].rowCount > 1 && String(wb.worksheets[0].getCell('J1').value).includes('Waktu Respons'), `${wb.worksheets[0].rowCount - 1} jawaban`)
check('tanpa error halaman', errs.length === 0, errs[0] ?? '')
await b.close()
console.log(`${pass} lulus, ${fail} gagal`); process.exitCode = fail ? 1 : 0
