import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Benar bila variabel lingkungan Supabase sudah diisi. */
export const isSupabaseConfigured = Boolean(url && anonKey)

// Hanya anon key yang dipakai di browser. Service role key TIDAK PERNAH ada di frontend.
export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'belum-dikonfigurasi', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'lr1.admin.auth' },
  realtime: { params: { eventsPerSecond: 10 } },
})

/** Klien terpisah tanpa sesi tersimpan (dipakai superadmin saat mendaftarkan akun admin baru). */
export function createEphemeralClient() {
  return createClient(url || 'http://localhost:54321', anonKey || 'belum-dikonfigurasi', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'lr1.ephemeral' },
  })
}
