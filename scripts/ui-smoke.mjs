// Uji asap UI di Chromium nyata: menggerakkan sesi demo lewat RPC dan memotret monitor & HP peserta.
// Prasyarat: node scripts/dev-api.mjs  dan  VITE_SUPABASE_URL=http://127.0.0.1:54400 VITE_SUPABASE_ANON_KEY=dev npx vite
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
const { chromium } = (() => { try { return require('playwright') } catch { return require(process.env.PLAYWRIGHT_PATH || '/usr/lib/node_modules/playwright') } })()
const API = 'http://127.0.0.1:54400', WEB = 'http://127.0.0.1:5173'
const OUT = process.env.SHOTS || '/tmp/lr1-shots'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const demo = await (await fetch(API + '/__demo')).json()
const tok = (await (await fetch(API + '/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: 'admin@demo.local', password: 'rahasia123' }) })).json()).access_token
const rpc = async (fn, args = {}) => {
  const r = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify(args) })
  if (!r.ok) throw new Error(fn + ': ' + (await r.text()))
  return r.json().catch(() => null)
}
const sql = async (path, opts = {}) => (await fetch(`${API}/rest/v1/${path}`, { ...opts, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok, prefer: 'return=representation', ...(opts.headers || {}) } })).json()
const sid = demo.sessionId, code = demo.sessionCode
const errors = []
const browser = await chromium.launch()
const tv = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage()
tv.on('pageerror', (e) => errors.push('tv: ' + e.message))
await tv.goto(`${WEB}/live/${code}`)
const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const ph = await phoneCtx.newPage()
ph.on('pageerror', (e) => errors.push('hp: ' + e.message))
await ph.goto(`${WEB}/peserta`)
await ph.screenshot({ path: `${OUT}/01-hp-login.png` })
await ph.fill('input[autocomplete=username]', demo.creds[0].code)
await ph.fill('input[type=password]', '123456')
await ph.click('button[type=submit]')
await sleep(1500)
await ph.screenshot({ path: `${OUT}/02-hp-menunggu.png` })

await rpc('open_session', { p_session_id: sid })
await sleep(2500)
await tv.screenshot({ path: `${OUT}/10-tv-waiting.png` })
const rounds = await sql(`competition_rounds?session_id=eq.${sid}&select=id`)
await rpc('start_round', { p_round_id: rounds[0].id })
await rpc('next_question', { p_session_id: sid })
await sleep(1400)
await tv.screenshot({ path: `${OUT}/11-tv-countdown.png` })
await ph.screenshot({ path: `${OUT}/03-hp-countdown.png` })
await sleep(3200)
await tv.screenshot({ path: `${OUT}/12-tv-question.png` })
// peserta menjawab lewat UI
await ph.locator('button[aria-pressed]').first().click()
await ph.screenshot({ path: `${OUT}/04-hp-soal.png` })
await ph.getByRole('button', { name: /Kirim jawaban/ }).click()
await sleep(1200)
await ph.screenshot({ path: `${OUT}/05-hp-terkirim.png` })
// 20 peserta lain menjawab lewat RPC (anon) agar leaderboard terisi
const q = await sql(`competition_questions?id=eq.${(await rpc('admin_get_control_state', { p_session_id: sid })).current.id}&select=id`)
const cq = q[0].id
await Promise.all(demo.creds.slice(1, 21).map(async (c, i) => {
  const lg = await (await fetch(`${API}/rest/v1/rpc/participant_login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p_code: c.code, p_pin: c.pin }) })).json()
  const st = await (await fetch(`${API}/rest/v1/rpc/participant_get_state`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p_token: lg.token }) })).json()
  await sleep(i * 150)
  await fetch(`${API}/rest/v1/rpc/submit_answer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p_token: lg.token, p_competition_question_id: cq, p_option_id: st.question.options[i % 4].id, p_answer_text: null, p_idempotency_key: crypto.randomUUID() }) })
}))
await tv.screenshot({ path: `${OUT}/13-tv-question-jawaban.png` })
await rpc('close_question', { p_session_id: sid })
await sleep(2200)
await tv.screenshot({ path: `${OUT}/14-tv-processing.png` })
await rpc('reveal_answer', { p_session_id: sid })
await sleep(2800)
await tv.screenshot({ path: `${OUT}/15-tv-result.png` })
await ph.screenshot({ path: `${OUT}/06-hp-hasil.png` })
await rpc('set_display', { p_session_id: sid, p_screen: 'leaderboard' })
await sleep(2800)
await tv.screenshot({ path: `${OUT}/16-tv-leaderboard.png` })
await rpc('end_round', { p_session_id: sid })
await rpc('announce_winners', { p_session_id: sid, p_force: true })
await sleep(5500)
await tv.screenshot({ path: `${OUT}/17-tv-podium.png` })
await ph.screenshot({ path: `${OUT}/07-hp-selesai.png` })
// admin
const adm = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
adm.on('pageerror', (e) => errors.push('admin: ' + e.message))
await adm.goto(`${WEB}/login`)
await adm.fill('input[type=email]', 'admin@demo.local'); await adm.fill('input[type=password]', 'rahasia123'); await adm.click('button[type=submit]')
await adm.waitForURL('**/admin', { timeout: 15000 })
for (const [name, path] of [['dashboard', ''], ['peserta', '/participants'], ['soal', '/questions'], ['sesi', '/sessions'], ['setup', `/sessions/${sid}`], ['kontrol', `/control/${sid}`], ['hasil-publik', null]]) {
  if (path === null) { await adm.goto(`${WEB}/hasil/${code}`) } else { await adm.goto(`${WEB}/admin${path}`) }
  await sleep(1800)
  await adm.screenshot({ path: `${OUT}/20-admin-${name}.png` })
}
await adm.goto(`${WEB}/`); await sleep(1500); await adm.screenshot({ path: `${OUT}/21-landing.png`, fullPage: true })
await browser.close()
console.log(errors.length ? 'ERROR HALAMAN:\n' + errors.join('\n') : 'Tidak ada error halaman. Screenshot di ' + OUT)
