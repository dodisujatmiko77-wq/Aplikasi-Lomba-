import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { DisplayConfigError, fetchBundle, fetchDataVersion, readCachedBundle, sendHeartbeat } from '@/lib/displayData'
import type { DisplayBundle } from '@/lib/types'

export type SyncStatus = 'loading' | 'live' | 'polling' | 'offline'

/**
 * Sumber data layar TV:
 *  1. tampilkan data tersimpan (offline) seketika,
 *  2. muat data terbaru dari Supabase,
 *  3. realtime: muat ulang saat display_settings.data_version berubah,
 *  4. cadangan: periksa data_version berkala (auto refresh) + muat ulang penuh tiap 10 menit,
 *  5. heartbeat perangkat tiap menit.
 */
export function useDisplayData(code: string | null) {
  const [bundle, setBundle] = useState<DisplayBundle | null>(() => readCachedBundle(code))
  const [status, setStatus] = useState<SyncStatus>('loading')
  const [fatal, setFatal] = useState<string | null>(null)
  const realtimeOk = useRef(false)
  const loading = useRef(false)
  const queued = useRef(false)
  const bundleRef = useRef(bundle)
  bundleRef.current = bundle

  const load = useCallback(async () => {
    if (loading.current) {
      queued.current = true
      return
    }
    loading.current = true
    try {
      const b = await fetchBundle(code)
      setBundle(b)
      setFatal(null)
      setStatus(realtimeOk.current ? 'live' : 'polling')
    } catch (e) {
      if (e instanceof DisplayConfigError) {
        setFatal(e.message)
      } else {
        setStatus('offline') // jaringan/server bermasalah → tetap tampilkan data terakhir
      }
    } finally {
      loading.current = false
      if (queued.current) {
        queued.current = false
        void load()
      }
    }
  }, [code])

  // muat awal + saat koneksi kembali / tab aktif lagi
  useEffect(() => {
    void load()
    const again = () => void load()
    const vis = () => document.visibilityState === 'visible' && void load()
    const off = () => setStatus('offline')
    window.addEventListener('online', again)
    window.addEventListener('offline', off)
    document.addEventListener('visibilitychange', vis)
    return () => {
      window.removeEventListener('online', again)
      window.removeEventListener('offline', off)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [load])

  const mosqueId = bundle?.mosque.id ?? null
  const interval = Math.max(10, bundle?.settings.refresh_interval ?? 30)

  // realtime
  useEffect(() => {
    if (!mosqueId) return
    let debounce: ReturnType<typeof setTimeout>
    const channel = supabase
      .channel(`display-${mosqueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'display_settings', filter: `mosque_id=eq.${mosqueId}` }, () => {
        clearTimeout(debounce)
        debounce = setTimeout(() => void load(), 400)
      })
      .subscribe((s) => {
        realtimeOk.current = s === 'SUBSCRIBED'
        setStatus((prev) => (prev === 'offline' || prev === 'loading' ? prev : realtimeOk.current ? 'live' : 'polling'))
      })
    return () => {
      clearTimeout(debounce)
      realtimeOk.current = false
      void supabase.removeChannel(channel)
    }
  }, [mosqueId, load])

  // auto refresh: periksa versi data
  useEffect(() => {
    if (!mosqueId) return
    let lastFull = Date.now()
    const t = setInterval(async () => {
      try {
        const v = await fetchDataVersion(mosqueId)
        const stale = Date.now() - lastFull > 600_000
        if (v !== bundleRef.current?.settings.data_version || stale) {
          lastFull = Date.now()
          await load()
        } else {
          setStatus(realtimeOk.current ? 'live' : 'polling')
        }
      } catch {
        setStatus('offline')
      }
    }, interval * 1000)
    return () => clearInterval(t)
  }, [mosqueId, interval, load])

  // heartbeat perangkat
  useEffect(() => {
    if (!code) return
    const t = setInterval(() => void sendHeartbeat(code).catch(() => {}), 60_000)
    return () => clearInterval(t)
  }, [code])

  return { bundle, status, fatal, reload: load }
}
