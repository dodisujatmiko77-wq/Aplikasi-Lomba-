import { useRef, useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { BookOpenText, CalendarDays, Clock4, Images, KeyRound, LayoutDashboard, Landmark, LogOut, Megaphone, Menu, MonitorPlay, MonitorSmartphone, Users, Wallet, X } from 'lucide-react'
import { Alert, Button, Loading } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { ROLE_LABEL } from '@/lib/constants'
import { MosqueMark } from '@/components/display/Ornament'
import type { UserRole } from '@/lib/types'
import { ChangePasswordModal } from './ChangePassword'

const ALL: UserRole[] = ['super_admin', 'admin_masjid', 'operator']
const MANAGER: UserRole[] = ['super_admin', 'admin_masjid']

export const NAV: { to: string; label: string; icon: typeof Users; roles: UserRole[]; end?: boolean }[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, roles: ALL, end: true },
  { to: '/admin/profil', label: 'Profil Masjid', icon: Landmark, roles: MANAGER },
  { to: '/admin/jadwal-salat', label: 'Jadwal Salat', icon: Clock4, roles: MANAGER },
  { to: '/admin/pengumuman', label: 'Pengumuman', icon: Megaphone, roles: ALL },
  { to: '/admin/slideshow', label: 'Slideshow', icon: Images, roles: ALL },
  { to: '/admin/kegiatan', label: 'Kegiatan Masjid', icon: CalendarDays, roles: ALL },
  { to: '/admin/ayat-hadis', label: 'Ayat & Hadis', icon: BookOpenText, roles: ALL },
  { to: '/admin/keuangan', label: 'Keuangan & Donasi', icon: Wallet, roles: MANAGER },
  { to: '/admin/display', label: 'Pengaturan Display', icon: MonitorSmartphone, roles: MANAGER },
  { to: '/admin/pengguna', label: 'Pengguna', icon: Users, roles: ['super_admin'] },
]

export function AdminLayout() {
  const { session, profile, loading, role, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const leaving = useRef(false) // keluar atas kemauan sendiri → jangan ingat halaman terakhir untuk login berikutnya
  const location = useLocation()

  if (loading) return <div className="flex h-full items-center justify-center"><Loading text="Memeriksa sesi…" /></div>
  if (!session) return <Navigate to="/login" replace state={leaving.current ? undefined : { from: location.pathname }} />
  if (!profile || !role) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50 p-6">
        <div className="card max-w-md p-8 text-center">
          <h1 className="text-xl font-semibold">Akun belum aktif</h1>
          <p className="mt-2 text-sm text-slate-600">
            Akun <b>{session.user.email}</b> sudah terdaftar tetapi belum diaktifkan. Hubungi Super Admin masjid untuk mengaktifkan akun dan menetapkan peran Anda.
          </p>
          <Button className="mt-6" variant="secondary" icon={<LogOut />} onClick={() => void signOut()}>Keluar</Button>
        </div>
      </div>
    )
  }

  const items = NAV.filter((n) => n.roles.includes(role))
  const current = NAV.filter((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to))).pop()
  const forbidden = current && !current.roles.includes(role)

  const sidebar = (
    <div className="flex h-full flex-col bg-gradient-to-b from-emerald-900 via-emerald-950 to-emerald-950 text-emerald-50">
      <div className="islamic-pattern pointer-events-none absolute inset-0 opacity-[0.04]" />
      <div className="relative flex items-center gap-3 px-5 py-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gold-500/15 ring-1 ring-gold-500/40"><MosqueMark className="h-7 w-7 text-gold-400" /></span>
        <div className="leading-tight">
          <p className="font-heading text-sm font-bold tracking-wide">SISTEM INFORMASI</p>
          <p className="font-heading text-sm font-bold tracking-wide text-gold-400">MASJID</p>
        </div>
      </div>
      <nav className="relative flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Menu admin">
        {items.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)}
            className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${isActive ? 'bg-white/12 text-white shadow-inner ring-1 ring-white/10' : 'text-emerald-100/75 hover:bg-white/5 hover:text-white'}`}>
            {({ isActive }) => <><n.icon className={`h-[18px] w-[18px] ${isActive ? 'text-gold-400' : ''}`} />{n.label}</>}
          </NavLink>
        ))}
      </nav>
      <div className="relative space-y-3 border-t border-white/10 p-4">
        <a href="/" target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-gold-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-gold-400">
          <MonitorPlay className="h-4 w-4" /> Buka Layar TV
        </a>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 font-heading text-sm font-semibold">{(profile.full_name || profile.email).charAt(0).toUpperCase()}</div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium">{profile.full_name || profile.email}</p>
            <p className="truncate text-xs text-emerald-200/70">{ROLE_LABEL[role]}</p>
          </div>
          <button onClick={() => setPwOpen(true)} title="Ganti kata sandi" aria-label="Ganti kata sandi" className="rounded-lg p-2 text-emerald-100/70 hover:bg-white/10 hover:text-white"><KeyRound className="h-4 w-4" /></button>
          <button onClick={() => { leaving.current = true; void signOut() }} title="Keluar" aria-label="Keluar" className="rounded-lg p-2 text-emerald-100/70 hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-full bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-2xl">{sidebar}</aside>
          <button className="absolute left-[19rem] top-4 rounded-full bg-white p-2 shadow" onClick={() => setOpen(false)} aria-label="Tutup menu"><X className="h-5 w-5" /></button>
        </div>
      )}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Buka menu" className="rounded-lg p-2 hover:bg-slate-100"><Menu className="h-5 w-5" /></button>
        <p className="font-heading text-sm font-bold text-emerald-900">{current?.label ?? 'Admin'}</p>
      </header>
      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {forbidden ? <Alert tone="red">Peran Anda ({ROLE_LABEL[role]}) tidak memiliki akses ke halaman ini.</Alert>
            : !profile.mosque_id ? <Alert tone="amber">Akun Anda belum terhubung ke profil masjid. Hubungi Super Admin.</Alert>
            : <Outlet />}
        </div>
      </main>
      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  )
}
