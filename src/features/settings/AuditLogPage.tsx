import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { listWithCount, type Filters } from '@/services/db'
import { useEvent } from '@/contexts/EventContext'
import { describeAudit } from '@/features/dashboard/DashboardPage'
import { EmptyState, Loading, PageHeader, Pager } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { SimpleSelect } from '@/components/ui/select'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { fmtDateTime } from '@/utils/format'

interface AuditRow { id: string; actor_label: string | null; action: string; entity: string; entity_id: string | null; event_id: string | null; details: Record<string, unknown>; created_at: string }
const PAGE = 30
const ACTIONS = ['insert', 'update', 'delete', 'open_session', 'start_round', 'show_question', 'close_question', 'reveal_answer', 'cancel_question', 'pause_session', 'resume_session', 'end_round', 'eliminate_participant', 'reinstate_participant', 'set_round_roster', 'create_tiebreak', 'announce_winners', 'import_participants', 'import_questions', 'reset_pin']
const CRITICAL = new Set(['eliminate_participant', 'reinstate_participant', 'cancel_question', 'set_round_roster', 'announce_winners', 'delete', 'reset_pin', 'cancel_session'])

export default function AuditLogPage() {
  const { events } = useEvent()
  const [page, setPage] = useState(0)
  const [eventId, setEventId] = useState('')
  const [action, setAction] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const filters: Filters = { event_id: eventId || undefined, action: action || undefined }
  const { data, isLoading } = useQuery({
    queryKey: ['audit', page, eventId, action],
    queryFn: () => listWithCount<AuditRow>('audit_logs', { filters, order: [{ column: 'created_at', ascending: false }], range: [page * PAGE, page * PAGE + PAGE - 1], count: true }),
    placeholderData: (prev) => prev,
  })
  const eventName = (id: string | null) => events.find((e) => e.id === id)?.name ?? '—'

  return (
    <div>
      <PageHeader title="Audit Log" description="Jejak seluruh perubahan data dan tindakan operator. Catatan tidak dapat diubah atau dihapus dari aplikasi." />
      <Card>
        <div className="flex flex-wrap gap-2 border-b p-3">
          <SimpleSelect value={eventId} onChange={(v) => { setEventId(v); setPage(0) }} allLabel="Semua event" options={events.map((e) => ({ value: e.id, label: e.name }))} className="w-64" />
          <SimpleSelect value={action} onChange={(v) => { setAction(v); setPage(0) }} allLabel="Semua tindakan" options={ACTIONS.map((a) => ({ value: a, label: describeAudit(a, '').trim() }))} className="w-56" />
        </div>
        {isLoading ? <Loading /> : !data?.rows.length ? <EmptyState title="Belum ada catatan" /> : (
          <>
            <Table>
              <THead><TR><TH className="w-8" /><TH>Waktu</TH><TH>Pelaku</TH><TH>Tindakan</TH><TH>Event</TH></TR></THead>
              <TBody>
                {data.rows.map((r) => (
                  <>
                    <TR key={r.id} className="cursor-pointer" onClick={() => setOpen(open === r.id ? null : r.id)}>
                      <TD>{open === r.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}</TD>
                      <TD className="whitespace-nowrap text-muted-foreground">{fmtDateTime(r.created_at)}</TD>
                      <TD className="font-medium text-navy-900">{r.actor_label ?? 'sistem'}</TD>
                      <TD><Badge variant={CRITICAL.has(r.action) ? 'orange' : 'default'}>{describeAudit(r.action, r.entity)}</Badge></TD>
                      <TD className="text-muted-foreground">{eventName(r.event_id)}</TD>
                    </TR>
                    {open === r.id && (
                      <tr key={r.id + '-d'} className="bg-navy-50/50">
                        <td colSpan={5} className="px-4 py-3">
                          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-navy-950 p-3 text-xs text-navy-100">{JSON.stringify(r.details, null, 2)}</pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </TBody>
            </Table>
            <Pager page={page} pages={Math.max(1, Math.ceil(data.count / PAGE))} total={data.count} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  )
}
