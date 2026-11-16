import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LogIn, MonitorPlay, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Field } from '@/components/admin/FormFields'
import { MosqueMark } from '@/components/display/Ornament'
import { Alert, Button, Loading } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { errorMessage, supabase } from '@/lib/supabase'

export default function LoginPage() {
  const { session, loading, signIn, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/admin'
  const [first, setFirst] = useState<boolean | null>(null) // belum ada pengguna → buat Super Admin pertama
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('has_users').then(({ data, error }) => setFirst(error ? false : data === false))
  }, [])

  if (loading) return <div className="flex h-full items-center justify-center"><Loading /></div>
  if (session) return <Navigate to={from} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (first && name.trim().length < 2) errs.name = 'Nama wajib diisi'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Format email tidak valid'
    if (!password) errs.password = 'Kata sandi wajib diisi'
    else if (first && password.length < 8) errs.password = 'Minimal 8 karakter'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      if (first) {
        const { data, error } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { full_name: name.trim() } } })
        if (error) throw error
        if (!data.session) {
          setNotice('Akun Super Admin dibuat. Buka tautan konfirmasi yang dikirim ke email Anda, lalu masuk di halaman ini.')
          setFirst(false)
          setPassword('')
          return
        }
        await refreshProfile()
        toast.success('Akun Super Admin berhasil dibuat.')
      } else {
        await signIn(email.trim().toLowerCase(), password)
      }
      navigate(from, { replace: true })
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-950 p-4">
      <div className="islamic-pattern absolute inset-0 opacity-[0.06]" />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center text-white">
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gold-500/15 ring-1 ring-gold-500/50"><MosqueMark className="h-10 w-10 text-gold-400" /></span>
          <h1 className="mt-4 font-heading text-2xl font-bold tracking-wide">SISTEM INFORMASI <span className="text-gold-400">MASJID</span></h1>
          <p className="mt-1 text-sm text-emerald-100/75">Halaman pengurus — kelola informasi layar masjid</p>
        </div>
        <form onSubmit={submit} noValidate className="rounded-3xl bg-white p-7 shadow-2xl">
          {first === null ? <Loading text="Menyiapkan…" /> : (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">{first ? 'Buat akun Super Admin pertama' : 'Masuk'}</h2>
              {first && <Alert tone="green">Belum ada pengguna terdaftar. Akun pertama otomatis menjadi <b>Super Admin</b>.</Alert>}
              {notice && <Alert tone="blue">{notice}</Alert>}
              {first && (
                <Field label="Nama lengkap" error={errors.name} required htmlFor="name">
                  <input id="name" className={`input ${errors.name ? 'input-error' : ''}`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
                </Field>
              )}
              <Field label="Email" error={errors.email} required htmlFor="email">
                <input id="email" type="email" className={`input ${errors.email ? 'input-error' : ''}`} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </Field>
              <Field label="Kata sandi" error={errors.password} required htmlFor="password" hint={first ? 'Minimal 8 karakter.' : undefined}>
                <input id="password" type="password" className={`input ${errors.password ? 'input-error' : ''}`} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={first ? 'new-password' : 'current-password'} />
              </Field>
              <Button type="submit" loading={busy} icon={first ? <UserPlus /> : <LogIn />} className="w-full" data-testid="login-submit">{first ? 'Buat akun & masuk' : 'Masuk'}</Button>
            </div>
          )}
        </form>
        <Link to="/" className="mt-5 flex items-center justify-center gap-2 text-sm font-medium text-emerald-100/80 hover:text-white"><MonitorPlay className="h-4 w-4" /> Buka layar informasi</Link>
      </div>
    </div>
  )
}
