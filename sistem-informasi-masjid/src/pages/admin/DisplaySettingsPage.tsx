import { Copy, ExternalLink, MonitorSmartphone } from 'lucide-react'
import { toast } from 'sonner'
import { CrudPage } from '@/components/admin/CrudPage'
import { SettingsForm, type SettingsSection } from '@/components/admin/SettingsForm'
import { Alert, Badge, IconButton, Loading, PageHeader, Section } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { useSingleRow } from '@/hooks/useTable'
import { isOnline, timeAgo } from '@/lib/format'
import type { FieldDef, Values } from '@/lib/form'
import type { DisplayDevice, DisplaySettings } from '@/lib/types'

const LAYOUTS = [{ value: 'classic', label: 'Klasik — slide besar, jadwal salat di bawah' }, { value: 'side', label: 'Samping — jadwal salat di kiri, slide di tengah' }]
const seconds = (name: string, label: string, min: number, max: number, hint?: string): FieldDef => ({ name, label, type: 'number', integer: true, required: true, min, max, suffix: 'detik', hint })

const sections: SettingsSection[] = [
  {
    title: 'Tata letak & warna', columns: 2,
    fields: [
      { name: 'layout', label: 'Tata letak layar', type: 'select', required: true, options: LAYOUTS, hint: 'Layar berdiri (potret) otomatis memakai tata letak tegak.' },
      { name: 'theme', label: 'Latar', type: 'select', required: true, options: [{ value: 'dark', label: 'Gelap — gradasi hijau tua (disarankan untuk TV)' }, { value: 'light', label: 'Terang — putih' }] },
      { name: 'primary_color', label: 'Warna utama', type: 'color', required: true, hint: 'Bawaan: hijau emerald #047857' },
      { name: 'accent_color', label: 'Warna aksen', type: 'color', required: true, hint: 'Bawaan: emas #d4af37' },
      { name: 'font_scale', label: 'Ukuran teks', type: 'select', required: true, numeric: true,
        options: [['0.85', 'Kecil (85%)'], ['0.92', 'Agak kecil (92%)'], ['1', 'Normal (100%)'], ['1.08', 'Agak besar (108%)'], ['1.15', 'Besar (115%)'], ['1.25', 'Sangat besar (125%)']].map(([value, label]) => ({ value, label })),
        hint: 'Perbesar bila layar dilihat dari jarak jauh.' },
      { name: 'auto_fullscreen', label: 'Mode layar penuh otomatis', type: 'toggle', hint: 'Masuk layar penuh pada sentuhan/klik pertama. Tombol F untuk beralih.' },
    ],
  },
  {
    title: 'Running text', columns: 2,
    fields: [
      { name: 'running_text_enabled', label: 'Tampilkan running text', type: 'toggle', hint: 'Teks berjalan di bagian bawah layar' },
      { name: 'running_text_speed', label: 'Kecepatan', type: 'select', required: true, numeric: true,
        options: [['60', 'Lambat'], ['85', 'Agak lambat'], ['110', 'Sedang'], ['150', 'Cepat'], ['200', 'Sangat cepat']].map(([value, label]) => ({ value, label })) },
    ],
  },
  {
    title: 'Slideshow & panel informasi', description: 'Pilih konten otomatis yang ikut bergantian di slideshow.', columns: 2,
    fields: [
      { name: 'slideshow_enabled', label: 'Tampilkan slideshow', type: 'toggle', hint: 'Area konten bergantian' },
      seconds('slideshow_duration', 'Durasi tiap slide', 3, 300, 'Berlaku untuk slide tanpa durasi khusus.'),
      { name: 'show_info_panel', label: 'Tampilkan panel informasi', type: 'toggle', hint: 'Imam & khatib, kajian rutin, agenda, donasi, kontak' },
      seconds('info_panel_duration', 'Durasi tiap halaman panel', 5, 120),
      { name: 'show_slide_islamic', label: 'Slide ayat & hadis', type: 'toggle', hint: 'Dari menu Ayat & Hadis' },
      { name: 'show_slide_announcements', label: 'Slide pengumuman', type: 'toggle', hint: 'Pengumuman bertanda “tampilkan sebagai slide”' },
      { name: 'show_slide_events', label: 'Slide agenda kegiatan', type: 'toggle', hint: 'Dari menu Kegiatan Masjid' },
      { name: 'show_slide_donation', label: 'Slide rekening & QR donasi', type: 'toggle', hint: 'Dari menu Keuangan & Donasi' },
      { name: 'show_slide_finance', label: 'Slide laporan keuangan', type: 'toggle', hint: 'Menampilkan ringkasan saldo & grafik kepada jamaah (tanpa rincian transaksi)', full: true },
    ],
  },
  {
    title: 'Mode khusus', description: 'Ramadan, Jumat, dan hari raya.', columns: 2,
    fields: [
      { name: 'special_mode', label: 'Mode tampilan', type: 'select', required: true,
        options: [['auto', 'Otomatis mengikuti kalender Hijriah (disarankan)'], ['normal', 'Normal'], ['ramadan', 'Ramadan — jadwal imsakiyah & hitung mundur berbuka'], ['idulfitri', 'Idulfitri — ucapan hari raya'], ['iduladha', 'Iduladha — ucapan hari raya']].map(([value, label]) => ({ value, label })) },
      { name: 'friday_mode_enabled', label: 'Mode Jumat', type: 'toggle', hint: 'Setiap Jumat: info khatib/imam, label “Jumat”, layar khutbah' },
      { name: 'eid_greeting', label: 'Ucapan hari raya', type: 'textarea', maxLength: 300, rows: 2, hint: 'Opsional. Kosongkan untuk memakai ucapan bawaan.' },
    ],
  },
  {
    title: 'Pembaruan data', description: 'Perubahan dari admin tampil seketika (realtime). Pemeriksaan berkala menjadi cadangan bila realtime terputus.', columns: 2,
    fields: [seconds('refresh_interval', 'Periksa pembaruan setiap', 10, 3600)],
  },
]

