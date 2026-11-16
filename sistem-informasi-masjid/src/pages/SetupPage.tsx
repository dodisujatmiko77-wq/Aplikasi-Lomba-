import { MosqueMark } from '@/components/display/Ornament'

/** Ditampilkan bila variabel lingkungan Supabase belum diisi. */
export default function SetupPage() {
  return (
    <div className="relative flex min-h-full items-center justify-center bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-950 p-6 text-white">
      <div className="islamic-pattern absolute inset-0 opacity-[0.06]" />
      <div className="relative w-full max-w-2xl rounded-3xl bg-white/5 p-8 ring-1 ring-white/10 backdrop-blur">
        <MosqueMark className="h-14 w-14 text-gold-400" />
        <h1 className="mt-4 font-heading text-2xl font-bold">Sistem Informasi Masjid — penyiapan</h1>
        <p className="mt-2 text-emerald-100/80">Aplikasi belum terhubung ke Supabase. Lakukan langkah berikut satu kali:</p>
        <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-emerald-50/90">
          <li>Buat proyek di <b>supabase.com</b>, lalu buka <b>SQL Editor</b> dan jalankan berkas di <code className="rounded bg-black/30 px-1.5 py-0.5">supabase/migrations</code> secara berurutan (0001 → 0004).</li>
          <li>Salin <code className="rounded bg-black/30 px-1.5 py-0.5">.env.example</code> menjadi <code className="rounded bg-black/30 px-1.5 py-0.5">.env</code>, isi <code className="rounded bg-black/30 px-1.5 py-0.5">VITE_SUPABASE_URL</code> dan <code className="rounded bg-black/30 px-1.5 py-0.5">VITE_SUPABASE_ANON_KEY</code> (Project Settings › API). Di Vercel/Netlify, isi pada menu Environment Variables lalu deploy ulang.</li>
          <li>Buka <code className="rounded bg-black/30 px-1.5 py-0.5">/login</code> untuk membuat akun Super Admin pertama.</li>
        </ol>
        <p className="mt-5 text-xs text-emerald-100/60">Panduan lengkap ada di README.md.</p>
      </div>
    </div>
  )
}
