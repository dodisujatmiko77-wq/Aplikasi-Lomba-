import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, BookOpen, CalendarDays, CheckCircle2, GraduationCap, MapPin, PlayCircle, Trophy, Users, type LucideIcon } from 'lucide-react'
import { rpc } from '@/services/db'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { EmptyState, ErrorNote, Loading, PageHeader } from '@/components/common'
import { fmtDateTime, fmtInt, fmtPoints, LABELS } from '@/utils/format'

interface Stats {
  events: number; participants: number; districts: number; levels: number; questions: number
  sessions_active: number; sessions_finished: number; sessions_total: number
  participants_by_level: { name: string; total: number }[]
  participants_by_district: { name: string; total: number }[]
  questions_by_type: { name: keyof typeof LABELS.questionType; total: number }[]
  recent_results: { session_id: string; name: string; code: string; finished_at: string; participants: number; top_points: number; avg_points: number; winner: string | null }[]
  recent_activity: { id: string; action: string; entity: string; actor: string; created_at: string }[]
}

const ACTION_LABEL: Record<string, string> = {
  insert: 'menambah', update: 'mengubah', delete: 'menghapus', open_session: 'membuka sesi', start_round: 'memulai babak',
  show_question: 'menayangkan soal', close_question: 'menutup soal', reveal_answer: 'membuka jawaban', cancel_question: 'membatalkan soal',
  pause_session: 'menjeda lomba', resume_session: 'melanjutkan lomba', end_round: 'mengakhiri babak', announce_winners: 'mengumumkan pemenang',
  eliminate_participant: 'mengeliminasi peserta', reinstate_participant: 'mengembalikan peserta', import_participants: 'mengimpor peserta',
  import_questions: 'mengimpor soal', reset_pin: 'mereset PIN', set_round_roster: 'menetapkan roster', create_tiebreak: 'membuat soal tambahan',
  set_results_published: 'mengatur publikasi hasil', cancel_session: 'membatalkan sesi', bootstrap_superadmin: 'bootstrap superadmin',
}
const ENTITY_LABEL: Record<string, string> = {
  events: 'event', event_settings: 'pengaturan event', districts: 'kecamatan', education_levels: 'jenjang', participants: 'peserta',
  event_participants: 'pendaftaran peserta', questions: 'soal', question_packages: 'paket soal', admin_assignments: 'hak akses',
  profiles: 'akun admin', announcements: 'pengumuman', question_categories: 'kategori', competition_sessions: 'sesi',
  competition_rounds: 'babak', competition_questions: 'soal tayang', app_settings: 'pengaturan global',
}
export const describeAudit = (action: string, entity: string) =>
  `${ACTION_LABEL[action] ?? action}${['insert', 'update', 'delete'].includes(action) ? ' ' + (ENTITY_LABEL[entity] ?? entity) : ''}`

