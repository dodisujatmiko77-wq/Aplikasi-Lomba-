import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BarChart3, BookOpen, CalendarDays, ClipboardList, FileSpreadsheet, GraduationCap, KeyRound, LayoutDashboard, LogOut,
  MapPin, Menu, MonitorPlay, Package, ScrollText, Settings, Settings2, ShieldCheck, Trophy, Users, X, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useEvent } from '@/contexts/EventContext'
import { Logo, Avatar } from '@/components/common'
import { SimpleSelect } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean }
const MAIN: { group: string; items: NavItem[] }[] = [
  { group: 'Ringkasan', items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    group: 'Data',
    items: [
      { to: '/admin/events', label: 'Event Perlombaan', icon: CalendarDays },
      { to: '/admin/districts', label: 'Data Kecamatan', icon: MapPin },
      { to: '/admin/levels', label: 'Data Jenjang', icon: GraduationCap },
      { to: '/admin/participants', label: 'Data Peserta', icon: Users },
      { to: '/admin/questions', label: 'Bank Soal', icon: BookOpen },
      { to: '/admin/packages', label: 'Paket Soal', icon: Package },
    ],
  },
  {
    group: 'Pertandingan',
    items: [
      { to: '/admin/sessions', label: 'Sesi Kompetisi', icon: ClipboardList },
      { to: '/admin/scoreboard', label: 'Live Scoreboard', icon: MonitorPlay },
      { to: '/admin/results', label: 'Hasil Perlombaan', icon: Trophy },
      { to: '/admin/reports', label: 'Laporan', icon: FileSpreadsheet },
      { to: '/admin/settings', label: 'Pengaturan', icon: Settings },
    ],
  },
]
const SUPER: NavItem[] = [
  { to: '/admin/admins', label: 'Manajemen Admin', icon: ShieldCheck },
  { to: '/admin/access', label: 'Hak Akses', icon: KeyRound },
  { to: '/admin/audit', label: 'Audit Log', icon: ScrollText },
  { to: '/admin/global', label: 'Pengaturan Global', icon: Settings2 },
]

function Item({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors',
          isActive ? 'bg-white/10 text-white' : 'text-navy-200 hover:bg-white/5 hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span className={cn('absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-flame-500 transition-opacity', isActive ? 'opacity-100' : 'opacity-0')} />
          <item.icon className={cn('h-[18px] w-[18px]', isActive ? 'text-electric-400' : 'text-navy-300 group-hover:text-navy-100')} />
          {item.label}
        </>
      )}
    </NavLink>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { isSuperadmin } = useAuth()
  return (
    <div className="flex h-full flex-col bg-navy-900 text-white">
      <div className="flex items-center gap-3 px-5 pb-4 pt-5">
        <Logo size={48} />
        <div className="leading-tight">
          <p className="font-heading text-[15px] font-bold tracking-tight">Lomba Rangking 1</p>
          <p className="text-[11px] text-navy-300">UPT SMPN 1 Baradatu</p>
        </div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6 pt-2">
        {MAIN.map((g) => (
          <div key={g.group}>
            <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-navy-400">{g.group}</p>
            <div className="space-y-0.5">{g.items.map((i) => <Item key={i.to} item={i} onNavigate={onNavigate} />)}</div>
          </div>
        ))}
        {isSuperadmin && (
          <div>
            <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-flame-400">Superadmin</p>
            <div className="space-y-0.5">{SUPER.map((i) => <Item key={i.to} item={i} onNavigate={onNavigate} />)}</div>
          </div>
        )}
      </nav>
      <div className="border-t border-white/10 px-5 py-3 text-[11px] leading-relaxed text-navy-300">
        Siapa Cepat, Siapa Tepat,<br />Dialah Juara!
      </div>
    </div>
  )
}

export default function AdminLayout() {
  const { profile, role, signOut } = useAuth()
  const { events, eventId, setEventId } = useEvent()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const hideEventPicker = ['/admin/events', '/admin/districts', '/admin/levels', '/admin/admins', '/admin/access', '/admin/global'].some((p) => location.pathname.startsWith(p))

  return (
    <div className="min-h-screen bg-background">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 lg:block"><Sidebar /></aside>
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 shadow-2xl">
            <Sidebar onNavigate={() => setOpen(false)} />
            <button className="absolute right-2 top-3 rounded-md p-1.5 text-navy-200 hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Tutup menu"><X className="h-5 w-5" /></button>
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-white/90 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu"><Menu /></Button>
          {!hideEventPicker && (
            <div className="flex min-w-0 items-center gap-2">
              <span className="hidden text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:block">Event</span>
              {events.length ? (
                <SimpleSelect
                  value={eventId}
                  onChange={setEventId}
                  options={events.map((e) => ({ value: e.id, label: e.name }))}
                  className="h-9 w-[min(60vw,22rem)] border-navy-200 font-semibold text-navy-900"
                />
              ) : (
                <span className="text-sm text-muted-foreground">Belum ada event</span>
              )}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" asChild className="hidden sm:inline-flex">
              <a href="/" target="_blank" rel="noreferrer"><BarChart3 /> Halaman publik</a>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-secondary">
                <Avatar name={profile?.full_name || profile?.email || 'A'} size={32} />
                <span className="hidden text-left leading-tight sm:block">
                  <span className="block max-w-[10rem] truncate text-sm font-semibold text-navy-900">{profile?.full_name || profile?.email}</span>
                  <span className="block text-[11px] capitalize text-muted-foreground">{role}</span>
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{profile?.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => void signOut()}><LogOut /> Keluar</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
