import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const isConfigured = Boolean(url && key)

// Bila .env belum diisi, aplikasi menampilkan halaman Penyiapan (lihat App.tsx) dan klien ini tidak pernah dipakai.
export const supabase: SupabaseClient = createClient(url || 'http://localhost', key || 'belum-diatur', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'sim-auth' },
  realtime: { params: { eventsPerSecond: 5 } },
})

/** Klien sementara tanpa sesi tersimpan — dipakai Super Admin untuk mendaftarkan akun baru tanpa ikut ter-logout. */
export function createEphemeralClient(): SupabaseClient {
  return createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'sim-auth-tmp' } })
}

export const MEDIA_BUCKET = 'media'

/** Pesan galat Supabase → bahasa Indonesia yang ramah pengurus. */
export function errorMessage(e: unknown): string {
  const err = e as { message?: string; code?: string } | null
  const msg = err?.message ?? String(e)
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Tidak dapat terhubung ke server. Periksa koneksi internet.'
  if (err?.code === '42501' || /row-level security|permission denied/i.test(msg)) return 'Anda tidak memiliki izin untuk tindakan ini.'
  if (err?.code === '23505' || /duplicate key/i.test(msg)) return 'Data dengan nilai tersebut sudah ada.'
  if (err?.code === '23514' && /check constraint/i.test(msg)) return 'Data tidak memenuhi ketentuan. Periksa kembali isian Anda.'
  if (/Invalid login credentials/i.test(msg)) return 'Email atau kata sandi salah.'
  if (/Email not confirmed/i.test(msg)) return 'Email belum dikonfirmasi. Buka tautan konfirmasi di kotak masuk Anda.'
  if (/already registered|already been registered/i.test(msg)) return 'Email sudah terdaftar.'
  if (/exceeded the maximum allowed size|too large/i.test(msg)) return 'Ukuran berkas melebihi batas.'
  return msg
}
