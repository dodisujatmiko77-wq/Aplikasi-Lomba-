import { useMemo } from 'react'
import { LocateFixed } from 'lucide-react'
import { toast } from 'sonner'
import { SettingsForm, type SettingsSection } from '@/components/admin/SettingsForm'
import { Alert, Button, Loading, PageHeader } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { useSingleRow } from '@/hooks/useTable'
import { CITY_PRESETS } from '@/lib/constants'
import type { FieldDef, Values } from '@/lib/form'
import { fromForm } from '@/lib/form'
import { CALC_METHODS, PRAYER_KEYS, PRAYER_LABEL, WAJIB_KEYS, computeDayTimes, fmtMinutes, mosqueDate } from '@/lib/prayer'
import { fmtDateLong, toHijri } from '@/lib/hijri'
import type { PrayerSchedule } from '@/lib/types'

const isAuto = (v: Values) => v.mode === 'auto'
const minute = (name: string, label: string, min: number, max: number, extra: Partial<FieldDef> = {}): FieldDef =>
  ({ name, label, type: 'number', integer: true, required: true, min, max, suffix: 'menit', ...extra })

const baseFields: FieldDef[] = [
  { name: 'mode', label: 'Sumber jadwal', type: 'select', required: true, full: true,
    options: [{ value: 'auto', label: 'Otomatis — dihitung dari lokasi masjid (disarankan)' }, { value: 'manual', label: 'Manual — jam diisi sendiri oleh admin' }] },
  { name: 'timezone', label: 'Zona waktu', type: 'select', required: true, options: [{ value: 'WIB', label: 'WIB (UTC+7)' }, { value: 'WITA', label: 'WITA (UTC+8)' }, { value: 'WIT', label: 'WIT (UTC+9)' }] },
  { name: 'hijri_offset', label: 'Koreksi tanggal Hijriah', type: 'number', integer: true, required: true, min: -3, max: 3, suffix: 'hari', hint: 'Sesuaikan dengan penetapan pemerintah (mis. +1 atau −1).' },
]
const locationFields: FieldDef[] = [
  { name: 'location_name', label: 'Nama lokasi', type: 'text', required: true, maxLength: 80, showIf: isAuto },
  { name: 'calc_method', label: 'Metode perhitungan', type: 'select', required: true, options: CALC_METHODS, showIf: isAuto },
  { name: 'latitude', label: 'Lintang (latitude)', type: 'number', required: true, min: -90, max: 90, step: 0.000001, showIf: isAuto, hint: 'Negatif untuk Lintang Selatan, mis. −6.175392' },
  { name: 'longitude', label: 'Bujur (longitude)', type: 'number', required: true, min: -180, max: 180, step: 0.000001, showIf: isAuto, hint: 'Mis. 106.827153' },
  { name: 'madhab', label: 'Mazhab waktu Asar', type: 'select', required: true, options: [{ value: 'syafii', label: 'Syafii / Maliki / Hambali (umum di Indonesia)' }, { value: 'hanafi', label: 'Hanafi' }], showIf: isAuto },
  minute('ihtiyat_minutes', 'Ihtiyat (pengaman)', 0, 10, { showIf: isAuto, hint: 'Bawaan 2 menit, sesuai kelaziman jadwal resmi.' }),
  minute('imsak_offset', 'Imsak sebelum Subuh', 0, 30, { showIf: isAuto }),
  minute('duha_offset', 'Duha setelah Terbit', 10, 60, { showIf: isAuto }),
]
const correctionFields: FieldDef[] = PRAYER_KEYS.map((k) => ({ name: `corrections.${k}`, label: PRAYER_LABEL[k], type: 'number', integer: true, min: -30, max: 30, suffix: 'menit', placeholder: '0', showIf: isAuto, nullable: true }))
const manualFields: FieldDef[] = PRAYER_KEYS.map((k) => ({ name: `manual_times.${k}`, label: PRAYER_LABEL[k], type: 'time', required: true, showIf: (v) => v.mode === 'manual' }))
const iqamahFields: FieldDef[] = WAJIB_KEYS.map((k) => minute(`iqamah_minutes.${k}`, `Iqamah ${PRAYER_LABEL[k]}`, 0, 45))
const modeFields: FieldDef[] = [
  { name: 'prayer_mode_enabled', label: 'Mode waktu salat (layar penuh)', type: 'toggle', hint: 'Saat masuk waktu: nama salat, jam, imbauan senyap, hitung mundur iqamah' },
  { name: 'salat_screen_enabled', label: 'Layar tenang saat salat berlangsung', type: 'toggle', hint: 'Layar meredup setelah iqamah' },
  { name: 'countdown_enabled', label: 'Hitung mundur salat berikutnya', type: 'toggle', hint: 'Kartu “Menuju waktu …” di layar utama' },
  { name: 'notify_sound', label: 'Bunyi pemberitahuan', type: 'toggle', hint: 'Nada singkat saat masuk waktu salat' },
  minute('adzan_minutes', 'Durasi layar adzan', 1, 15),
  minute('salat_minutes', 'Durasi salat', 1, 60),
  minute('jumat_minutes', 'Durasi khutbah & salat Jumat', 10, 120),
]
const officerFields: FieldDef[] = [
  ...WAJIB_KEYS.map((k): FieldDef => ({ name: `imams.${k}`, label: `Imam ${PRAYER_LABEL[k]}`, type: 'text', maxLength: 80 })),
  { name: 'khatib_jumat', label: 'Khatib Jumat (pekan ini)', type: 'text', maxLength: 80 },
  { name: 'imam_jumat', label: 'Imam Jumat', type: 'text', maxLength: 80 },
  { name: 'muazin_jumat', label: 'Muazin Jumat', type: 'text', maxLength: 80 },
]
const allFields = [...baseFields, ...locationFields, ...correctionFields, ...manualFields, ...iqamahFields, ...modeFields, ...officerFields]

