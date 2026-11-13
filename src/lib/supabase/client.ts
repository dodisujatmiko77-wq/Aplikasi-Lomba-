import { createClient } from '@supabase/supabase-js'

// Konfigurasi dibaca dari /config.js saat runtime (build siap-unggah) atau dari variabel build VITE_*.
const runtime = (globalThis as { __LR1_CONFIG__?: { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string } }).__LR1_CONFIG__
const url = (runtime?.SUPABASE_URL || (import.meta.env.VITE_SUPABASE_URL as string | undefined) || '').trim() || undefined
const anonKey = (runtime?.SUPABASE_ANON_KEY || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || '').trim() || undefined

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
