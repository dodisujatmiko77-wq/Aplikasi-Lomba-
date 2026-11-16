// Membuat ikon PWA (PNG) dari public/favicon.svg. Jalankan sekali bila logo aplikasi diganti.
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
import { readFileSync } from 'node:fs'
const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')
const b = await chromium.launch()
for (const s of [192, 512]) {
  const p = await b.newPage({ viewport: { width: s, height: s } })
  await p.setContent(`<body style="margin:0;background:#022c22">${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body>`)
  await p.screenshot({ path: new URL(`../public/pwa-${s}.png`, import.meta.url).pathname })
}
await b.close()
