import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Slide } from '@/lib/slides'
import { SlideView, type SlideContext } from './SlideViews'

/** Slideshow otomatis. Durasi per slide mengikuti konten (bila diatur) atau durasi umum. */
export const Slideshow = memo(function Slideshow({ slides, ctx, defaultDuration }: { slides: Slide[]; ctx: SlideContext; defaultDuration: number }) {
  const [index, setIndex] = useState(0)
  const currentId = useRef<string | null>(null)

  // Saat daftar berubah (admin mengedit), tetap di slide yang sama bila masih ada.
  const ids = slides.map((s) => s.id).join(',')
  useEffect(() => {
    const keep = slides.findIndex((s) => s.id === currentId.current)
    setIndex(keep >= 0 ? keep : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])

  const slide = slides[Math.min(index, slides.length - 1)]
  currentId.current = slide?.id ?? null
  const next = useCallback(() => setIndex((i) => (slides.length ? (i + 1) % slides.length : 0)), [slides.length])

  const isVideo = slide?.kind === 'media' && slide.item.media_type === 'video'
  const seconds = slide?.duration ?? (isVideo ? 600 : defaultDuration) // video: lanjut saat selesai (maks. 10 menit)
  useEffect(() => {
    if (!slide || slides.length < 2) return
    const t = setTimeout(next, seconds * 1000)
    return () => clearTimeout(t)
  }, [slide?.id, seconds, slides.length, next]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!slide) return null
  return (
    <section className="tv-card relative h-full overflow-hidden shadow-soft" data-testid="tv-slideshow" data-slide-kind={slide.kind}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={slide.id} className="absolute inset-0"
          initial={{ opacity: 0, scale: 1.015 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }}>
          <SlideView slide={slide} ctx={ctx} onDone={next} />
        </motion.div>
      </AnimatePresence>
      {slides.length > 1 && slides.length <= 24 && (
        <div className="absolute right-8 top-7 flex gap-2">
          {slides.map((s, i) => (
            <span key={s.id} className="h-2 rounded-full transition-all duration-500" style={{ width: i === index ? 32 : 8, background: i === index ? 'var(--tv-accent)' : 'var(--tv-line)' }} />
          ))}
        </div>
      )}
    </section>
  )
})
