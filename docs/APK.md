# Aplikasi Android (APK) — Lomba Rangking 1

Aplikasi web dibungkus dengan **Capacitor** menjadi aplikasi Android. Tampilan dan fiturnya sama dengan situs
`https://lomba-rangking1.vercel.app`; data tetap berasal dari Supabase yang sama (konfigurasi di `public/config.js`).
Peserta, operator, dan Superadmin memakai aplikasi yang sama (beranda → pilih *Masuk sebagai peserta* atau *Admin*).

## Mengunduh APK
APK dibangun otomatis oleh GitHub Actions (`.github/workflows/build-apk.yml`) setiap ada perubahan pada aplikasi.

1. Buka repo di GitHub → **Releases** → rilis **“APK terbaru”** → unduh **`Lomba-Rangking-1.apk`**.
   (Atau **Actions** → run “Build APK Android” terbaru → bagian *Artifacts* → `Lomba-Rangking-1-APK`.)
2. Kirim berkas ke HP (WhatsApp/kabel/Google Drive) lalu buka.
3. Izinkan **“Pasang aplikasi dari sumber tidak dikenal”** untuk aplikasi yang Anda pakai membuka berkas.
4. Ketuk **Pasang**. Ikon **Lomba Rangking 1** muncul di layar utama.

Membangun ulang manual: GitHub → **Actions** → *Build APK Android* → **Run workflow**.

## Tautan unduh di situs sendiri (tanpa membagikan alamat GitHub)
Peserta cukup diberi **`https://lomba-rangking1.vercel.app/unduh`** (halaman unduh dengan petunjuk pasang) atau tautan langsung
**`https://lomba-rangking1.vercel.app/Lomba-Rangking-1.apk`**. Situs meneruskan berkas dari bucket Storage publik `apk` di Supabase.

Penyiapan (sekali):
1. Supabase → SQL Editor → jalankan `supabase/migrations/0008_apk_bucket.sql` (membuat bucket publik `apk`).
2. Unduh `Lomba-Rangking-1.apk` dari Release GitHub, lalu Supabase → **Storage → apk → Upload** (nama berkas harus persis `Lomba-Rangking-1.apk`; pilih *replace* bila sudah ada).
3. Setelah Vercel selesai memproses push terbaru, buka `/unduh` dan coba unduh.

Otomatis (opsional): tambahkan secret **`SUPABASE_SERVICE_ROLE_KEY`** di GitHub → Settings → Secrets and variables → Actions. Setiap build APK lalu mengunggah APK baru ke bucket itu sendiri.
Kunci `service_role` bersifat rahasia (jangan ditaruh di kode atau dibagikan).

Agar kode sumber tidak bisa dikloning orang: ubah repositori GitHub menjadi **Private** (Settings → General → Danger Zone → Change visibility). Build APK dan deploy Vercel tetap berjalan.

## Tanda tangan APK
| Kondisi | Hasil |
|---|---|
| Tanpa konfigurasi tambahan (bawaan) | Ditandatangani kunci debug standar di `android/app/debug.keystore`. Cocok untuk dipasang langsung ke HP; versi baru dapat menimpa versi lama. **Tidak untuk Google Play.** |
| Secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` diisi di *Settings → Secrets and variables → Actions* | Ditandatangani kunci rilis milik Anda (wajib untuk Google Play). |

Membuat kunci rilis (simpan berkas dan kata sandinya baik-baik; jika hilang, aplikasi tidak bisa diperbarui di Play Store):
```bash
keytool -genkeypair -v -keystore rilis.keystore -alias lomba -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 rilis.keystore   # isi hasilnya ke secret ANDROID_KEYSTORE_BASE64
```

## Mengubah aplikasi lalu membuat APK baru
Cukup ubah kode web seperti biasa dan push; APK terbaru muncul di Release setelah ±5 menit.
Nomor versi bertambah otomatis (`1.0.<nomor build>`).

Bangun lokal (butuh JDK 21 dan Android SDK):
```bash
npm run android:sync     # build web + salin ke android/
cd android && ./gradlew assembleRelease
# hasil: android/app/build/outputs/apk/release/app-release.apk
```

## Catatan teknis
- ID aplikasi: `id.sch.smpn1baradatu.lombarangking1`; Android minimum 7.0 (API 24).
- Aset web ikut tertanam di APK; yang dibutuhkan hanya internet untuk memanggil Supabase.
- Layar HP peserta dijaga tetap menyala selama masuk (Wake Lock).
- Mengubah alamat Supabase: edit `public/config.js`, lalu bangun ulang APK.