function Preview({ values, row }: { values: Values; row: PrayerSchedule }) {
  const data = useMemo(() => {
    try {
      const ps = { ...row, ...fromForm(values, allFields, row as unknown as Values), updated_at: JSON.stringify(values) } as unknown as PrayerSchedule
      if (!['WIB', 'WITA', 'WIT'].includes(ps.timezone) || !Number.isFinite(Number(ps.latitude)) || !Number.isFinite(Number(ps.longitude))) return null
      const md = mosqueDate(ps.timezone)
      return { times: computeDayTimes(ps, md.getUTCFullYear(), md.getUTCMonth() + 1, md.getUTCDate()), date: fmtDateLong(md), hijri: toHijri(md, Number(ps.hijri_offset) || 0).text }
    } catch {
      return null
    }
  }, [values, row])
  if (!data) return null
  return (
    <div className="mt-5 rounded-2xl bg-gradient-to-br from-emerald-900 to-emerald-950 p-5 text-white" data-testid="prayer-preview">
      <p className="text-sm text-emerald-100/80">Pratinjau jadwal hari ini · {data.date} · <span className="text-gold-400">{data.hijri}</span></p>
      <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
        {PRAYER_KEYS.map((k) => (
          <div key={k} className="rounded-xl bg-white/10 px-2 py-2.5 text-center">
            <p className="text-xs text-emerald-100/75">{PRAYER_LABEL[k]}</p>
            <p className="tabular font-heading text-lg font-bold" data-preview={k}>{fmtMinutes(data.times[k])}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-emerald-100/70">Bandingkan dengan jadwal resmi Kemenag/ormas setempat. Bila berbeda, gunakan kolom koreksi per waktu.</p>
    </div>
  )
}

export default function PrayerPage() {
  const { mosqueId } = useAuth()
  const { row, loading, error, save } = useSingleRow<PrayerSchedule>('prayer_schedules', mosqueId)
  if (loading) return <Loading />
  if (error || !row) return <Alert tone="red">{error ?? 'Pengaturan jadwal salat tidak ditemukan.'}</Alert>

  const sections: SettingsSection[] = [
    { title: 'Sumber jadwal', description: 'Jadwal dihitung di perangkat layar, sehingga tetap tampil saat internet terputus.', columns: 3, fields: baseFields,
      extra: (values) => <Preview values={values} row={row} /> },
    {
      title: 'Lokasi masjid & metode', description: 'Koordinat menentukan ketepatan jadwal. Gunakan titik lokasi masjid, bukan pusat kota.', columns: 3, fields: locationFields,
      extra: (values, set) => values.mode !== 'auto' ? <p className="text-sm text-slate-500">Tidak dipakai pada mode manual.</p> : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select className="input w-auto" aria-label="Pilih kota" value="" onChange={(e) => {
            const c = CITY_PRESETS.find((x) => x.name === e.target.value)
            if (c) set({ location_name: c.name, latitude: String(c.lat), longitude: String(c.lng), timezone: c.tz })
          }}>
            <option value="">Isi cepat dari kota…</option>
            {CITY_PRESETS.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.tz})</option>)}
          </select>
          <Button variant="secondary" icon={<LocateFixed />} onClick={() => {
            if (!navigator.geolocation) return void toast.error('Perangkat ini tidak mendukung deteksi lokasi.')
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const lng = pos.coords.longitude
                set({ latitude: pos.coords.latitude.toFixed(6), longitude: lng.toFixed(6), timezone: lng < 112.5 ? 'WIB' : lng < 127.5 ? 'WITA' : 'WIT' })
                toast.success('Koordinat diisi dari lokasi perangkat ini. Periksa zona waktu, lalu simpan.')
              },
              () => toast.error('Lokasi tidak dapat diakses. Izinkan akses lokasi atau isi koordinat secara manual.'),
              { enableHighAccuracy: true, timeout: 10000 },
            )
          }}>Gunakan lokasi perangkat ini</Button>
        </div>
      ),
    },
    { title: 'Koreksi per waktu', description: 'Tambah/kurangi menit agar sama dengan jadwal resmi setempat. Kosongkan bila tidak perlu.', columns: 4, fields: correctionFields,
      extra: (values) => (values.mode !== 'auto' ? <p className="text-sm text-slate-500">Tidak dipakai pada mode manual.</p> : null) },
    { title: 'Jadwal manual', description: 'Jam yang diisi berlaku setiap hari sampai diubah kembali.', columns: 4, fields: manualFields,
      extra: (values) => (values.mode !== 'manual' ? <p className="text-sm text-slate-500">Aktif bila sumber jadwal diubah ke “Manual”.</p> : null) },
    { title: 'Iqamah', description: 'Jeda antara adzan dan iqamah untuk tiap salat (hitung mundur di layar).', columns: 3, fields: iqamahFields },
    { title: 'Mode waktu salat & hitung mundur', description: 'Semua fitur dapat diaktifkan atau dinonaktifkan.', columns: 2, fields: modeFields },
    { title: 'Imam & khatib', description: 'Tampil pada panel informasi. Kosongkan yang tidak ingin ditampilkan.', columns: 3, fields: officerFields },
  ]

  return (
    <div>
      <PageHeader title="Jadwal Salat" subtitle="Sumber jadwal, lokasi, koreksi waktu, iqamah, mode waktu salat, serta petugas imam dan khatib." />
      <SettingsForm row={row as unknown as Values} sections={sections} onSave={save}
        validate={(v) => {
          if (v.mode !== 'manual') return {}
          const errs: Record<string, string> = {}
          let prev = ''
          for (const k of PRAYER_KEYS) {
            const t = String(v[`manual_times.${k}`] ?? '')
            if (t && prev && t <= prev) errs[`manual_times.${k}`] = 'Harus setelah waktu sebelumnya'
            if (t) prev = t
          }
          return errs
        }} />
    </div>
  )
}
