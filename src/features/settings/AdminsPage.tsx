import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { list, rpc } from '@/services/db'
import { createAdminAccount, deleteAdminAccount, resetAdminPassword } from '@/services/adminUsers'
import { useAuth } from '@/contexts/AuthContext'
import { useAction } from '@/hooks/useAction'
import { useConfirm } from '@/components/confirm'
import { Avatar, EmptyState, Loading, PageHeader } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { fmtDate } from '@/utils/format'
import type { AdminAssignment, Profile, Role } from '@/types'

export default function AdminsPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { busy, run } = useAction()
  const [form, setForm] = useState<{ email: string; password: string; full_name: string } | null>(null)
  const [reset, setReset] = useState<{ profile: Profile; password: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admins'],
    queryFn: async () => {
      const [profiles, roles, assignments] = await Promise.all([
        list<Profile>('profiles', { order: [{ column: 'created_at' }] }), list<Role>('roles'), list<AdminAssignment>('admin_assignments'),
      ])
      return { profiles, roles, assignments }
    },
  })
  const reload = () => qc.invalidateQueries({ queryKey: ['admins'] })
  const roleKey = (p: Profile) => data?.roles.find((r) => r.id === p.role_id)?.key ?? 'admin'

  const create = async () => {
    if (!form) return
    const ok = await run(async () => {
      if (form.password.length < 8) throw new Error('Kata sandi minimal 8 karakter')
      const res = await createAdminAccount(form.email, form.password, form.full_name)
      if (res.needsEmailConfirm) toast.info('Akun dibuat. Admin harus mengonfirmasi email sebelum bisa masuk.')
      await reload()
    }, 'Akun admin dibuat dan diaktifkan')
    if (ok) setForm(null)
  }
  const setProfile = (p: Profile, patch: { p_is_active?: boolean; p_role_key?: string }) =>
    run(async () => { await rpc('admin_set_profile', { p_user_id: p.id, ...patch }); await reload() }, 'Akun diperbarui')
  const del = async (p: Profile) => {
    if (await confirm({ title: `Hapus akun ${p.email}?`, description: 'Akun dan seluruh penugasannya dihapus permanen.', destructive: true }))
      await run(async () => { await deleteAdminAccount(p.id); await reload() }, 'Akun dihapus')
  }

  return (
    <div>
      <PageHeader title="Manajemen Admin" description="Buat akun Admin, atur role, dan aktifkan/nonaktifkan akses. Penugasan event diatur di menu Hak Akses."
        actions={<Button onClick={() => setForm({ email: '', password: '', full_name: '' })}><Plus /> Admin baru</Button>} />
      <Card>
        {isLoading ? <Loading /> : !data?.profiles.length ? <EmptyState title="Belum ada akun" /> : (
          <Table>
            <THead><TR><TH>Akun</TH><TH>Role</TH><TH>Event ditugaskan</TH><TH>Terdaftar</TH><TH>Aktif</TH><TH className="w-24" /></TR></THead>
            <TBody>
              {data.profiles.map((p) => {
                const self = p.id === user?.id
                const key = roleKey(p)
                return (
                  <TR key={p.id}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar name={p.full_name || p.email || '?'} size={34} />
                        <div><p className="font-semibold text-navy-900">{p.full_name || '(tanpa nama)'} {self && <Badge variant="blue">Anda</Badge>}</p><p className="text-xs text-muted-foreground">{p.email}</p></div>
                      </div>
                    </TD>
                    <TD>
                      {self ? <Badge variant="orange"><ShieldCheck className="h-3 w-3" /> Superadmin</Badge> : (
                        <SimpleSelect value={key} onChange={(v) => void setProfile(p, { p_role_key: v })} className="h-8 w-36" options={[{ value: 'admin', label: 'Admin' }, { value: 'superadmin', label: 'Superadmin' }]} />
                      )}
                    </TD>
                    <TD>{key === 'superadmin' ? <span className="text-muted-foreground">Semua event</span> : `${data.assignments.filter((a) => a.admin_id === p.id).length} event`}</TD>
                    <TD className="whitespace-nowrap text-muted-foreground">{fmtDate(p.created_at)}</TD>
                    <TD><Switch checked={p.is_active} disabled={self} onCheckedChange={(v) => void setProfile(p, { p_is_active: v })} aria-label="Aktif" /></TD>
                    <TD className="whitespace-nowrap text-right">
                      <Button size="icon" variant="ghost" onClick={() => setReset({ profile: p, password: '' })} aria-label="Reset kata sandi"><KeyRound /></Button>
                      {!self && <Button size="icon" variant="ghost" className="text-red-600" onClick={() => void del(p)} aria-label="Hapus"><Trash2 /></Button>}
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Admin baru</DialogTitle><DialogDescription>Akun langsung aktif dengan role Admin. Tugaskan event lewat menu Hak Akses.</DialogDescription></DialogHeader>
          {form && (
            <DialogBody className="space-y-4">
              <Field label="Nama lengkap"><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} autoFocus /></Field>
              <Field label="Email"><Input type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Kata sandi awal" hint="Minimal 8 karakter. Sampaikan ke admin secara langsung."><Input type="text" autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
            </DialogBody>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setForm(null)}>Batal</Button><Button loading={busy} onClick={() => void create()}>Buat akun</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reset} onOpenChange={(o) => !o && setReset(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Reset kata sandi</DialogTitle><DialogDescription>{reset?.profile.email}</DialogDescription></DialogHeader>
          {reset && <DialogBody><Field label="Kata sandi baru" hint="Minimal 8 karakter."><Input type="text" autoComplete="off" value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value })} autoFocus /></Field></DialogBody>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReset(null)}>Batal</Button>
            <Button loading={busy} onClick={async () => { if (reset && (await run(() => resetAdminPassword(reset.profile.id, reset.password), 'Kata sandi diganti'))) setReset(null) }}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
