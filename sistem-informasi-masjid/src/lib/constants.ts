import type { UserRole } from './types'

export const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin_masjid: 'Admin Masjid',
  operator: 'Operator Informasi',
}

export const ANNOUNCEMENT_CATEGORIES = [
  { value: 'pengumuman', label: 'Pengumuman masjid' },
  { value: 'kegiatan', label: 'Informasi kegiatan' },
  { value: 'kebersihan', label: 'Imbauan kebersihan' },
  { value: 'infak', label: 'Infak & sedekah' },
  { value: 'pesan_islami', label: 'Pesan islami' },
]

export const PRIORITIES = [
  { value: '1', label: 'Tinggi' },
  { value: '2', label: 'Sedang' },
  { value: '3', label: 'Rendah' },
]

export const SLIDE_CATEGORIES = [
  { value: 'poster_kajian', label: 'Poster kajian' },
  { value: 'jadwal_pengajian', label: 'Jadwal pengajian' },
  { value: 'ramadan', label: 'Kegiatan Ramadan' },
  { value: 'keuangan', label: 'Laporan keuangan' },
  { value: 'dokumentasi', label: 'Dokumentasi kegiatan' },
  { value: 'qurban', label: 'Informasi qurban' },
  { value: 'ucapan', label: 'Ucapan hari besar Islam' },
  { value: 'lainnya', label: 'Lainnya' },
]

export const EVENT_CATEGORIES = [
  { value: 'kajian', label: 'Kajian / pengajian' },
  { value: 'kegiatan', label: 'Kegiatan masjid' },
  { value: 'ramadan', label: 'Ramadan' },
  { value: 'qurban', label: 'Qurban' },
  { value: 'phbi', label: 'Hari besar Islam' },
  { value: 'sosial', label: 'Sosial' },
]

export const ISLAMIC_TYPES = [
  { value: 'ayat', label: 'Ayat Al-Qur’an' },
  { value: 'hadis', label: 'Hadis' },
  { value: 'doa', label: 'Doa' },
  { value: 'kutipan', label: 'Kutipan / nasihat' },
]

export const INCOME_CATEGORIES = ['Infak Jumat', 'Infak Harian', 'Zakat', 'Sedekah', 'Wakaf', 'Donasi Pembangunan', 'Infak Ramadan', 'Lainnya']
export const EXPENSE_CATEGORIES = ['Listrik & Air', 'Kebersihan', 'Honor Petugas', 'Honor Penceramah', 'Perawatan & Perbaikan', 'Kegiatan', 'Santunan', 'Lainnya']

export const WEEKDAY_OPTIONS = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map((label, i) => ({ value: String(i), label }))

export const labelOf = (opts: { value: string; label: string }[], v: unknown) => opts.find((o) => o.value === String(v))?.label ?? String(v ?? '-')

/** Koordinat ibu kota provinsi sebagai titik awal; sesuaikan dengan lokasi masjid sebenarnya. */
export const CITY_PRESETS: { name: string; lat: number; lng: number; tz: 'WIB' | 'WITA' | 'WIT' }[] = [
  { name: 'Banda Aceh', lat: 5.5483, lng: 95.3238, tz: 'WIB' }, { name: 'Medan', lat: 3.5952, lng: 98.6722, tz: 'WIB' },
  { name: 'Padang', lat: -0.9471, lng: 100.4172, tz: 'WIB' }, { name: 'Pekanbaru', lat: 0.5071, lng: 101.4478, tz: 'WIB' },
  { name: 'Tanjungpinang', lat: 0.9186, lng: 104.4665, tz: 'WIB' }, { name: 'Jambi', lat: -1.6101, lng: 103.6131, tz: 'WIB' },
  { name: 'Palembang', lat: -2.9761, lng: 104.7754, tz: 'WIB' }, { name: 'Pangkalpinang', lat: -2.1316, lng: 106.1169, tz: 'WIB' },
  { name: 'Bengkulu', lat: -3.7928, lng: 102.2608, tz: 'WIB' }, { name: 'Bandar Lampung', lat: -5.3971, lng: 105.2668, tz: 'WIB' },
  { name: 'Serang', lat: -6.1104, lng: 106.164, tz: 'WIB' }, { name: 'Jakarta Pusat', lat: -6.175392, lng: 106.827153, tz: 'WIB' },
  { name: 'Bandung', lat: -6.9175, lng: 107.6191, tz: 'WIB' }, { name: 'Semarang', lat: -6.9667, lng: 110.4167, tz: 'WIB' },
  { name: 'Yogyakarta', lat: -7.7956, lng: 110.3695, tz: 'WIB' }, { name: 'Surabaya', lat: -7.2575, lng: 112.7521, tz: 'WIB' },
  { name: 'Pontianak', lat: -0.0263, lng: 109.3425, tz: 'WIB' }, { name: 'Palangka Raya', lat: -2.2161, lng: 113.914, tz: 'WIB' },
  { name: 'Banjarmasin', lat: -3.3186, lng: 114.5944, tz: 'WITA' }, { name: 'Samarinda', lat: -0.5022, lng: 117.1536, tz: 'WITA' },
  { name: 'Tanjung Selor', lat: 2.8375, lng: 117.3653, tz: 'WITA' }, { name: 'Denpasar', lat: -8.65, lng: 115.2167, tz: 'WITA' },
  { name: 'Mataram', lat: -8.5833, lng: 116.1167, tz: 'WITA' }, { name: 'Kupang', lat: -10.1772, lng: 123.607, tz: 'WITA' },
  { name: 'Makassar', lat: -5.1477, lng: 119.4327, tz: 'WITA' }, { name: 'Mamuju', lat: -2.6748, lng: 118.8885, tz: 'WITA' },
  { name: 'Palu', lat: -0.8917, lng: 119.8707, tz: 'WITA' }, { name: 'Kendari', lat: -3.9985, lng: 122.513, tz: 'WITA' },
  { name: 'Gorontalo', lat: 0.5435, lng: 123.0568, tz: 'WITA' }, { name: 'Manado', lat: 1.4748, lng: 124.8421, tz: 'WITA' },
  { name: 'Ternate', lat: 0.7906, lng: 127.3842, tz: 'WIT' }, { name: 'Ambon', lat: -3.6954, lng: 128.1814, tz: 'WIT' },
  { name: 'Manokwari', lat: -0.8615, lng: 134.062, tz: 'WIT' }, { name: 'Sorong', lat: -0.8762, lng: 131.2558, tz: 'WIT' },
  { name: 'Jayapura', lat: -2.5337, lng: 140.7181, tz: 'WIT' }, { name: 'Merauke', lat: -8.4991, lng: 140.4049, tz: 'WIT' },
]
