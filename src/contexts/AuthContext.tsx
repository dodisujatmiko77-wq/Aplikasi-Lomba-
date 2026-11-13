import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import { getOne, list } from '@/services/db'
import type { AdminAssignment, Profile, Role, RoleKey } from '@/types'

export type Permission = 'participants' | 'questions' | 'control' | 'reports'

interface AuthValue {
  loading: boolean
  user: User | null
  profile: Profile | null
  role: RoleKey | null
  isSuperadmin: boolean
  assignments: AdminAssignment[]
  can: (eventId: string | null | undefined, perm: Permission) => boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  reload: () => Promise<void>
}

const Ctx = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [role, setRole] = useState<RoleKey | null>(null)
  const [assignments, setAssignments] = useState<AdminAssignment[]>([])

  const loadProfile = useCallback(async (u: User | null) => {
    if (!u) {
      setProfile(null); setRole(null); setAssignments([])
      return
    }
    try {
      const p = await getOne<Profile>('profiles', { id: u.id })
      setProfile(p)
      if (p?.is_active) {
        const [roles, asg] = await Promise.all([
          list<Role>('roles'),
          list<AdminAssignment>('admin_assignments', { filters: { admin_id: u.id } }),
        ])
        setRole(roles.find((r) => r.id === p.role_id)?.key ?? null)
        setAssignments(asg)
      } else {
        setRole(null); setAssignments([])
      }
    } catch {
      setProfile(null); setRole(null); setAssignments([])
    }
  }, [])

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      setUser(data.session?.user ?? null)
      await loadProfile(data.session?.user ?? null)
      if (alive) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null)
        void loadProfile(null)
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setUser(session?.user ?? null)
        // di luar callback agar tidak mengunci antrean auth supabase-js
        setTimeout(() => void loadProfile(session?.user ?? null), 0)
      }
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const value = useMemo<AuthValue>(() => {
    const isSuperadmin = role === 'superadmin'
    return {
      loading, user, profile, role, isSuperadmin, assignments,
      can: (eventId, perm) => {
        if (isSuperadmin) return true
        const a = assignments.find((x) => x.event_id === eventId)
        if (!a) return false
        return { participants: a.can_manage_participants, questions: a.can_manage_questions, control: a.can_control_competition, reports: a.can_view_reports }[perm]
      },
      signIn: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw new Error(/invalid login/i.test(error.message) ? 'Email atau kata sandi salah' : error.message)
        setUser(data.user)
        await loadProfile(data.user)
      },
      signOut: async () => {
        await supabase.auth.signOut()
        setUser(null)
        await loadProfile(null)
      },
      reload: () => loadProfile(user),
    }
  }, [loading, user, profile, role, assignments, loadProfile])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('AuthProvider belum dipasang')
  return ctx
}