function Stat({ icon: Icon, label, value, tone = 'navy', to }: { icon: LucideIcon; label: string; value: number; tone?: 'navy' | 'blue' | 'orange' | 'green'; to?: string }) {
  const tones = { navy: 'bg-navy-100 text-navy-700', blue: 'bg-blue-100 text-electric-600', orange: 'bg-orange-100 text-flame-600', green: 'bg-emerald-100 text-emerald-700' }
  const body = (
    <Card className="h-full transition-shadow hover:shadow-md">
      <CardContent className="flex items-center gap-4 p-5">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" /></span>
        <div>
          <p className="tabular font-heading text-2xl font-bold leading-none text-navy-900">{fmtInt(value)}</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
  return to ? <Link to={to}>{body}</Link> : body
}

const PIE = ['#1f7bff', '#f97316', '#0b1b3f', '#4d9bff']

export default function DashboardPage() {
  const { profile, isSuperadmin } = useAuth()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: () => rpc<Stats>('admin_dashboard_stats'), refetchInterval: 30_000 })

  if (isLoading) return <Loading />
  if (error || !data) return <ErrorNote message={(error as Error)?.message ?? 'Gagal memuat dashboard'} onRetry={() => void refetch()} />

  return (
    <div>
      <PageHeader
        title={`Halo, ${profile?.full_name?.split(' ')[0] || 'Admin'}`}
        description={isSuperadmin ? 'Ringkasan seluruh event perlombaan.' : 'Ringkasan event yang ditugaskan kepada Anda.'}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={CalendarDays} label="Total event" value={data.events} to="/admin/events" />
        <Stat icon={Users} label="Total peserta" value={data.participants} tone="blue" to="/admin/participants" />
        <Stat icon={BookOpen} label="Total soal" value={data.questions} tone="blue" to="/admin/questions" />
        <Stat icon={PlayCircle} label="Kompetisi aktif" value={data.sessions_active} tone="orange" to="/admin/sessions" />
        <Stat icon={MapPin} label="Kecamatan" value={data.districts} to="/admin/districts" />
        <Stat icon={GraduationCap} label="Jenjang" value={data.levels} to="/admin/levels" />
        <Stat icon={CheckCircle2} label="Kompetisi selesai" value={data.sessions_finished} tone="green" to="/admin/results" />
        <Stat icon={Activity} label="Total sesi" value={data.sessions_total} to="/admin/sessions" />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Peserta per kecamatan</CardTitle><CardDescription>Jumlah peserta terdaftar di setiap kecamatan</CardDescription></CardHeader>
          <CardContent className="h-72">
            {data.participants ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.participants_by_district} margin={{ top: 8, right: 8, left: -20, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e3e8f1" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-35} textAnchor="end" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip cursor={{ fill: '#eef3fb' }} formatter={(v) => [v as number, 'Peserta']} />
                  <Bar dataKey="total" fill="#1f7bff" radius={[6, 6, 0, 0]} maxBarSize={34} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState title="Belum ada peserta" description="Tambahkan atau impor peserta untuk melihat sebarannya." />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Peserta per jenjang</CardTitle><CardDescription>SD, SMP, dan SMA/SMK</CardDescription></CardHeader>
          <CardContent className="h-72">
            {data.participants ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.participants_by_level} dataKey="total" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3} label={(e) => `${e.name}: ${e.total}`}>
                    {data.participants_by_level.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyState title="Belum ada data" />}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Statistik hasil</CardTitle><CardDescription>Kompetisi yang baru selesai</CardDescription></CardHeader>
          <CardContent>
            {data.recent_results.length ? (
              <ul className="divide-y">
                {data.recent_results.map((r) => (
                  <li key={r.session_id} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700"><Trophy className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-navy-900">{r.name}</p>
                      <p className="text-xs text-muted-foreground">Juara 1: <b className="text-navy-800">{r.winner ?? '—'}</b> · {fmtDateTime(r.finished_at)}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p><b className="tabular text-sm text-navy-900">{fmtPoints(r.top_points)}</b> poin tertinggi</p>
                      <p>rata-rata {fmtPoints(r.avg_points)} · {r.participants} peserta</p>
                    </div>
                    <Link to={`/admin/results?session=${r.session_id}`} className="text-sm font-semibold text-electric-600 hover:underline">Lihat</Link>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="Belum ada kompetisi selesai" description="Hasil akan muncul setelah pemenang diumumkan." />}
            {data.questions_by_type.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 border-t pt-4 text-xs">
                {data.questions_by_type.map((t) => (
                  <span key={t.name} className="rounded-full bg-navy-50 px-3 py-1 font-medium text-navy-700">{LABELS.questionType[t.name]}: <b>{t.total}</b></span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Aktivitas terakhir</CardTitle></CardHeader>
          <CardContent>
            {data.recent_activity.length ? (
              <ol className="relative space-y-3 border-l border-navy-100 pl-4">
                {data.recent_activity.map((a) => (
                  <li key={a.id} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-electric-500 ring-4 ring-white" />
                    <p className="leading-snug"><b className="text-navy-900">{a.actor}</b> {describeAudit(a.action, a.entity)}</p>
                    <p className="text-xs text-muted-foreground">{fmtDateTime(a.created_at)}</p>
                  </li>
                ))}
              </ol>
            ) : <EmptyState title="Belum ada aktivitas" />}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
