import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { insert, list, remove, update } from '@/services/db'
import { useEvent } from '@/contexts/EventContext'
import { useAction } from '@/hooks/useAction'
import { Avatar, EmptyState, Loading, PageHeader } from '@/components/common'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Checkbox, Switch } from '@/components/ui/switch'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { AdminAssignment, Profile, Role } from '@/types'

const PERMS: { key: keyof AdminAssignment; label: string }[] = [
  { key: 'can_manage_participants', label: 'Kelola peserta' },
  { key: 'can_manage_questions', label: 'Kelola soal' },
  { key: 'can_control_competition', label: 'Kontrol pertandingan' },
  { key: 'can_view_reports', label: 'Lihat laporan' },
]

export default function AccessPage() {
  const { events } = useEvent()
  const qc = useQueryClient()
  const { run } = useAction()
  const [adminId, setAdminId] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['access'],
    queryFn: async () => {
      const [profiles, roles, assignments] = await Promise.all([list<Profile>('profiles', { order: [{ column: 'full_name' }] }), list<Role>('roles'), list<AdminAssignment>('admin_assignments')])
      const adminRole = roles.find((r) => r.key === 'admin')?.id
      return { admins: profiles.filter((p) => p.role_id === adminRole), assignments }
    },
  })
  const reload = async () => { await qc.invalidateQueries({ queryKey: ['access'] }); await qc.invalidateQueries({ queryKey: ['admins'] }) }
  const current = data?.admins.find((a) => a.id === adminId) ?? data?.admins[0]
  const asg = (eventId: string) => data?.assignments.find((a) => a.admin_id === current?.id && a.event_id === eventId)

  const toggleEvent = (eventId: string, on: boolean) =>
    run(async () => {
      if (on) await insert('admin_assignments', { admin_id: current!.id, event_id: eventId })
      else await remove('admin_assignments', { admin_id: current!.id, event_id: eventId })
      await reload()
    }, on ? 'Event ditugaskan' : 'Penugasan dicabut')
  const togglePerm = (a: AdminAssignment, key: keyof AdminAssignment, v: boolean) =>
    run(async () => { await update('admin_assignments', { id: a.id }, { [key]: v }); await reload() })

  return (
    <div>
      <PageHeader title="Hak Akses" description="Tentukan event yang boleh dikelola setiap Admin beserta izinnya. Admin tidak dapat melihat event di luar penugasan ini." />
      {isLoading ? <Loading /> : !data?.admins.length ? (
        <Card><EmptyState title="Belum ada akun Admin" description="Buat akun di menu Manajemen Admin terlebih dahulu." /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="h-fit">
            <CardHeader><CardTitle>Admin</CardTitle></CardHeader>
            <CardContent className="space-y-1 p-2 pt-0">
              {data.admins.map((a) => (
                <button key={a.id} onClick={() => setAdminId(a.id)}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors', a.id === current?.id ? 'bg-navy-900 text-white' : 'hover:bg-secondary')}>
                  <Avatar name={a.full_name || a.email || '?'} size={32} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{a.full_name || a.email}</span>
                    <span className={cn('block truncate text-xs', a.id === current?.id ? 'text-navy-200' : 'text-muted-foreground')}>
                      {data.assignments.filter((x) => x.admin_id === a.id).length} event{!a.is_active && ' · nonaktif'}
                    </span>
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Event untuk {current?.full_name || current?.email}</CardTitle><CardDescription>Aktifkan event, lalu atur izin per modul.</CardDescription></CardHeader>
            {!events.length ? <EmptyState title="Belum ada event" /> : (
              <Table>
                <THead><TR><TH>Event</TH><TH>Ditugaskan</TH>{PERMS.map((p) => <TH key={p.key} className="text-center">{p.label}</TH>)}</TR></THead>
                <TBody>
                  {events.map((e) => {
                    const a = asg(e.id)
                    return (
                      <TR key={e.id}>
                        <TD className="font-medium text-navy-900">{e.name}</TD>
                        <TD><Switch checked={!!a} onCheckedChange={(v) => void toggleEvent(e.id, v)} aria-label={`Tugaskan ${e.name}`} /></TD>
                        {PERMS.map((p) => (
                          <TD key={p.key} className="text-center">
                            <Checkbox className="mx-auto" disabled={!a} checked={!!a?.[p.key]} onCheckedChange={(v) => a && void togglePerm(a, p.key, !!v)} aria-label={p.label} />
                          </TD>
                        ))}
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
