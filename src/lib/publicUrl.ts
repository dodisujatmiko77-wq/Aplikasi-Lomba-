/** Alamat publik situs (untuk QR, tautan yang dibagikan, dan teks di monitor).
 *  Di aplikasi Android alamat asli WebView adalah https://localhost, jadi dipakai PUBLIC_URL dari /config.js. */
export function publicBaseUrl(): string {
  const cfg = (globalThis as { __LR1_CONFIG__?: { PUBLIC_URL?: string } }).__LR1_CONFIG__
  const u = (cfg?.PUBLIC_URL || '').trim().replace(/\/+$/, '')
  return u || location.origin
}
