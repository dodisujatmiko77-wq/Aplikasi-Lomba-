// Sinkronisasi state lomba untuk monitor, peserta, dan panel operator.
//
// Pola: Realtime Broadcast hanya membawa SINYAL; state resmi selalu diambil ulang lewat RPC (snapshot).
//  - tersambung  → refresh saat ada sinyal + polling lambat sebagai jaring pengaman
//  - terputus    → polling cepat; supabase-js menyambung & berlangganan ulang otomatis,
//                  dan snapshot diambil lagi begitu status kembali SUBSCRIBED
//  - refresh dijadwalkan tepat saat soal mulai tampil dan sesaat setelah deadline
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { serverNow, syncServerClock } from './useServerClock'

export type LinkStatus = 'connecting' | 'live' | 'polling' | 'offline'

interface Snapshot {
  server_now?: string
  ok?: boolean
  session?: { code: string; status: string } | null
  question?: { id: string; status: string; deadline_at: string } | null
  upcoming?: { starts_at: string } | null
  counts?: { answered: number }
}

interface Options<T> {
  fetcher: () => Promise<T>
  /** kode sesi untuk kanal realtime; bila belum diketahui diambil dari snapshot */
  code?: string | null
  enabled?: boolean
  /** sebar permintaan (ms) agar ratusan HP tidak memanggil server pada milidetik yang sama */
  jitterMs?: number
  fastPollMs?: number
  slowPollMs?: number
}

export function useLiveState<T extends Snapshot>({ fetcher, code, enabled = true, jitterMs = 0, fastPollMs = 2500, slowPollMs = 15000 }: Options<T>) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<LinkStatus>('connecting')
  const [answered, setAnswered] = useState(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const seq = useRef(0)
  const applied = useRef(0)
  const inFlight = useRef(false)
  const queued = useRef(false)
  const debounce = useRef<number>()

  const refresh = useCallback(async () => {
    if (inFlight.current) {
      queued.current = true
      return
    }
    inFlight.current = true
    const mySeq = ++seq.current
    const t0 = Date.now()
    try {
      const snap = await fetcherRef.current()
      const t1 = Date.now()
      if (snap?.server_now) syncServerClock(snap.server_now, t0, t1)
      if (mySeq > applied.current) {
        applied.current = mySeq
        setData(snap)
        setAnswered(snap?.counts?.answered ?? 0)
        setError(null)
      }
      setLink((s) => (s === 'offline' ? 'polling' : s))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data')
      setLink((s) => (s === 'live' ? s : 'offline'))
    } finally {
      inFlight.current = false
      if (queued.current) {
        queued.current = false
        void refresh()
      }
    }
  }, [])

  const refreshSoon = useCallback(
    (extraDelay = 0) => {
      window.clearTimeout(debounce.current)
      debounce.current = window.setTimeout(() => void refresh(), extraDelay + Math.random() * jitterMs)
    },
    [refresh, jitterMs],
  )

  // snapshot awal
  useEffect(() => {
    if (enabled) void refresh()
  }, [enabled, refresh])

  // kanal realtime
  const topicCode = code ?? data?.session?.code ?? null
  useEffect(() => {
    if (!enabled || !topicCode) return
    const channel = supabase
      .channel(`live:${topicCode}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'state' }, () => refreshSoon())
      .on('broadcast', { event: 'progress' }, ({ payload }) => {
        const n = Number((payload as { answered?: number })?.answered ?? 0)
        setAnswered((prev) => Math.max(prev, n))
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setLink('live')
          void refresh() // snapshot setelah (re)connect
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setLink((s) => (s === 'offline' ? s : 'polling'))
        }
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [enabled, topicCode, refresh, refreshSoon])

  // polling pengaman
  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => void refresh(), link === 'live' ? slowPollMs : fastPollMs)
    return () => window.clearInterval(id)
  }, [enabled, link, refresh, fastPollMs, slowPollMs])

  // jaringan & tab kembali aktif
  useEffect(() => {
    if (!enabled) return
    const onWake = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const onOffline = () => setLink('offline')
    window.addEventListener('online', onWake)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onWake)
    return () => {
      window.removeEventListener('online', onWake)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onWake)
    }
  }, [enabled, refresh])

  // refresh terjadwal: saat soal mulai tampil & sesaat setelah deadline (memicu penutupan otomatis di server)
  const startsAt = data?.upcoming?.starts_at ?? null
  const deadlineAt = data?.question?.status === 'active' ? data.question.deadline_at : null
  const sessionStatus = data?.session?.status
  useEffect(() => {
    if (!enabled || sessionStatus !== 'running') return
    const timers: number[] = []
    if (startsAt) timers.push(window.setTimeout(() => void refresh(), Math.max(0, Date.parse(startsAt) - serverNow()) + 40))
    if (deadlineAt) {
      const wait = Math.max(0, Date.parse(deadlineAt) - serverNow()) + 380 + Math.random() * Math.max(150, jitterMs)
      timers.push(window.setTimeout(() => void refresh(), wait))
      timers.push(window.setTimeout(() => void refresh(), wait + 1500))
    }
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [enabled, startsAt, deadlineAt, sessionStatus, refresh, jitterMs])

  return { data, error, link, answered, refresh }
}
