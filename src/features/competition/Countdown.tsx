import { computeCountdown, useServerNow } from '@/hooks/useServerClock'
import { cn } from '@/lib/utils'

/** Countdown berbasis jam server. Hanya tampilan; validasi deadline dilakukan server. */
export function useQuestionCountdown(q: { started_at: string; deadline_at: string; paused_at?: string | null } | null | undefined, enabled = true) {
  const now = useServerNow(100, enabled && !!q)
  if (!q) return null
  return computeCountdown(now, q.started_at, q.deadline_at, q.paused_at)
}

export function TimerBar({ fraction, className }: { fraction: number; className?: string }) {
  const tone = fraction > 0.5 ? 'bg-emerald-500' : fraction > 0.25 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className={cn('h-3 w-full overflow-hidden rounded-full bg-black/10', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-100 ease-linear', tone)} style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }} />
    </div>
  )
}
