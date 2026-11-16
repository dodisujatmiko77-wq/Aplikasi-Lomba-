# Sistem Informasi Masjid

Dashboard informasi digital masjid: **layar TV** (16:9, juga layar berdiri & HP) + **CMS admin** yang mudah dipakai pengurus.
React + Vite + TypeScript · Tailwind · Framer Motion · Lucide · Supabase (PostgreSQL, Auth, Storage, Realtime) · PWA.

## Alamat penting
| Alamat | Fungsi |
|---|---|
| `/` | Layar TV. Otomatis membuka layar yang terakhir dipakai perangkat (auto start) |
| `/display/<kode>` | Layar tertentu (multi display), mis. `/display/utama`, `/display/serambi` |
| `/display/utama?waktu=2026-03-20T08:00:00+07:00` | Pratinjau tampilan pada waktu tertentu (uji mode salat/Jumat/Ramadan/Idulfitri) |
| `/login`, `/admin` | Halaman pengurus |

Pada layar TV: tekan **F** (atau tombol “Layar penuh”) untuk layar penuh; gerakkan mouse untuk memunculkan kontrol.

## Menjalankan
1. Buat proyek di [supabase.com](https://supabase.com). Di **SQL Editor**, jalankan berurutan: `supabase/migrations/0001_schema.sql` → `0002_security.sql` → `0003_storage_realtime.sql` → `0004_seed.sql` (aman dijalankan ulang).
2. `cp .env.example .env`, isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` (Project Settings › API). **Jangan** memasukkan `service_role` key.
3. `npm install && npm run dev`
4. Buka `/login`: akun pertama yang dibuat otomatis menjadi **Super Admin**. Akun berikutnya (daftar mandiri) nonaktif sampai diaktifkan Super Admin; Super Admin juga dapat menambah pengguna langsung dari menu **Pengguna**.
5. Isi **Profil Masjid**, lalu **Jadwal Salat** (pilih kota/lokasi, zona waktu, koreksi bila perlu).

Disarankan di Supabase › Authentication: matikan “Confirm email” bila pengurus tidak memakai email aktif, dan batasi pendaftaran bila tidak diperlukan.

## Deploy (Vercel / Netlify)
`vercel.json` dan `netlify.toml` sudah disediakan (build `npm run build`, output `dist`, fallback SPA). Isi dua variabel lingkungan di atas pada dashboard hosting, lalu deploy.

## Fitur utama
- **Layar TV**: header (logo, nama, alamat, tanggal Hijriah & Masehi, jam realtime), 8 kartu waktu salat dengan sorotan salat berikutnya dan hitung mundur, running text, slideshow (poster, video, pengumuman, agenda, laporan keuangan, donasi + QR, ayat & hadis), panel informasi bergantian (imam/khatib, kajian rutin, agenda, donasi, kontak).
- **Mode waktu salat**: layar penuh saat adzan → hitung mundur iqamah → layar tenang saat salat → kembali normal; imbauan senyap; semua durasi dan sakelar dapat diatur.
- **Mode khusus**: Jumat (khutbah, petugas), Ramadan (imsakiyah, hitung mundur berbuka/imsak), Idulfitri/Iduladha — otomatis dari kalender Hijriah atau dipilih manual.
- **Jadwal salat akurat**: dihitung **di perangkat layar** dari koordinat masjid (pustaka `adhan`; bawaan kriteria Kemenag RI 20°/18° + ihtiyat 2 menit), dengan koreksi menit per waktu, zona WIB/WITA/WIT, atau mode manual penuh.
- **Multi display**: satu admin, banyak layar (`display_devices`); tiap layar dapat memakai tata letak/ukuran teks sendiri; status online/offline terlihat di dashboard.
- **Realtime**: perubahan admin menaikkan `display_settings.data_version` (trigger database) → layar memuat ulang seketika; cadangan polling berkala bila realtime terputus.
- **Offline**: app shell (PWA), gambar, dan seluruh data terakhir tersimpan di perangkat; layar tetap berjalan dan jadwal tetap dihitung tanpa internet, lalu pulih otomatis.
- **Keamanan**: RLS di semua tabel; transaksi keuangan hanya untuk Super Admin/Admin Masjid; layar publik hanya membaca konten aktif dan **agregat** keuangan bila admin mengaktifkannya; peran dijaga trigger (tidak bisa menaikkan peran sendiri, Super Admin terakhir tidak bisa hilang); unggahan hanya ke folder masjid sendiri.

## Peran
| Peran | Akses |
|---|---|
| Super Admin | Semua menu + Pengguna |
| Admin Masjid | Semua kecuali Pengguna (profil, jadwal salat, konten, keuangan, display) |
| Operator Informasi | Pengumuman, Slideshow, Kegiatan, Ayat & Hadis |

## Pengujian
```bash
npm test                        # unit: jadwal salat, Hijriah, fase mode salat
scripts/pg-local.sh start       # PostgreSQL lokal sementara (tanpa Docker)
npm run test:db                 # 49 uji RLS/trigger/RPC di database
# uji UI penuh (browser) terhadap emulator API lokal:
node scripts/dev-api.mjs &
VITE_SUPABASE_URL=http://127.0.0.1:54410 VITE_SUPABASE_ANON_KEY=dev-anon npx vite --port 5199 &
npm run test:ui                 # 80 pemeriksaan alur admin + layar TV
```
`scripts/dev-api.mjs` hanya untuk pengujian (meniru PostgREST/Auth/Storage di atas PostgreSQL lokal); jangan dipakai di produksi.

## Catatan
- Jadwal otomatis mengikuti kriteria Kemenag RI tetapi berbasis perhitungan astronomis; bandingkan dengan jadwal resmi setempat dan gunakan kolom **Koreksi** bila ada selisih.
- Tanggal Hijriah memakai kalender Umm al-Qura bawaan peramban; sesuaikan dengan **Koreksi tanggal Hijriah** mengikuti penetapan pemerintah.
- Video slideshow maksimal 50 MB, gambar 5 MB (batas bucket `media`).
- Perubahan realtime murni (WebSocket) belum dapat diuji di lingkungan emulator; jalur polling diuji penuh, realtime mengandalkan Supabase Realtime pada tabel `display_settings` (didaftarkan di migrasi 0003).
