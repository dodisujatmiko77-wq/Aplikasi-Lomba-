import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { AppUser, UserRole } from '@/lib/types'

interface AuthValue {
  session: Session | null
  profile: AppUser | null
  loading: boolean
  role: UserRole | null
  /** masjid yang dikelola pengguna */
  mosqueId: string | null
  /** Super Admin / Admin Masjid: boleh mengelola pengaturan & keuangan */
  canManage: boolean
  isSuperAdmin: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const Ctx = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data } = await supabase.from('users').select('*').eq('id', userId).limit(1)
    setProfile((data?.[0] as AppUser | undefined) ?? null)
  }, [])

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      setSession(data.session)
      await loadProfile(data.session?.user.id)
      if (alive) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_OUT') setProfile(null)
      // Jangan memanggil Supabase langsung di dalam callback ini (dapat mengunci klien) — tunda.
      else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') setTimeout(() => void loadProfile(s?.user.id), 0)
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const value = useMemo<AuthValue>(() => {
    const active = profile?.is_active ? profile : null
    return {
      session,
      profile,
      loading,
      role: active?.role ?? null,
      mosqueId: active?.mosque_id ?? null,
      canManage: active?.role === 'super_admin' || active?.role === 'admin_masjid',
      isSuperAdmin: active?.role === 'super_admin',
      signIn: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        setSession(data.session)
        await loadProfile(data.user?.id)
      },
      signOut: async () => {
        await supabase.auth.signOut()
        setSession(null)
        setProfile(null)
      },
      refreshProfile: () => loadProfile(session?.user.id),
    }
  }, [session, profile, loading, loadProfile])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth harus dipakai di dalam AuthProvider')
  return v
}
