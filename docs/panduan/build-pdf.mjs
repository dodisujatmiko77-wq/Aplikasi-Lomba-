// Membuat PDF buku panduan dari buku-panduan.html, lengkap dengan nomor halaman pada daftar isi.
//   node docs/panduan/build-pdf.mjs      (butuh Playwright/Chromium dan pdftotext)
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = (() => { try { return require('playwright') } catch { return require(process.env.PLAYWRIGHT_PATH || '/usr/lib/node_modules/playwright') } })()
const dir = path.dirname(new URL(import.meta.url).pathname)
const src = path.join(dir, 'buku-panduan.html'), out = path.join(dir, 'Buku-Panduan-Lomba-Rangking-1.pdf'), tmp = path.join(dir, '.render.html')
const html = fs.readFileSync(src, 'utf8')
const clean = (t) => t.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

// judul bagian: h1 (Pengantar/Lampiran/Bagian …) dan h2 (A1…, L1…)
const tocStart = html.indexOf('<section class="toc'), tocEnd = html.indexOf('</section>', tocStart)
const tocHtml = html.slice(tocStart, tocEnd)

async function render(h) {
  fs.writeFileSync(tmp, h)
  const b = await chromium.launch(); const p = await b.newPage()
  await p.goto('file://' + tmp); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500)
  await p.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
    headerTemplate: '<span></span>', margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' },
    footerTemplate: '<div style="width:100%;font-size:8px;color:#5b6577;text-align:center;font-family:Arial">Buku Panduan Lomba Rangking 1 · hal. <span class="pageNumber"></span></div>' })
  await b.close()
}
const toc = (pages) => {
  let t = tocHtml
  // setiap <li>Judul</li> / <li><a>Judul</a> diberi nomor halaman
  t = t.replace(/<li>(<a [^>]*>)?([^<]+)(<\/a>)?(?=<(?:ol|\/li)>|$)/g, (m, a1, title, a2) => {
    const pg = pages[clean(title)]
    return `<li><span>${a1 ?? ''}${title}${a2 ?? ''}</span><span class="pg">${pg ?? ''}</span>`
  })
  return html.slice(0, tocStart) + t + html.slice(tocEnd)
}
// kumpulan judul yang dicari
const titles = [...tocHtml.matchAll(/<li>(?:<a [^>]*>)?([^<]+)(?:<\/a>)?(?=<(?:ol|\/li)>)/g)].map((m) => clean(m[1]))
await render(toc({}))
const n = +execSync(`pdfinfo "${out}"`).toString().match(/Pages:\s+(\d+)/)[1]
const pages = {}
const tocPage = 2
for (let i = tocPage + 1; i <= n; i++) {
  const text = execSync(`pdftotext -f ${i} -l ${i} -layout "${out}" -`).toString().split('\n').map((l) => l.trim().replace(/\s+/g, ' '))
  for (const t of titles) if (!(t in pages) && text.some((l) => l === t || l.startsWith(t))) pages[t] = i
}
const miss = titles.filter((t) => !(t in pages))
if (miss.length) console.warn('Judul tidak ditemukan:', miss)
await render(toc(pages))
fs.unlinkSync(tmp)
console.log('halaman:', n)
