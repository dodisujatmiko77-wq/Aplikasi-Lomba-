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
