# Skrip pemeliharaan

Skrip di folder ini **dijalankan manual** di Supabase SQL Editor. Tidak ikut migrasi otomatis.

| Berkas | Fungsi |
|---|---|
| `kosongkan-data.sql` | Menghapus **seluruh data lomba** (event, peserta, soal, paket, sesi, jawaban, skor, hasil, pengumuman). Akun admin, kecamatan, jenjang, kategori soal, dan branding dipertahankan. **Tidak bisa dibatalkan.** |
| `kosongkan-audit-log.sql` | Menghapus **seluruh Audit Log** (riwayat tindakan admin/operator). Tidak bisa dibatalkan. |

Catatan: foto peserta dan gambar soal di Storage tidak terhapus oleh SQL; kosongkan manual (bucket `participant-photos`, `question-images`). Jangan hapus bucket `apk` dan `branding`.
Jika ada tabel baru yang menyimpan data lomba, perbarui skrip ini.
