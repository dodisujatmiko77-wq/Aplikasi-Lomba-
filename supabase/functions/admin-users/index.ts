// Edge Function: manajemen akun admin oleh Superadmin.
// Satu-satunya tempat service role key dipakai — tidak pernah dikirim ke browser.
//
// Deploy:  supabase functions deploy admin-users
// Body:    { action: 'create', email, password, full_name }
//          { action: 'reset_password', user_id, password }
//          { action: 'delete', user_id }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Metode tidak diizinkan' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const authHeader = req.headers.get('Authorization') ?? ''
  // 1) verifikasi pemanggil memakai JWT-nya sendiri (RLS berlaku)
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userErr } = await caller.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Tidak terautentikasi' }, 401)
  const { data: isSuper, error: roleErr } = await caller.rpc('is_superadmin')
  if (roleErr || isSuper !== true) return json({ error: 'Hanya Superadmin' }, 403)

  // 2) operasi istimewa dengan service role
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  let body: Record<string, string>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Body tidak valid' }, 400)
  }

  try {
    if (body.action === 'create') {
      const email = String(body.email ?? '').trim().toLowerCase()
      const password = String(body.password ?? '')
      if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Email tidak valid' }, 400)
      if (password.length < 8) return json({ error: 'Kata sandi minimal 8 karakter' }, 400)
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: String(body.full_name ?? '') },
      })
      if (error) return json({ error: error.message }, 400)
      // profil dibuat trigger handle_new_user (nonaktif); langsung aktifkan sebagai admin
      await admin.from('profiles').update({ is_active: true, full_name: String(body.full_name ?? '') }).eq('id', data.user.id)
      return json({ user_id: data.user.id })
    }
    if (body.action === 'reset_password') {
      if (String(body.password ?? '').length < 8) return json({ error: 'Kata sandi minimal 8 karakter' }, 400)
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: body.password })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }
    if (body.action === 'delete') {
      if (body.user_id === userData.user.id) return json({ error: 'Tidak dapat menghapus akun sendiri' }, 400)
      const { error } = await admin.auth.admin.deleteUser(body.user_id)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }
    return json({ error: 'Aksi tidak dikenal' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Kesalahan server' }, 500)
  }
})
