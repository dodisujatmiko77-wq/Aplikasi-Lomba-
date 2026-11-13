import { useCallback, useState } from 'react'
import { toast } from 'sonner'

/** Menjalankan aksi async dengan indikator sibuk dan notifikasi sukses/gagal. Mengembalikan true bila berhasil. */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null)
  const run = useCallback(async (fn: () => Promise<unknown>, success?: string, key = 'default'): Promise<boolean> => {
    setBusy(key)
    try {
      await fn()
      if (success) toast.success(success)
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Terjadi kesalahan')
      return false
    } finally {
      setBusy(null)
    }
  }, [])
  return { busy: busy !== null, busyKey: busy, run }
}
