# Laporan Pengujian

Perintah: `npm run test` (unit), `npm run test:db` (integrasi DB), `npm run test:load` (simulasi 135 peserta).
Prasyarat DB uji: `scripts/pg-local.sh start` (PostgreSQL 16 tanpa Docker). CI GitHub menjalankan semuanya pada setiap push.

| # | Pengujian (spesifikasi §21) | Cara | Status |
|---|---|---|---|
| 1 | Login Superadmin | `test:db` bootstrap + aktivasi; UI admin di Chromium | ✔ |
| 2 | Login Admin | `test:db` + UI Chromium (`ui-smoke`) | ✔ |
| 3 | Hak akses role | `test:db` bagian 2 (14 pemeriksaan: event lain, role, config global, izin per modul) | ✔ |
| 4 | RLS | `test:db` + `verify_deployment.sql` (anon tanpa akses tabel, hasil read-only) | ✔ |
| 5 | Registrasi peserta | `test:db` bagian 3 | ✔ |
| 6 | Import peserta | `test:db` (RPC) + `ui-export` (berkas .xlsx nyata, baris salah dilaporkan) | ✔ |
| 7 | Import soal | `test:db` (RPC, validasi kunci). Parser Excel soal belum diuji dengan berkas nyata | ◐ |
| 8–9 | Submit benar / salah | `test:db` bagian 7 | ✔ |
| 10 | Perhitungan bonus | 145 / 125 / 105 / 0 pada `test:db` + 14 tes unit + 135 peserta diverifikasi ulang terhadap rumus | ✔ |
| 11 | Deadline | `test:db` (tolak setelah deadline, tutup otomatis) | ✔ |
| 12 | Duplicate submission | `test:db` + simulasi (idempotency key sama/berbeda) | ✔ |
| 13 | Concurrent submission | `test:db` (8 paralel/peserta) + simulasi 135 + balapan `close_question` | ✔ |
| 14 | Realtime leaderboard | Jalur polling terbukti di browser; **jalur WebSocket Supabase belum diuji** (butuh proyek Supabase) | ◐ |
| 15 | Eliminasi | `test:db` bagian 9 (otomatis, manual beralasan, pembatalan soal) | ✔ |
| 16 | Tie breaker | `test:db` bagian 10–11 | ✔ |
| 17 | Reconnect | `ui-reconnect` (offline saat kirim, sinkron setelah online) — jalur polling | ✔ |
| 18 | Hasil akhir | `test:db` bagian 12 + UI | ✔ |
| 19 | Export laporan | `ui-export`: Excel peserta/hasil/riwayat, PDF hasil, PDF sertifikat | ✔ |
| 20 | Tampilan monitor | Screenshot 16:9 untuk ketujuh layar | ✔ |
| 21 | Tampilan HP | Screenshot 390×780 (login → soal → terkirim → hasil → selesai) | ✔ |
| 22 | Simulasi 135 peserta | `test:load`: 135 login serentak, 6 soal × (135 jawaban + duplikat + 3× polling), 3× berturut-turut lulus | ✔ |

## Hasil simulasi 135 peserta (PostgreSQL lokal, pool 30 koneksi)
Login serentak 135 (bcrypt): ±1,9 dtk total. Per soal: 207 submit (termasuk duplikat) + 425 polling dalam 1,6 dtk; p95 submit/polling < 5 ms di sisi database.
**Catatan jujur:** angka ini mengukur logika & kunci database saja, tanpa latensi jaringan, PostgREST, dan batas koneksi paket Supabase. Gladi resik di infrastruktur sebenarnya (DEPLOYMENT.md §7) tetap wajib.

## Cakupan & batas pengujian
- Harness menjalankan migrasi apa adanya pada PostgreSQL biasa dengan tiruan minimal skema Supabase (`auth.users`, `auth.uid()`, `realtime.send`, role `anon/authenticated`). RPC dipanggil dengan pola `SET ROLE` + klaim JWT seperti PostgREST, sehingga RLS & `GRANT` yang diuji adalah yang asli.
- **Belum diuji di Supabase asli:** WebSocket Realtime, Storage (unggah foto/gambar), Edge Function `admin-users`, Auth sungguhan. Semuanya tercakup pada daftar gladi resik.
- Emulator `scripts/dev-api.mjs` hanya untuk pengujian lokal.

## Status kesiapan
Seluruh pengujian kritis (skor, submit atomik, deadline, duplikat, konkurensi, RLS, eliminasi, tie-breaker, 135 peserta) **lulus**. Aplikasi **siap untuk gladi resik di Supabase**; dinyatakan siap lomba setelah daftar centang gladi resik terpenuhi.
