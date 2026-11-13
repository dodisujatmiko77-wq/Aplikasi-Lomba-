// Pembuatan & pengelolaan akun admin.
// Jalur utama: Edge Function `admin-users` (service role hanya ada di server).
// Jalur cadangan (bila Edge Function belum di-deploy): pendaftaran biasa lewat klien sementara,
// lalu Superadmin mengaktifkan profil lewat RPC. Jalur cadangan membutuhkan "Allow new users to sign up" aktif.
import { createEphemeralClient, supabase } from '@/lib/supabase/client'
import { rpc } from './db'

async function invoke(body: Record<string, unknown>): Promise<{ ok: true; data: Record<string, string> } | { ok: false; unavailable: boolean; message: string }> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (!error) {
    if (data?.error) return { ok: false, unavailable: false, message: String(data.error) }
    return { ok: true, data }
  }
  let message = error.message
  const ctx = (error as { context?: Response }).context
  const status = ctx?.status
  try {
    const j = await ctx?.clone().json()
    if (j?.error) message = String(j.error)
  } catch { /* abaikan */ }
  const unavailable = status === 404 || status === undefined || /Failed to send|not found|Failed to fetch/i.test(error.message)
  return { ok: false, unavailable, message }
}

export async function createAdminAccount(email: string, password: string, fullName: string): Promise<{ userId: string; needsEmailConfirm: boolean }> {
  const res = await invoke({ action: 'create', email, password, full_name: fullName })
  if (res.ok) return { userId: res.data.user_id, needsEmailConfirm: false }
  if (!res.unavailable) throw new Error(res.message)

  const temp = createEphemeralClient()
  const { data, error } = await temp.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName } } })
  if (error) throw new Error(/registered/i.test(error.message) ? 'Email sudah terdaftar' : error.message)
  if (!data.user) throw new Error('Akun gagal dibuat')
  await rpc('admin_set_profile', { p_user_id: data.user.id, p_full_name: fullName, p_is_active: true })
  return { userId: data.user.id, needsEmailConfirm: !data.session }
}

export async function resetAdminPassword(userId: string, password: string) {
  const res = await invoke({ action: 'reset_password', user_id: userId, password })
  if (!res.ok) throw new Error(res.unavailable ? 'Reset kata sandi memerlukan Edge Function admin-users (lihat docs/DEPLOYMENT.md), atau reset lewat Supabase Dashboard > Authentication.' : res.message)
}

export async function deleteAdminAccount(userId: string) {
  const res = await invoke({ action: 'delete', user_id: userId })
  if (!res.ok) throw new Error(res.unavailable ? 'Penghapusan akun memerlukan Edge Function admin-users. Sebagai gantinya, nonaktifkan akun.' : res.message)
}
