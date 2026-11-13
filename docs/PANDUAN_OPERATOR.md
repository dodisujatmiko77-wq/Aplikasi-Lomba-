# Panduan Operator — Lomba Rangking 1

## Peralatan
- 1 laptop operator (panel kontrol) — `/admin/control/<sesi>`
- 1 layar utama TV/proyektor (monitor) — `/live/<kode-sesi>`, tekan **F** atau tombol di pojok untuk layar penuh
- HP peserta — `/peserta` (QR tersedia di menu **Live Scoreboard**)

## A. Persiapan (H-7 s.d. H-1)
1. **Event Perlombaan** → pastikan event sudah dibuat (Superadmin).
2. **Data Peserta** → *Template* → isi Excel (No Peserta, Nama, Sekolah, Jenjang, Kecamatan) → *Import Excel*.
   Unduh **kode & PIN** dan **cetak kartu** segera — PIN hanya tampil sekali. Lupa PIN? Gunakan ikon kunci (*Reset PIN*).
3. **Bank Soal** → buat/impor soal. Tiga tipe: pilihan ganda, benar/salah, jawaban singkat (jawaban diterima bisa lebih dari satu).
4. **Paket Soal** (opsional) → kelompokkan soal.
5. **Pengaturan** → cek penilaian default: 100 poin + bonus kecepatan hingga 50, 20 detik.
6. **Sesi Kompetisi** → *Sesi baru* per jenjang → **Atur**:
   - Tab **Peserta**: *Tambahkan semua* (hanya peserta terverifikasi pada jenjang itu).
   - Tab **Babak & soal**: tambah babak, pilih mode, tambahkan soal/paket.

## B. Mode babak
| Mode | Kapan dipakai |
|---|---|
| Normal | Penyisihan. Semua menjawab semua soal. |
| Kecepatan | Seperti normal; peringkat mendahulukan waktu benar tercepat. |
| Eliminasi | Gugur setelah N kesalahan / di bawah ambang skor / keputusan operator (wajib beralasan, tercatat). |
| Final | Top-N otomatis atau roster manual; skor bisa di-reset ke 0. |

## C. Hari-H — alur di Panel Kontrol
1. **Buka sesi untuk peserta** → peserta login dan menunggu. Monitor menampilkan layar tunggu + jumlah peserta online.
2. **Mulai Babak** → **Tayangkan soal** → hitung mundur 3-2-1 di monitor & HP → peserta menjawab.
3. **Tutup soal** (otomatis tertutup saat waktu habis) → monitor *memproses jawaban*.
4. **Tampilkan jawaban benar** → monitor menunjukkan kunci, statistik opsi, penjawab tercepat.
5. **Tampilkan leaderboard** (opsional) → **Soal berikutnya**.
6. Selesai soal → **Akhiri babak** → babak berikutnya (eliminasi/final) atau lanjut ke pemenang.
7. Bila ada **seri di tiga besar**: **Soal tambahan** → pilih peserta seri + soal → mulai babak tambahan.
8. **Umumkan pemenang** → monitor menampilkan podium animatif; hasil otomatis terpublikasi.

Kontrol lain: **Jeda/Lanjutkan** (waktu menjawab tidak berkurang), **Batalkan soal** (skor soal itu dibatalkan, peserta yang gugur karenanya dikembalikan), **Eliminasi/Kembalikan** manual lewat ikon di klasemen.

## D. Aturan penting
- Satu jawaban per soal, **tidak bisa diubah**. Waktu dicatat server.
- Peserta tidak melihat benar/salah sampai operator menekan *Tampilkan jawaban benar*.
- Kunci jawaban tidak pernah dikirim ke monitor/HP selama soal aktif.
- Semua tindakan operator tercatat di **Audit Log** (Superadmin).

## E. Setelah lomba
- **Hasil Perlombaan** → filter, Excel/PDF/Cetak. **Publikasikan hasil** agar tampil di landing page.
- **Laporan** → ranking, riwayat jawaban, rekap kecamatan/sekolah, **sertifikat**.

## F. Troubleshooting
| Gejala | Tindakan |
|---|---|
| Badge *Polling* di panel kontrol | Aman. Realtime sedang tidak tersambung; data tetap sinkron ≤ 1,5 dtk. Cek pengaturan Realtime Supabase. |
| Peserta "Sesi login berakhir" | Login lagi. Login baru di HP lain mencabut login lama (satu perangkat per peserta). |
| Peserta terkunci | 5× salah PIN → terkunci 5 menit, atau *Reset PIN*. |
| Monitor kosong/putus | Muat ulang `/live/<kode>`; state dipulihkan dari server. |
| Soal tak bisa ditayangkan | Pastikan babak sudah *dimulai*, soal tersisa, dan soal sebelumnya sudah ditutup. |
