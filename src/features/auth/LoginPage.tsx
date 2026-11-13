import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { ArrowLeft, LockKeyhole, ShieldAlert } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { isSupabaseConfigured } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Logo } from '@/components/common'

export default function LoginPage() {
  const { user, profile, role, signIn, signOut, loading } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && user && profile?.is_active && role) {
    const to = (location.state as { from?: string } | null)?.from ?? '/admin'
    return <Navigate to={to} replace />
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk')
    } finally {
      setBusy(false)
    }
  }

  const pending = !loading && user && (!profile || !profile.is_active || !role)

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="stage-bg relative hidden overflow-hidden text-white lg:block">
        <div className="grid-lines absolute inset-0" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <Logo size={44} />
            <span className="font-heading text-lg font-bold">Lomba Rangking 1</span>
          </div>
          <div>
            <p className="mb-4 inline-block rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-electric-400">Panel Operator</p>
            <h1 className="max-w-md text-4xl font-extrabold leading-tight text-balance">Siapa Cepat, Siapa Tepat, <span className="text-flame-400">Dialah Juara!</span></h1>
            <p className="mt-4 max-w-md text-navy-200">Kelola peserta, soal, dan jalannya pertandingan dari satu tempat. Skor dihitung server, klasemen tampil langsung.</p>
          </div>
          <p className="text-xs text-navy-300">Produk UPT SMPN 1 Baradatu · Dikembangkan oleh Dodi Sujatmiko</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Beranda</Link>
          <div className="mb-6 flex items-center gap-3 lg:hidden"><Logo /><span className="font-heading font-bold">Lomba Rangking 1</span></div>
          <h2 className="text-2xl font-bold text-navy-900">Masuk Admin</h2>
          <p className="mt-1 text-sm text-muted-foreground">Khusus Superadmin dan Admin. Peserta masuk lewat <Link className="font-semibold text-electric-600 hover:underline" to="/peserta">halaman peserta</Link>.</p>

          {!isSupabaseConfigured && (
            <div className="mt-5 flex gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Aplikasi belum terhubung ke Supabase. Isi <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code> lalu bangun ulang.</span>
            </div>
          )}

          {pending ? (
            <div className="mt-6 rounded-xl border bg-white p-5 text-sm shadow-soft">
              <p className="font-semibold text-navy-900">Akun belum aktif</p>
              <p className="mt-1 text-muted-foreground">Akun <b>{user?.email}</b> sudah terdaftar tetapi belum diaktifkan oleh Superadmin.</p>
              <Button variant="outline" className="mt-4" onClick={() => void signOut()}>Keluar</Button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <Field label="Email">
                <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@sekolah.sch.id" />
              </Field>
              <Field label="Kata sandi">
                <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <Button type="submit" size="lg" className="w-full" loading={busy}><LockKeyhole /> Masuk</Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
