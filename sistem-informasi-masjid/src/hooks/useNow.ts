import { useEffect, useState } from 'react'

/** Waktu sekarang (ms), diperbarui tepat pada pergantian detik. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      setNow(Date.now())
      timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5)
    }
    timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5)
    return () => clearTimeout(timer)
  }, [])
  return now
}
