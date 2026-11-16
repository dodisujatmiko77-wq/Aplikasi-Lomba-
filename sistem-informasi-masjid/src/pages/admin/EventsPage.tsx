import { CalendarDays } from 'lucide-react'
import { CrudPage } from '@/components/admin/CrudPage'
import { Badge } from '@/components/ui'
import { EVENT_CATEGORIES, WEEKDAY_OPTIONS, labelOf } from '@/lib/constants'
import { fmtDate, fmtTime, isoDate } from '@/lib/format'
import type { FieldDef } from '@/lib/form'
import type { MosqueEvent } from '@/lib/types'

const fields: FieldDef[] = [
  { name: 'name', label: 'Nama kegiatan', type: 'text', required: true, minLength: 3, maxLength: 150, full: true, placeholder: 'Mis. Kajian Tafsir Al-Qur’an' },
  { name: 'category', label: 'Kategori', type: 'select', required: true, options: EVENT_CATEGORIES },
  { name: 'is_routine', label: 'Kegiatan rutin mingguan', type: 'toggle', hint: 'Aktifkan untuk kajian/kegiatan yang berulang tiap pekan' },
  { name: 'weekday', label: 'Hari', type: 'select', numeric: true, required: true, options: WEEKDAY_OPTIONS, showIf: (v) => Boolean(v.is_routine), clearWhenHidden: true },
  { name: 'event_date', label: 'Tanggal', type: 'date', required: true, showIf: (v) => !v.is_routine, clearWhenHidden: true },
  { name: 'start_time', label: 'Jam mulai', type: 'time', required: true },
  { name: 'end_time', label: 'Jam selesai', type: 'time' },
  { name: 'location', label: 'Lokasi', type: 'text', maxLength: 120, placeholder: 'Mis. Ruang utama masjid' },
  { name: 'speaker', label: 'Pemateri', type: 'text', maxLength: 120, placeholder: 'Mis. Ust. …' },
  { name: 'description', label: 'Deskripsi kegiatan', type: 'textarea', maxLength: 1000 },
  { name: 'is_active', label: 'Aktif', type: 'toggle', hint: 'Tampilkan di layar', full: true },
]

const defaults = { name: '', category: 'kajian', is_routine: false, weekday: null, event_date: null, start_time: '', end_time: null, location: '', speaker: '', description: '', is_active: true }

export default function EventsPage() {
  const today = isoDate()
  return (
    <CrudPage<MosqueEvent>
      table="mosque_events" noun="kegiatan" title="Kegiatan Masjid" icon={<CalendarDays />} stampCreator
      subtitle="Jadwal kajian rutin dan agenda kegiatan. Tampil di panel informasi dan slide agenda pada layar TV."
      fields={fields} defaults={defaults} order={[['is_routine', false], ['weekday'], ['event_date', false], ['start_time']]} searchKeys={['name', 'speaker', 'location']}
      validate={(v) => (v.end_time && v.start_time && String(v.end_time) <= String(v.start_time) ? { end_time: 'Jam selesai harus setelah jam mulai' } : {})}
      rowLabel={(r) => r.name}
      columns={[
        { header: 'Kegiatan', render: (r) => (<div className="max-w-sm"><p className="font-medium text-slate-900">{r.name}</p>{r.description && <p className="line-clamp-1 text-xs text-slate-500">{r.description}</p>}</div>) },
        { header: 'Waktu', render: (r) => (
          <div className="whitespace-nowrap">
            <p className="font-medium">{r.is_routine ? `Setiap ${labelOf(WEEKDAY_OPTIONS, r.weekday)}` : fmtDate(r.event_date)}</p>
            <p className="text-xs text-slate-500">{fmtTime(r.start_time)}{r.end_time ? ` – ${fmtTime(r.end_time)}` : ''}</p>
          </div>
        ) },
        { header: 'Pemateri & lokasi', render: (r) => (<div><p>{r.speaker || '-'}</p><p className="text-xs text-slate-500">{r.location}</p></div>) },
        { header: 'Jenis', render: (r) => (
          <div className="flex flex-col items-start gap-1">
            <span>{labelOf(EVENT_CATEGORIES, r.category)}</span>
            {r.is_routine ? <Badge tone="blue">Rutin</Badge> : r.event_date && r.event_date < today ? <Badge tone="amber">Sudah lewat</Badge> : <Badge tone="green">Akan datang</Badge>}
          </div>
        ) },
      ]}
    />
  )
}
