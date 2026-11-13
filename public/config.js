// KONFIGURASI SUPABASE (dibaca browser saat runtime).
// Hanya berisi Project URL dan publishable (anon) key, yang memang publik dan dilindungi RLS.
// JANGAN PERNAH menaruh secret key / service_role key di berkas ini.
window.__LR1_CONFIG__ = {
  SUPABASE_URL: 'https://kkfgugyutqetjvhfifng.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_OYluu7dvBWWN3Unxi_6slA_1w2TY2oX',
  // Alamat situs untuk QR kartu peserta dan tautan yang dibagikan (juga dipakai aplikasi Android).
  PUBLIC_URL: 'https://lomba-rangking1.vercel.app',
}
