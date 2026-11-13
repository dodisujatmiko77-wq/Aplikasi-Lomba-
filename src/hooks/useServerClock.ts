// Jam server: sumber waktu utama untuk countdown.
// Setiap snapshot RPC membawa `server_now`; selisih terhadap jam perangkat disimpan di sini.
import { useEffect, useState } from 'react'

let offsetMs = 0
let bestRtt = Number.POSITIVE_INFINITY
let samples = 0

/** Dipanggil setiap kali snapshot diterima. Sampel dengan latensi terkecil paling dipercaya. */
export function syncServerClock(serverNowIso: string, requestStartedAt: number, responseReceivedAt: number) {
  const rtt = Math.max(0, responseReceivedAt - requestStartedAt)
  const candidate = Date.parse(serverNowIso) - (requestStartedAt + rtt / 2)
  if (Number.isNaN(candidate)) return
  samples++
  if (rtt <= bestRtt || samples % 20 === 0) {
    bestRtt = samples % 20 === 0 ? rtt : Math.min(bestRtt, rtt)
    offsetMs = candidate
  } else {
    // sampel lambat hanya menggeser sedikit agar tidak melompat
    offsetMs += (candidate - offsetMs) * 0.1
  }
}

export const serverNow = () => Date.now() + offsetMs

/** Mengembalikan waktu server dan me-render ulang setiap `intervalMs` (hanya untuk tampilan). */
export function useServerNow(intervalMs = 100, enabled = true) {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    if (!enabled) return
    setNow(serverNow())
    const id = window.setInterval(() => setNow(serverNow()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs, enabled])
  return now
}

export interface Countdown {
  phase: 'lead' | 'running' | 'over'
  /** ms menuju mulai (fase lead) atau menuju deadline (fase running) */
  remainingMs: number
  /** 1 → 0 sepanjang durasi soal */
  fraction: number
  seconds: number
}

export function computeCountdown(now: number, startedAt: string, deadlineAt: string, pausedAt?: string | null): Countdown {
  const start = Date.parse(startedAt)
  const end = Date.parse(deadlineAt)
  const t = pausedAt ? Date.parse(pausedAt) : now
  if (t < start) return { phase: 'lead', remainingMs: start - t, fraction: 1, seconds: Math.ceil((start - t) / 1000) }
  if (t >= end) return { phase: 'over', remainingMs: 0, fraction: 0, seconds: 0 }
  return { phase: 'running', remainingMs: end - t, fraction: (end - t) / (end - start), seconds: Math.ceil((end - t) / 1000) }
}
