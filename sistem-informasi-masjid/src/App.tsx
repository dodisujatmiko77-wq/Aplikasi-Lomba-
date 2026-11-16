import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { Loading } from '@/components/ui'
import { AuthProvider } from '@/contexts/AuthContext'
import { isConfigured } from '@/lib/supabase'
import DisplayPage from '@/pages/DisplayPage'
import SetupPage from '@/pages/SetupPage'

// Halaman admin dimuat terpisah agar layar TV tetap ringan.
const AdminLayout = lazy(() => import('@/components/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })))
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const DashboardPage = lazy(() => import('@/pages/admin/DashboardPage'))
const ProfilePage = lazy(() => import('@/pages/admin/ProfilePage'))
const PrayerPage = lazy(() => import('@/pages/admin/PrayerPage'))
const AnnouncementsPage = lazy(() => import('@/pages/admin/AnnouncementsPage'))
const SlideshowPage = lazy(() => import('@/pages/admin/SlideshowPage'))
const EventsPage = lazy(() => import('@/pages/admin/EventsPage'))
const IslamicPage = lazy(() => import('@/pages/admin/IslamicPage'))
const FinancePage = lazy(() => import('@/pages/admin/FinancePage'))
const DisplaySettingsPage = lazy(() => import('@/pages/admin/DisplaySettingsPage'))
const UsersPage = lazy(() => import('@/pages/admin/UsersPage'))

const Fallback = () => <div className="flex h-full items-center justify-center"><Loading /></div>

export default function App() {
  if (!isConfigured) return <SetupPage />
  return (
    <BrowserRouter>
      <Suspense fallback={<Fallback />}>
        <Routes>
          {/* Auto start: alamat utama langsung menampilkan layar informasi. */}
          <Route path="/" element={<DisplayPage />} />
          <Route path="/display" element={<DisplayPage />} />
          <Route path="/display/:code" element={<DisplayPage />} />
          <Route element={<AuthProvider><AuthOutlet /></AuthProvider>}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="profil" element={<ProfilePage />} />
              <Route path="jadwal-salat" element={<PrayerPage />} />
              <Route path="pengumuman" element={<AnnouncementsPage />} />
              <Route path="slideshow" element={<SlideshowPage />} />
              <Route path="kegiatan" element={<EventsPage />} />
              <Route path="ayat-hadis" element={<IslamicPage />} />
              <Route path="keuangan" element={<FinancePage />} />
              <Route path="display" element={<DisplaySettingsPage />} />
              <Route path="pengguna" element={<UsersPage />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toaster position="top-right" richColors closeButton />
    </BrowserRouter>
  )
}

function AuthOutlet() {
  return <Suspense fallback={<Fallback />}><Outlet /></Suspense>
}
