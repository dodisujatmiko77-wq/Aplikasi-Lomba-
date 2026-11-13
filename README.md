# Lomba Rangking 1

**Competition Management & Real-Time Scoring System** — Produk UPT SMPN 1 Baradatu · Dikembangkan oleh Dodi Sujatmiko
*"Siapa Cepat, Siapa Tepat, Dialah Juara!"*

Platform lomba cerdas cermat format Rangking 1: peserta menjawab lewat HP, skor dihitung server dari **kecepatan + ketepatan**, klasemen tampil real-time di layar utama.

```
skor benar = 100 + 50 × (sisa waktu / total waktu)      salah / tidak menjawab = 0
```

## Fitur
- **Admin** (Superadmin & Admin per event, RBAC + RLS): event, kecamatan, jenjang, peserta (import/export Excel, PIN ter-hash, kartu cetak), bank soal (pilihan ganda, benar/salah, jawaban singkat, gambar), paket soal, sesi, babak (normal, kecepatan, eliminasi, final, soal tambahan), panel kontrol operator, hasil, laporan (Excel/PDF/cetak/sertifikat), audit log.
- **Peserta** (`/peserta`, mobile-first): login kode + PIN, countdown jam server, kirim satu jawaban, reconnect otomatis.
- **Monitor** (`/live/:kode`, 16:9): 7 layar, leaderboard animatif, podium emas/perak/perunggu, fullscreen.
- **Keamanan**: skor & validasi di PostgreSQL (RPC atomik), waktu server, idempotency key, rate limit, kunci jawaban tak pernah keluar selama soal aktif, `service_role` hanya di Edge Function.

## Teknologi
React 18 · Vite · TypeScript · Tailwind · Radix/shadcn · Framer Motion · Recharts · Supabase (PostgreSQL, Auth, Realtime, Storage, Edge Functions).

## Dokumentasi
| Berkas | Isi |
|---|---|
| [docs/ARSITEKTUR.md](docs/ARSITEKTUR.md) | Arsitektur, ERD, mesin lomba, keamanan, asumsi |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Setup Supabase, bootstrap Superadmin, deploy Netlify/Vercel, gladi resik |
| [docs/PANDUAN_OPERATOR.md](docs/PANDUAN_OPERATOR.md) | Panduan operator hari-H |
| [docs/PENGUJIAN.md](docs/PENGUJIAN.md) | Matriks pengujian & status kesiapan |

## Perintah
```bash
npm ci && npm run dev          # pengembangan (butuh .env, lihat .env.example)
npm run build                  # produksi
npm test                       # unit test rumus skor
scripts/pg-local.sh start && npm run test:db && npm run test:load   # integrasi DB + 135 peserta
```

## Struktur
```
src/{components,layouts,pages,features,hooks,services,lib,contexts,types,utils,styles}
supabase/{migrations,functions,tests,seed.sql}
scripts/    # harness uji, simulasi 135 peserta, emulator API lokal, uji UI
docs/
```
