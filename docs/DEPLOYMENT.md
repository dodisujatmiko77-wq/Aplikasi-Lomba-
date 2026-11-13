# Panduan Deployment — Lomba Rangking 1

Estimasi waktu: ±45 menit. Semua langkah dilakukan sekali. **Lakukan gladi resik (bagian 7) sebelum hari lomba.**

## 1. Buat proyek Supabase
1. https://supabase.com → *New project*. Pilih region terdekat (mis. Singapore). Simpan *database password*.
2. **Project Settings → API**: catat `Project URL` dan `anon public key`. (Jangan pernah memakai `service_role` di frontend.)
3. **Authentication → Providers → Email**: aktifkan *Email*. Matikan *Confirm email* bila admin dibuat lewat Edge Function (akun langsung terkonfirmasi).
4. **Authentication → Sign In / Providers → "Allow new users to sign up"**: **matikan** setelah Edge Function `admin-users` ter-deploy (bagian 4). Bila tetap aktif pun, akun baru otomatis *nonaktif* dan tidak melihat data apa pun.
5. **Realtime → Settings**: pastikan *Allow public access* aktif (monitor memakai kanal Broadcast publik `live:<kode-sesi>`; payload hanya berisi sinyal, bukan data sensitif).

## 2. Jalankan migrasi database
Buka **SQL Editor** dan jalankan **berurutan**, satu berkas per eksekusi:

| Urut | Berkas | Isi |
|---|---|---|
| 1 | `supabase/migrations/0001_schema.sql` | 27 tabel, constraint, index |
| 2 | `supabase/migrations/0002_security.sql` | fungsi otorisasi, trigger, RLS, bucket Storage |
| 3 | `supabase/migrations/0003_admin_functions.sql` | RPC admin: peserta, PIN, bank soal |
| 4 | `supabase/migrations/0004_competition_engine.sql` | mesin lomba: skor, submit atomik, kontrol operator |
| 5 | `supabase/migrations/0005_fix_new_user_trigger.sql` | perbaikan pembuatan user (aman diulang) |
| 6 | `supabase/seed.sql` | 3 jenjang, 15 kecamatan, role, contoh event & 12 soal |

> **Jika membuat user Supabase gagal** ("Database error creating new user"): jalankan `0005_fix_new_user_trigger.sql`, lalu buat user lagi.

> Berkas 0001–0004 **tidak idempoten**: jalankan sekali pada proyek kosong. Untuk mengulang dari nol, buat proyek baru atau reset database.

## 3. Bootstrap Superadmin pertama (aman, tanpa kredensial di SQL)
1. **Authentication → Users → Add user → Create new user**: isi email & kata sandi kuat, centang *Auto Confirm User*.
2. Di SQL Editor jalankan (sekali):
   ```sql
   select public.bootstrap_superadmin('email-anda@contoh.id');
   ```
   Fungsi ini **hanya bisa dijalankan dari SQL Editor** (ditolak bila dipanggil lewat API) dan hanya bila belum ada Superadmin aktif.
3. Masuk di `https://<situs-anda>/login`. Selanjutnya buat Admin dari menu **Manajemen Admin**.

## 4. Edge Function `admin-users` (pembuatan akun Admin)
Satu-satunya tempat `service_role` dipakai (otomatis tersedia di runtime Edge Function, tidak perlu disalin ke mana pun).
```bash
npx supabase login
npx supabase functions deploy admin-users --project-ref <ref-proyek> --use-api
```
`<ref-proyek>` = potongan acak pada `https://<ref-proyek>.supabase.co`. Tidak perlu `supabase link` maupun Docker.
Alternatif tanpa terminal: Dashboard → **Edge Functions → Deploy a new function → Via Editor**, nama `admin-users`, tempel isi `supabase/functions/admin-users/index.ts`, biarkan *Verify JWT* aktif.
Uji: masuk sebagai Superadmin → **Manajemen Admin → Admin baru**.

