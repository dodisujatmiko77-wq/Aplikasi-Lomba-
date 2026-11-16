import { ArrowDown, ArrowUp, Film, Images } from 'lucide-react'
import { toast } from 'sonner'
import { CrudPage, validateDateRange, type RowApi } from '@/components/admin/CrudPage'
import { Alert, Badge, IconButton } from '@/components/ui'
import { SLIDE_CATEGORIES, labelOf } from '@/lib/constants'
import type { FieldDef } from '@/lib/form'
import { errorMessage, supabase } from '@/lib/supabase'
import type { SlideContent } from '@/lib/types'
import { scheduleBadge, scheduleText } from './AnnouncementsPage'

const fields: FieldDef[] = [
  { name: 'media_url', label: 'Gambar, poster, atau video', type: 'file', required: true, accept: 'media', folder: 'slides', pathField: 'storage_path', typeField: 'media_type',
    hint: 'Disarankan rasio 16:9 (1920×1080). Poster tegak tetap ditampilkan utuh.' },
  { name: 'title', label: 'Judul', type: 'text', required: true, minLength: 3, maxLength: 150, placeholder: 'Mis. Kajian Subuh bersama Ust. …' },
  { name: 'category', label: 'Jenis konten', type: 'select', required: true, options: SLIDE_CATEGORIES },
  { name: 'caption', label: 'Keterangan', type: 'textarea', maxLength: 300, rows: 2, hint: 'Opsional. Tampil di bawah judul pada layar.' },
  { name: 'duration_seconds', label: 'Durasi tayang', type: 'number', integer: true, min: 3, max: 600, suffix: 'detik', hint: 'Kosongkan untuk memakai durasi umum. Video otomatis lanjut saat selesai.' },
  { name: 'is_active', label: 'Aktif', type: 'toggle', hint: 'Tampilkan di layar' },
  { name: 'start_date', label: 'Mulai tayang', type: 'date' },
  { name: 'end_date', label: 'Selesai tayang', type: 'date' },
]

const defaults = { media_url: '', storage_path: null, media_type: null, title: '', category: 'poster_kajian', caption: '', duration_seconds: null, is_active: true, start_date: null, end_date: null }

async function move(row: SlideContent, dir: -1 | 1, api: RowApi<SlideContent>) {
  const list = [...api.rows]
  const i = list.findIndex((r) => r.id === row.id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
  // tulis ulang urutan hanya untuk baris yang nomornya berubah
  const changes = list.map((r, idx) => ({ id: r.id, sort_order: (idx + 1) * 10, old: r.sort_order })).filter((c) => c.sort_order !== c.old)
  const results = await Promise.all(changes.map((c) => supabase.from('slideshow_contents').update({ sort_order: c.sort_order }).eq('id', c.id).select()))
  const failed = results.find((r) => r.error)
  if (failed?.error) toast.error(errorMessage(failed.error))
  await api.reload()
}

export default function SlideshowPage() {
  return (
    <CrudPage<SlideContent>
      table="slideshow_contents" noun="konten" title="Manajemen Slideshow" icon={<Images />} stampCreator
      subtitle="Unggah poster kajian, dokumentasi, informasi Ramadan/qurban, ucapan hari besar, atau video. Konten berganti otomatis di layar TV sesuai urutan."
      fields={fields} defaults={defaults} order={[['sort_order'], ['created_at']]} searchKeys={['title', 'caption']}
      validate={validateDateRange}
      prepare={(payload, editing, rows) => (editing ? payload : { ...payload, sort_order: (Math.max(0, ...rows.map((r) => r.sort_order)) || 0) + 10 })}
      rowLabel={(r) => r.title}
      above={() => (
        <div className="mb-4"><Alert tone="blue">Selain konten di bawah, slideshow juga otomatis menampilkan ayat &amp; hadis, agenda kegiatan, info donasi, dan laporan keuangan — atur di menu <b>Pengaturan Display</b>.</Alert></div>
      )}
      extraActions={(row, api, i) => (
        <>
          <IconButton label={`Naikkan urutan ${row.title}`} disabled={i === 0} onClick={() => void move(row, -1, api)}><ArrowUp /></IconButton>
          <IconButton label={`Turunkan urutan ${row.title}`} disabled={i === api.rows.length - 1} onClick={() => void move(row, 1, api)}><ArrowDown /></IconButton>
        </>
      )}
      columns={[
        { header: 'Konten', render: (r) => (
          <div className="flex items-center gap-3">
            {r.media_type === 'video'
              ? <span className="flex h-14 w-24 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white"><Film className="h-5 w-5" /></span>
              : <img src={r.media_url} alt="" className="h-14 w-24 shrink-0 rounded-lg border border-slate-200 bg-slate-100 object-cover" loading="lazy" />}
            <div className="min-w-0 max-w-xs"><p className="truncate font-medium text-slate-900">{r.title}</p>{r.caption && <p className="line-clamp-1 text-xs text-slate-500">{r.caption}</p>}</div>
          </div>
        ) },
        { header: 'Jenis', render: (r) => (<div className="space-y-1"><p>{labelOf(SLIDE_CATEGORIES, r.category)}</p><Badge tone={r.media_type === 'video' ? 'blue' : 'gray'}>{r.media_type === 'video' ? 'Video' : 'Gambar'}</Badge></div>) },
        { header: 'Durasi', render: (r) => (r.duration_seconds ? `${r.duration_seconds} dtk` : <span className="text-slate-400">Umum</span>) },
        { header: 'Masa tayang', render: (r) => (<div className="space-y-1"><div>{scheduleBadge(r)}</div><p className="whitespace-nowrap text-xs text-slate-500">{scheduleText(r)}</p></div>) },
      ]}
    />
  )
}
