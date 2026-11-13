import { lazy, Suspense } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { EventProvider } from '@/contexts/EventContext'
import { RequireAdmin, RequireSuperadmin } from '@/features/auth/guards'
import { Loading } from '@/components/common'
import { Button } from '@/components/ui/button'
import LandingPage from '@/pages/LandingPage'

const LoginPage = lazy(() => import('@/features/auth/LoginPage'))
const AdminLayout = lazy(() => import('@/layouts/AdminLayout'))
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'))
const EventsPage = lazy(() => import('@/features/events/EventsPage'))
const DistrictsPage = lazy(() => import('@/features/events/MasterDataPages').then((m) => ({ default: m.DistrictsPage })))
const LevelsPage = lazy(() => import('@/features/events/MasterDataPages').then((m) => ({ default: m.LevelsPage })))
const ParticipantsPage = lazy(() => import('@/features/participants/ParticipantsPage'))
const QuestionsPage = lazy(() => import('@/features/questions/QuestionsPage'))
const PackagesPage = lazy(() => import('@/features/questions/PackagesPage'))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'))
const AdminsPage = lazy(() => import('@/features/settings/AdminsPage'))
const AccessPage = lazy(() => import('@/features/settings/AccessPage'))
const AuditLogPage = lazy(() => import('@/features/settings/AuditLogPage'))
const GlobalSettingsPage = lazy(() => import('@/features/settings/GlobalSettingsPage'))
const SessionsPage = lazy(() => import('@/features/competition/SessionsPage'))
const SessionSetupPage = lazy(() => import('@/features/competition/SessionSetupPage'))
const ControlPanelPage = lazy(() => import('@/features/competition/ControlPanelPage'))
const ParticipantPage = lazy(() => import('@/features/competition/ParticipantPage'))
/* ROUTE-IMPORTS */

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-heading text-6xl font-extrabold text-navy-900">404</p>
      <p className="text-muted-foreground">Halaman tidak ditemukan.</p>
      <Button asChild><Link to="/">Kembali ke beranda</Link></Button>
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<Loading className="min-h-screen" label="Memuat…" />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/peserta" element={<ParticipantPage />} />
        {/* PUBLIC-ROUTES */}
        <Route path="/admin" element={<RequireAdmin><EventProvider><AdminLayout /></EventProvider></RequireAdmin>}>
          <Route index element={<DashboardPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="districts" element={<DistrictsPage />} />
          <Route path="levels" element={<LevelsPage />} />
          <Route path="participants" element={<ParticipantsPage />} />
          <Route path="questions" element={<QuestionsPage />} />
          <Route path="packages" element={<PackagesPage />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="sessions/:id" element={<SessionSetupPage />} />
          <Route path="control/:id" element={<ControlPanelPage />} />
          {/* ADMIN-ROUTES */}
          <Route path="settings" element={<SettingsPage />} />
          <Route path="admins" element={<RequireSuperadmin><AdminsPage /></RequireSuperadmin>} />
          <Route path="access" element={<RequireSuperadmin><AccessPage /></RequireSuperadmin>} />
          <Route path="audit" element={<RequireSuperadmin><AuditLogPage /></RequireSuperadmin>} />
          <Route path="global" element={<RequireSuperadmin><GlobalSettingsPage /></RequireSuperadmin>} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}
