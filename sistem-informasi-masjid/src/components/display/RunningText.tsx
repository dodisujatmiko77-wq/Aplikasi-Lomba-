import { memo, useLayoutEffect, useRef, useState } from 'react'
import { Megaphone } from 'lucide-react'
import { Star8 } from './Ornament'

/** Teks berjalan tanpa putus; kecepatan dalam piksel per detik (diatur admin). */
export const RunningText = memo(function RunningText({ items, speed }: { items: string[]; speed: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [duration, setDuration] = useState(60)
  const key = items.join('|')

  useLayoutEffect(() => {
    if (ref.current) setDuration(Math.max(8, ref.current.scrollWidth / 2 / Math.max(30, speed)))
  }, [key, speed])

  // Ulangi isi agar selalu lebih panjang dari layar, lalu gandakan untuk putaran mulus.
  const repeat = Math.max(1, Math.ceil(240 / Math.max(20, key.length)))
  const half = Array.from({ length: repeat }, () => items).flat()
  const Half = ({ hidden }: { hidden?: boolean }) => (
    <span className="inline-flex items-center" aria-hidden={hidden}>
      {half.map((t, i) => (
        <span key={i} className="inline-flex items-center">
          <span className="px-8">{t}</span>
          <Star8 className="h-5 w-5 text-tv-accent" />
        </span>
      ))}
    </span>
  )

  return (
    <footer className="flex h-full items-stretch overflow-hidden text-white" style={{ background: 'var(--tv-ticker)' }} data-testid="tv-ticker">
      <div className="z-10 flex shrink-0 items-center gap-3 px-8 font-heading text-tv-sm font-bold tracking-wide" style={{ background: 'var(--tv-hl-bg)', color: 'var(--tv-hl-fg)' }}>
        <Megaphone className="h-[1.2em] w-[1.2em]" />
        INFO
      </div>
      <div className="relative flex flex-1 items-center overflow-hidden text-tv-base font-medium">
        <div ref={ref} className="marquee-track" style={{ animationDuration: `${duration}s` }}>
          <Half />
          <Half hidden />
        </div>
      </div>
    </footer>
  )
})
