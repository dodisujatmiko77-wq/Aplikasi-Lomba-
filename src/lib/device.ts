// Identitas perangkat peserta. Dibuat sekali lalu disimpan di penyimpanan lokal; dikirim saat login
// agar server dapat mengunci satu akun peserta ke satu perangkat saja.
const KEY = 'lr1_device_id'
let memo: string | null = null

function random(): string {
  const a = new Uint8Array(24)
  try { crypto.getRandomValues(a) } catch { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256) }
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function deviceId(): string {
  if (memo) return memo
  try {
    let v = localStorage.getItem(KEY)
    if (!v || !/^[A-Za-z0-9_-]{16,100}$/.test(v)) { v = random(); localStorage.setItem(KEY, v) }
    memo = v
  } catch { memo = random() }
  return memo
}

/** Label singkat agar panitia mengenali perangkat (mis. "Android · Chrome · aplikasi"). */
export function deviceLabel(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Perangkat'
  const native = typeof window !== 'undefined' && !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
  const app = native ? 'Aplikasi' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox/i.test(ua) ? 'Firefox' : /Chrome/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : 'Browser'
  const model = ua.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build|[;)])/)?.[1]?.trim()
  return [os, model && model !== 'K' ? model : null, app].filter(Boolean).join(' · ')
}