const deviceFields: FieldDef[] = [
  { name: 'name', label: 'Nama layar', type: 'text', required: true, minLength: 2, maxLength: 60, placeholder: 'Mis. TV Serambi' },
  { name: 'code', label: 'Kode layar', type: 'text', required: true, maxLength: 30, placeholder: 'mis. serambi', pattern: { regex: /^[a-z0-9][a-z0-9-]{1,29}$/, message: 'Huruf kecil, angka, atau strip (2–30 karakter)' }, hint: 'Menjadi alamat layar: /display/kode' },
  { name: 'location', label: 'Lokasi', type: 'text', maxLength: 80, placeholder: 'Mis. Serambi utara' },
  { name: 'layout', label: 'Tata letak khusus', type: 'select', options: LAYOUTS, placeholder: 'Ikuti pengaturan umum', nullable: true },
  { name: 'font_scale', label: 'Ukuran teks khusus', type: 'select', numeric: true, placeholder: 'Ikuti pengaturan umum',
    options: [['0.85', 'Kecil (85%)'], ['1', 'Normal (100%)'], ['1.15', 'Besar (115%)'], ['1.25', 'Sangat besar (125%)']].map(([value, label]) => ({ value, label })) },
  { name: 'is_active', label: 'Aktif', type: 'toggle', hint: 'Nonaktifkan untuk mematikan tampilan di layar ini' },
]

const displayUrl = (code: string) => `${window.location.origin}/display/${code}`

export default function DisplaySettingsPage() {
  const { mosqueId } = useAuth()
  const { row, loading, error, save } = useSingleRow<DisplaySettings>('display_settings', mosqueId)
  if (loading) return <Loading />
  if (error || !row) return <Alert tone="red">{error ?? 'Pengaturan display tidak ditemukan.'}</Alert>

  return (
    <div>
      <PageHeader title="Pengaturan Display" subtitle="Atur tampilan layar TV dan kelola perangkat layar. Satu pengaturan berlaku untuk semua layar; tiap layar dapat diberi tata letak sendiri." />
      <div className="mb-5">
        <Section title="Perangkat display" description="Buka alamat layar di peramban TV. Alamat akan diingat perangkat, sehingga cukup membuka halaman utama pada kunjungan berikutnya.">
          <CrudPage<DisplayDevice>
            embedded table="display_devices" noun="layar" icon={<MonitorSmartphone />}
            fields={deviceFields} defaults={{ name: '', code: '', location: '', layout: null, font_scale: null, is_active: true }}
            order={[['created_at']]} rowLabel={(r) => r.name}
            prepare={(payload) => ({ ...payload, code: String(payload.code).toLowerCase() })}
            extraActions={(r) => (
              <>
                <IconButton label={`Salin alamat ${r.name}`} onClick={() => void navigator.clipboard.writeText(displayUrl(r.code)).then(() => toast.success('Alamat layar disalin.'), () => toast.error('Tidak dapat menyalin. Salin manual: ' + displayUrl(r.code)))}><Copy /></IconButton>
                <a href={displayUrl(r.code)} target="_blank" rel="noreferrer" title={`Buka ${r.name}`} aria-label={`Buka ${r.name}`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"><ExternalLink className="h-4 w-4" /></a>
              </>
            )}
            columns={[
              { header: 'Layar', render: (r) => (<div><p className="font-medium text-slate-900">{r.name}</p><p className="text-xs text-slate-500">{r.location || '-'}</p></div>) },
              { header: 'Alamat', render: (r) => <code className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">/display/{r.code}</code> },
              { header: 'Status', render: (r) => (
                <div className="space-y-1">
                  {isOnline(r.last_seen_at) ? <Badge tone="green">● Online</Badge> : <Badge>○ Offline</Badge>}
                  <p className="text-xs text-slate-500">{timeAgo(r.last_seen_at)}</p>
                </div>
              ) },
              { header: 'Khusus', render: (r) => <span className="text-xs text-slate-600">{[r.layout && (r.layout === 'side' ? 'Tata letak samping' : 'Tata letak klasik'), r.font_scale && `Teks ${Math.round(Number(r.font_scale) * 100)}%`].filter(Boolean).join(' · ') || 'Ikut umum'}</span> },
            ]}
          />
        </Section>
      </div>
      <SettingsForm row={row as unknown as Values} sections={sections} onSave={save}
        validate={(v) => (!v.slideshow_enabled && !v.show_info_panel ? { show_info_panel: 'Aktifkan minimal slideshow atau panel informasi' } : {})} />
    </div>
  )
}