Tanpa fungsi ini aplikasi memakai jalur cadangan (pendaftaran biasa lalu diaktifkan Superadmin), tetapi reset kata sandi/hapus akun harus lewat dashboard Supabase.

## 5. Verifikasi keamanan
Jalankan `supabase/tests/verify_deployment.sql` di SQL Editor. **Semua baris harus `OK`.**
Lalu uji manual dengan anon key: `curl "$URL/rest/v1/questions" -H "apikey: $ANON"` harus mengembalikan `permission denied`.

## 6. Deploy frontend
Variabel lingkungan (Netlify: *Site settings → Environment variables*; Vercel: *Project → Settings → Environment Variables*):

| Nama | Nilai |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon public key |

- **Netlify**: *Add new site → Import from Git* → pilih repo ini. `netlify.toml` sudah mengatur build (`npm run build`, publish `dist`) dan fallback SPA.
- **Vercel**: *Add New → Project* → pilih repo. `vercel.json` sudah mengatur rewrite SPA.
- Tambahkan domain situs ke **Authentication → URL Configuration → Site URL**.

Tautan penting setelah deploy: `/` (landing), `/login` (admin), `/peserta` (peserta), `/live/<kode-sesi>` (monitor), `/hasil/<kode-sesi>` (hasil publik).

## 7. Gladi resik (WAJIB) — jangan menyatakan siap sebelum semua centang
Lakukan 1–2 hari sebelum lomba, di tempat lomba, dengan perangkat dan jaringan sesungguhnya.

- [ ] `verify_deployment.sql` semua `OK`.
- [ ] Superadmin masuk; membuat 1 Admin; menugaskan event; Admin masuk dan **tidak** melihat event lain.
- [ ] Impor 135 peserta dari Excel (3 × 15 kecamatan × 3 jenjang); unduh kode & PIN; cetak kartu.
- [ ] Impor/buat soal; buat sesi, babak, tambahkan soal; buka sesi.
- [ ] **Realtime**: buka monitor di TV; jalankan 1 soal; badge di panel kontrol menunjukkan *Realtime* (bukan *Polling*) dan leaderboard bergerak tanpa refresh. Bila *Polling*: periksa langkah 1.5. Aplikasi tetap benar dalam mode polling (jeda ≤ 1,5 dtk).
- [ ] ≥ 20 HP sungguhan login dan menjawab bersamaan lewat Wi-Fi lokasi. Perhatikan: 135 HP di satu Wi-Fi memakai satu IP publik — batas login server 300/menit per IP sudah memadai.
- [ ] Matikan Wi-Fi satu HP saat soal berjalan lalu nyalakan: harus tersinkron otomatis.
- [ ] Uji jeda/lanjut, batalkan soal, eliminasi, soal tambahan, umumkan pemenang (podium), ekspor Excel/PDF, cetak sertifikat.
- [ ] Hapus data gladi (hapus sesi uji; reset PIN peserta bila perlu) atau gunakan event terpisah.

### Rencana cadangan hari-H
- Siapkan hotspot cadangan untuk laptop operator dan monitor.
- Simpan hasil: tombol **Export Excel** di Hasil Perlombaan setelah setiap babak.
- Jika koneksi monitor putus, buka ulang `/live/<kode>` — state dipulihkan dari server.
- Backup database: Supabase → *Database → Backups* (atau `pg_dump`) sebelum dan sesudah lomba.

## 8. Pengembangan lokal tanpa Supabase
```bash
npm ci
scripts/pg-local.sh start            # PostgreSQL sementara (tanpa Docker)
node scripts/dev-api.mjs &           # emulator Supabase REST/Auth + data demo (HANYA untuk uji)
VITE_SUPABASE_URL=http://127.0.0.1:54400 VITE_SUPABASE_ANON_KEY=dev npm run dev
```
Akun demo: `super@demo.local` / `admin@demo.local`, kata sandi `rahasia123`. Emulator tidak meniru Realtime (aplikasi memakai polling) dan Storage (unggah gambar tidak tersedia).
