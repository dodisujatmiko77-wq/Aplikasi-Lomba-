import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ShieldX } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useEvent } from '@/contexts/EventContext'
import { EmptyState, Loading } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { loading, user, profile, role } = useAuth()
  const location = useLocation()
  if (loading) return <Loading className="min-h-screen" label="Memeriksa sesi…" />
  if (!user || !profile?.is_active || !role) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <>{children}</>
}

export function RequireSuperadmin({ children }: { children: ReactNode }) {
  const { isSuperadmin } = useAuth()
  if (!isSuperadmin) {
    return <EmptyState icon={<ShieldX className="h-6 w-6" />} title="Khusus Superadmin" description="Anda tidak memiliki hak akses ke halaman ini." />
  }
  return <>{children}</>
}

/** Membungkus halaman yang membutuhkan event aktif. */
export function NeedEvent({ children }: { children: (eventId: string) => ReactNode }) {
  const { eventId, loading } = useEvent()
  const { isSuperadmin } = useAuth()
  if (loading) return <Loading />
  if (!eventId) {
    return (
      <EmptyState
        title="Belum ada event"
        description={isSuperadmin ? 'Buat event perlombaan terlebih dahulu.' : 'Anda belum ditugaskan ke event mana pun. Hubungi Superadmin.'}
        action={isSuperadmin ? <Button asChild><Link to="/admin/events">Buat event</Link></Button> : undefined}
      />
    )
  }
  return <>{children(eventId)}</>
}
