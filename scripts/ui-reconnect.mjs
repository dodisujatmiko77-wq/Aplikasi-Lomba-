// Uji reconnect di Chromium: koneksi putus saat mengirim jawaban & saat state berubah, lalu pulih.
// Prasyarat: node scripts/dev-api.mjs dan vite (lihat scripts/ui-smoke.mjs).
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = (() => { try { return require('playwright') } catch { return require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright') } })()
const API = 'http://127.0.0.1:54400', WEB = 'http://127.0.0.1:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const demo = await (await fetch(API + '/__demo')).json()
const tok = (await (await fetch(API + '/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: 'admin@demo.local', password: 'rahasia123' }) })).json()).access_token
const rpc = async (fn, args = {}) => { const r = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify(args) }); if (!r.ok) throw new Error(fn + ': ' + await r.text()); return r.json().catch(() => null) }
const rounds = await (await fetch(`${API}/rest/v1/competition_rounds?session_id=eq.${demo.sessionId}&select=id`, { headers: { authorization: 'Bearer ' + tok } })).json()
let pass = 0, fail = 0
const check = (name, ok) => { ok ? pass++ : fail++; console.log(`  ${ok ? '✓' : '✗'} ${name}`) }
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } })
const ph = await ctx.newPage()
await ph.goto(`${WEB}/peserta`)
await ph.fill('input[autocomplete=username]', demo.creds[0].code); await ph.fill('input[type=password]', '123456'); await ph.click('button[type=submit]')
await ph.getByText('Anda sudah masuk').waitFor({ timeout: 8000 }).catch(() => {})
await rpc('open_session', { p_session_id: demo.sessionId }).catch(() => {})
await rpc('start_round', { p_round_id: rounds[0].id })
await rpc('next_question', { p_session_id: demo.sessionId })
await ph.locator('button[aria-pressed]').first().waitFor({ timeout: 10000 })
check('soal tampil di HP setelah operator menayangkan', true)
await ph.locator('button[aria-pressed]').first().click()
await ctx.setOffline(true)
await ph.getByRole('button', { name: /Kirim jawaban/ }).click()
const err = await ph.getByText(/Koneksi terputus/).waitFor({ timeout: 15000 }).then(() => true, () => false)
check('kirim saat offline → pesan "koneksi terputus", jawaban tidak hilang dari layar', err)
await ctx.setOffline(false)
await ph.getByRole('button', { name: /Kirim jawaban/ }).click()
const sent = await ph.getByText('Jawaban terkirim').waitFor({ timeout: 10000 }).then(() => true, () => false)
check('setelah koneksi pulih, kirim ulang berhasil (idempoten)', sent)
await ctx.setOffline(true)
await rpc('close_question', { p_session_id: demo.sessionId })
await rpc('reveal_answer', { p_session_id: demo.sessionId })
await sleep(3500)
await ctx.setOffline(false)
const synced = await ph.getByText(/Benar!|Kurang tepat/).waitFor({ timeout: 12000 }).then(() => true, () => false)
check('state berubah saat offline → tersinkron otomatis setelah online (snapshot)', synced)
const n = (await (await fetch(`${API}/rest/v1/participant_answers?select=id`, { headers: { authorization: 'Bearer ' + tok } })).json()).length
check(`tepat satu jawaban tersimpan di server (${n})`, n === 1)
await browser.close()
console.log(`${pass} lulus, ${fail} gagal`); process.exitCode = fail ? 1 : 0
