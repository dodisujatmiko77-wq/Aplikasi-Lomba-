import { inSchedule } from './format'
import type { Announcement, DisplayBundle, IslamicContent, MosqueEvent, SlideContent, SpecialMode } from './types'

export type Slide =
  | { kind: 'media'; id: string; duration?: number; item: SlideContent }
  | { kind: 'announcement'; id: string; duration?: number; item: Announcement }
  | { kind: 'islamic'; id: string; duration?: number; item: IslamicContent }
  | { kind: 'events' | 'finance' | 'donation' | 'imsakiyah' | 'eid' | 'jumat' | 'welcome'; id: string; duration?: number }

/** Kegiatan terjadwal (bukan rutin) yang belum lewat, terdekat lebih dulu. */
export function upcomingEvents(events: MosqueEvent[], today: string): MosqueEvent[] {
  return events
    .filter((e) => !e.is_routine && e.event_date && e.event_date >= today)
    .sort((a, b) => (a.event_date! + a.start_time).localeCompare(b.event_date! + b.start_time))
}

/** Kegiatan rutin, diurutkan mulai dari hari ini. */
export function routineEvents(events: MosqueEvent[], weekday: number): MosqueEvent[] {
  return events
    .filter((e) => e.is_routine && e.weekday !== null)
    .sort((a, b) => ((a.weekday! - weekday + 7) % 7) - ((b.weekday! - weekday + 7) % 7) || a.start_time.localeCompare(b.start_time))
}

export function tickerItems(b: DisplayBundle, today: string): string[] {
  return b.announcements
    .filter((a) => a.show_in_running_text && inSchedule(a, today))
    .map((a) => (a.content.trim() ? `${a.title.trim()} — ${a.content.trim().replace(/\s+/g, ' ')}` : a.title.trim()))
}

/** Menyusun urutan slide dari seluruh sumber konten, sesuai sakelar di Pengaturan Display. */
export function buildSlides(b: DisplayBundle, ctx: { today: string; mode: SpecialMode; isFriday: boolean }): Slide[] {
  const s = b.settings
  const base: Slide[] = []
  if (ctx.mode === 'idulfitri' || ctx.mode === 'iduladha') base.push({ kind: 'eid', id: 'eid' })
  if (ctx.isFriday && s.friday_mode_enabled) base.push({ kind: 'jumat', id: 'jumat' })
  for (const item of b.slides) {
    if (inSchedule(item, ctx.today)) base.push({ kind: 'media', id: item.id, duration: item.duration_seconds ?? undefined, item })
  }
  if (s.show_slide_announcements) {
    for (const item of b.announcements) {
      if (item.show_on_slide && inSchedule(item, ctx.today)) base.push({ kind: 'announcement', id: item.id, item })
    }
  }
  if (ctx.mode === 'ramadan') base.push({ kind: 'imsakiyah', id: 'imsakiyah' })
  if (s.show_slide_events && (upcomingEvents(b.events, ctx.today).length || b.events.some((e) => e.is_routine))) base.push({ kind: 'events', id: 'events' })
  if (s.show_slide_finance && b.finance) base.push({ kind: 'finance', id: 'finance' })
  if (s.show_slide_donation && b.accounts.length) base.push({ kind: 'donation', id: 'donation' })

  const islamic: Slide[] = s.show_slide_islamic ? b.islamic.map((item) => ({ kind: 'islamic', id: item.id, item })) : []
  if (!base.length) return islamic.length ? islamic : [{ kind: 'welcome', id: 'welcome' }]
  if (!islamic.length) return base

  // Sisipkan satu ayat/hadis setiap dua slide informasi, bergiliran sampai semuanya tampil.
  const out: Slide[] = []
  let q = 0
  for (let r = 0; r === 0 || (q < islamic.length && r < 60); r++) {
    base.forEach((sl, i) => {
      out.push(r > 0 ? { ...sl, id: `${sl.id}#${r}` } : sl)
      if (i % 2 === 1 || i === base.length - 1) {
        if (q < islamic.length) out.push(islamic[q++])
      }
    })
  }
  return out
}
