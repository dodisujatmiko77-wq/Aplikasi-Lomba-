import { useCallback, useEffect, useState } from 'react'

export function useFullscreen() {
  const [active, setActive] = useState(() => !!document.fullscreenElement)
  useEffect(() => {
    const on = () => setActive(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  const enter = useCallback(() => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {})
  }, [])
  const exit = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  }, [])
  const toggle = useCallback(() => (document.fullscreenElement ? exit() : enter()), [enter, exit])
  return { active, enter, exit, toggle, supported: !!document.documentElement.requestFullscreen }
}
