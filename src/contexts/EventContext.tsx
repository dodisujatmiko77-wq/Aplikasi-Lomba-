// Event aktif yang sedang dikelola + data master yang dipakai lintas modul.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { list } from '@/services/db'
import type { District, EducationLevel, EventRow } from '@/types'

interface EventValue {
  events: EventRow[]
  loading: boolean
  event: EventRow | null
  eventId: string | null
  setEventId: (id: string) => void
}

const Ctx = createContext<EventValue | null>(null)
const KEY = 'lr1.admin.event'

export function EventProvider({ children }: { children: ReactNode }) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events'],
    queryFn: () => list<EventRow>('events', { order: [{ column: 'created_at', ascending: false }] }),
  })
  const [eventId, setEventIdState] = useState<string | null>(() => localStorage.getItem(KEY))
  useEffect(() => {
    if (!events.length) return
    if (!eventId || !events.some((e) => e.id === eventId)) setEventIdState(events[0].id)
  }, [events, eventId])

  const value = useMemo<EventValue>(() => ({
    events,
    loading: isLoading,
    event: events.find((e) => e.id === eventId) ?? null,
    eventId: events.some((e) => e.id === eventId) ? eventId : null,
    setEventId: (id) => {
      localStorage.setItem(KEY, id)
      setEventIdState(id)
    },
  }), [events, isLoading, eventId])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useEvent() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('EventProvider belum dipasang')
  return ctx
}

export function useDistricts() {
  const q = useQuery({ queryKey: ['districts'], queryFn: () => list<District>('districts', { order: [{ column: 'sort_order' }, { column: 'name' }] }), staleTime: 60_000 })
  const map = useMemo(() => new Map((q.data ?? []).map((d) => [d.id, d])), [q.data])
  return { districts: q.data ?? [], districtMap: map, ...q }
}

export function useLevels() {
  const q = useQuery({ queryKey: ['education_levels'], queryFn: () => list<EducationLevel>('education_levels', { order: [{ column: 'sort_order' }] }), staleTime: 60_000 })
  const map = useMemo(() => new Map((q.data ?? []).map((d) => [d.id, d])), [q.data])
  return { levels: q.data ?? [], levelMap: map, ...q }
}
