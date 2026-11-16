import { Megaphone } from 'lucide-react'
import { CrudPage, validateDateRange } from '@/components/admin/CrudPage'
import { Badge } from '@/components/ui'
import { ANNOUNCEMENT_CATEGORIES, PRIORITIES, labelOf } from '@/lib/constants'
import { fmtDate, inSchedule, isoDate } from '@/lib/format'
import type { FieldDef } from '@/lib/form'
import type { Announcement } from '@/lib/types'

const fields: FieldDef[] = [
  { name: 'title', label: 'Judul / isi singkat', type: 'text', required: true, minLength: 3, maxLength: 150, full: true, placeholder: 'Mis. Kerja bakti membersihkan masjid, Ahad pagi' },
  { name: 'content', label: 'Keterangan tambahan', type: 'textarea', maxLength: 1000, hint: 'Opsional. Pada running text ditampilkan setelah judul.' },
  { name: 'category', label: 'Kategori', type: 'select', required: true, options: ANNOUNCEMENT_CATEGORIES },
  { name: 'priority', label: 'Prioritas', type: 'select', required: true, numeric: true, options: PRIORITIES, hint: 'Prioritas tinggi tampil lebih dulu.' },
  { name: 'start_date', label: 'Mulai tayang', type: 'date', hint: 'Kosongkan untuk langsung tayang.' },
  { name: 'end_date', label: 'Selesai tayang', type: 'date', hint: 'Kosongkan untuk tayang terus.' },
  { name: 'show_in_running_text', label: 'Tampilkan di running text', type: 'toggle', hint: 'Teks berjalan di bagian bawah layar' },
  { name: 'show_on_slide', label: 'Tampilkan sebagai slide', type: 'toggle', hint: 'Layar besar bergantian di slideshow' },
  { name: 'is_active', label: 'Aktif', type: 'toggle', hint: 'Nonaktifkan untuk menyembunyikan sementara', full: true },
]

const defaults = { title: '', content: '', category: 'pengumuman', priority: 2, start_date: null, end_date: null, show_in_running_text: true, show_on_slide: false, is_active: true }

export function scheduleBadge(row: { start_date: string | null; end_date: string | null; is_active: boolean }) {
  const today = isoDate()
  if (!row.is_active) return <Badge>Nonaktif</Badge>
  if (row.start_date && row.start_date > today) return <Badge tone="blue">Terjadwal</Badge>
  if (!inSchedule(row, today)) return <Badge tone="amber">Berakhir</Badge>
  return <Badge tone="green">Tayang</Badge>
}

export const scheduleText = (row: { start_date: string | null; end_date: string | null }) =>
  !row.start_date && !row.end_date ? 'Selalu' : `${row.start_date ? fmtDate(row.start_date) : 'Sekarang'} – ${row.end_date ? fmtDate(row.end_date) : 'seterusnya'}`

export default function AnnouncementsPage() {
  return (
    <CrudPage<Announcement>
      table="announcements" noun="pengumuman" title="Pengumuman & Running Text" icon={<Megaphone />} stampCreator
      subtitle="Kelola pengumuman, imbauan, dan pesan islami. Yang aktif akan berjalan di teks bawah layar TV dan/atau tampil sebagai slide."
      fields={fields} defaults={defaults} order={[['priority'], ['created_at', false]]} searchKeys={['title', 'content']}
      validate={(v) => ({ ...validateDateRange(v), ...(!v.show_in_running_text && !v.show_on_slide ? { show_on_slide: 'Pilih minimal satu tempat tampil' } : {}) })}
      rowLabel={(r) => r.title}
      columns={[
        { header: 'Pengumuman', render: (r) => (<div className="max-w-md"><p className="font-medium text-slate-900">{r.title}</p>{r.content && <p className="line-clamp-1 text-xs text-slate-500">{r.content}</p>}</div>) },
        { header: 'Kategori', render: (r) => labelOf(ANNOUNCEMENT_CATEGORIES, r.category) },
        { header: 'Prioritas', render: (r) => <Badge tone={r.priority === 1 ? 'red' : r.priority === 2 ? 'amber' : 'gray'}>{labelOf(PRIORITIES, r.priority)}</Badge> },
        { header: 'Tampil di', render: (r) => (<div className="flex flex-wrap gap-1">{r.show_in_running_text && <Badge tone="blue">Running text</Badge>}{r.show_on_slide && <Badge tone="blue">Slide</Badge>}</div>) },
        { header: 'Masa tayang', render: (r) => (<div className="space-y-1"><div>{scheduleBadge(r)}</div><p className="whitespace-nowrap text-xs text-slate-500">{scheduleText(r)}</p></div>) },
      ]}
    />
  )
}
