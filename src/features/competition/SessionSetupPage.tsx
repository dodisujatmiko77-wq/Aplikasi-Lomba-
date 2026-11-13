import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, DoorOpen, ListPlus, Play, Plus, Shuffle, Trash2, UserPlus, Users } from 'lucide-react'
import { insert, list, listByIds, remove, rpc, update } from '@/services/db'
import { useAuth } from '@/contexts/AuthContext'
import { useDistricts, useLevels } from '@/contexts/EventContext'
import { useAction } from '@/hooks/useAction'
import { useConfirm } from '@/components/confirm'
import { ScoringForm, type ScoringValues } from '@/features/settings/ScoringForm'
import { useQuestionBank } from '@/features/questions/QuestionsPage'
import { Avatar, EmptyState, Loading, PageHeader, SearchInput, SessionStatusBadge } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { Checkbox, SwitchRow } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LABELS } from '@/utils/format'
import type {
  CompetitionRound, CompetitionSession, EventParticipant, EventSettings, Participant, PackageQuestion, QuestionPackage, RoundMode,
  EliminationRule, ParticipantScope,
} from '@/types'

interface RoundQ { id: string; round_id: string; question_id: string; sequence: number; status: string; duration_seconds: number }
interface SessionMember { id: string; participant_id: string }
type RoundDraft = Partial<CompetitionRound> & ScoringValues & { name: string; mode: RoundMode }

const MODE_DEFAULTS: Record<RoundMode, Partial<CompetitionRound>> = {
  normal: { elimination_rule: 'none', participant_scope: 'all', reset_scores: false },
  speed: { elimination_rule: 'none', participant_scope: 'all', reset_scores: false },
  elimination: { elimination_rule: 'wrong_count', elimination_wrong_limit: 1, participant_scope: 'survivors', reset_scores: false },
  final: { elimination_rule: 'none', participant_scope: 'top_n', top_n: 3, reset_scores: true },
  tiebreak: { elimination_rule: 'none', participant_scope: 'manual', reset_scores: false },
}
const MODE_HINT: Record<RoundMode, string> = {
  normal: 'Semua peserta menjawab setiap soal. Peserta yang salah tetap lanjut.',
  speed: 'Seperti normal, tetapi urutan peringkat mendahulukan waktu respons benar tercepat.',
  elimination: 'Peserta yang melanggar aturan eliminasi gugur dan tidak dapat menjawab soal berikutnya pada babak ini.',
  final: 'Menentukan juara 1, 2, dan 3. Finalis dipilih dari peringkat atau manual oleh operator.',
  tiebreak: '',
}

export default function SessionSetupPage() {
  const { id = '' } = useParams()
  const { can } = useAuth()
  const { levelMap } = useLevels()
  const { districtMap } = useDistricts()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { busy, run } = useAction()

  const [round, setRound] = useState<RoundDraft | null>(null)
  const [addTo, setAddTo] = useState<CompetitionRound | null>(null)
  const [pickedQ, setPickedQ] = useState<string[]>([])
  const [pkg, setPkg] = useState('')
  const [shuffle, setShuffle] = useState(false)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [rosterFor, setRosterFor] = useState<CompetitionRound | null>(null)
  const [rosterPick, setRosterPick] = useState<string[]>([])
  const [rosterReason, setRosterReason] = useState('')

  const sessionQ = useQuery({
    queryKey: ['session', id],
    queryFn: async () => {
      const [s] = await list<CompetitionSession>('competition_sessions', { filters: { id }, limit: 1 })
      if (!s) throw new Error('Sesi tidak ditemukan atau Anda tidak berhak mengaksesnya')
      const [rounds, members, eps, settings, packages] = await Promise.all([
        list<CompetitionRound>('competition_rounds', { filters: { session_id: id }, order: [{ column: 'sequence' }] }),
        list<SessionMember>('session_participants', { filters: { session_id: id } }),
        list<EventParticipant>('event_participants', { filters: { event_id: s.event_id } }),
        list<EventSettings>('event_settings', { filters: { event_id: s.event_id }, limit: 1 }),
        list<QuestionPackage>('question_packages', { filters: { event_id: s.event_id } }),
      ])
      const roundQs = await listByIds<RoundQ>('competition_questions', rounds.map((r) => r.id), 'round_id')
      const participants = await listByIds<Participant>('participants', [...members.map((m) => m.participant_id), ...eps.map((e) => e.participant_id)])
      return { s, rounds, members, eps, settings: settings[0], packages, roundQs, participants }
    },
    refetchInterval: 8000,
  })
  const d = sessionQ.data
  const bank = useQuestionBank(d?.s.event_id ?? '')
  const reload = () => qc.invalidateQueries({ queryKey: ['session', id] })

  const pMap = useMemo(() => new Map((d?.participants ?? []).map((p) => [p.id, p])), [d])
  const memberIds = useMemo(() => new Set((d?.members ?? []).map((m) => m.participant_id)), [d])
  const eligible = useMemo(() => {
    if (!d) return []
    const verified = new Map(d.eps.filter((e) => e.registration_status === 'verified' && ['registered', 'active'].includes(e.participation_status)).map((e) => [e.participant_id, e]))
    return d.participants.filter((p) => verified.has(p.id) && p.is_active && p.education_level_id === d.s.education_level_id)
      .sort((a, b) => a.participant_number.localeCompare(b.participant_number, 'id', { numeric: true }))
  }, [d])

  if (sessionQ.isLoading) return <Loading />
  if (sessionQ.error || !d) return <EmptyState title="Sesi tidak tersedia" description={(sessionQ.error as Error)?.message} action={<Button asChild><Link to="/admin/sessions">Kembali</Link></Button>} />
  const s = d.s
  const canControl = can(s.event_id, 'control')
  const editable = canControl && ['draft', 'open'].includes(s.status)
  const notMembers = eligible.filter((p) => !memberIds.has(p.id)).filter((p) => !memberSearch || `${p.full_name} ${p.school} ${p.participant_number}`.toLowerCase().includes(memberSearch.toLowerCase()))

  const addMembers = (ids: string[]) => run(async () => {
    for (let i = 0; i < ids.length; i += 100) await insert('session_participants', ids.slice(i, i + 100).map((participant_id) => ({ session_id: id, participant_id })))
    await reload()
  }, `${ids.length} peserta ditambahkan`)
  const removeMember = (pid: string) => run(async () => { await remove('session_participants', { session_id: id, participant_id: pid }); await reload() })

  const newRound = (mode: RoundMode = 'normal'): RoundDraft => {
    const st = d.settings
    return {
      name: `Babak ${d.rounds.length + 1}`, mode, ...MODE_DEFAULTS[mode],
      base_points: st?.base_points ?? 100, speed_bonus: st?.speed_bonus ?? 50, wrong_penalty: st?.wrong_penalty ?? 0,
      duration_seconds: st?.duration_seconds ?? 20, lead_seconds: st?.lead_seconds ?? 3, rounding_mode: st?.rounding_mode ?? 'round',
      rounding_decimals: st?.rounding_decimals ?? 2, shuffle_options: false, elimination_wrong_limit: 1, elimination_after_question: 1, count_unanswered_as_wrong: true,
    }
  }
  const saveRound = async () => {
    if (!round) return
    const payload = {
      name: round.name.trim(), mode: round.mode, base_points: round.base_points, speed_bonus: round.speed_bonus, wrong_penalty: round.wrong_penalty,
      duration_seconds: round.duration_seconds, lead_seconds: round.lead_seconds, rounding_mode: round.rounding_mode, rounding_decimals: round.rounding_decimals,
      shuffle_options: !!round.shuffle_options, participant_scope: round.participant_scope ?? 'all', top_n: round.participant_scope === 'top_n' ? round.top_n ?? 3 : null,
      reset_scores: !!round.reset_scores, elimination_rule: round.elimination_rule ?? 'none', elimination_wrong_limit: round.elimination_wrong_limit ?? 1,
      elimination_score_threshold: round.elimination_rule === 'score_threshold' ? round.elimination_score_threshold ?? 0 : null,
      elimination_after_question: round.elimination_after_question ?? 1, count_unanswered_as_wrong: round.count_unanswered_as_wrong ?? true,
    }
    const ok = await run(async () => {
      if (!payload.name) throw new Error('Nama babak wajib diisi')
      if (round.id) await update('competition_rounds', { id: round.id }, payload)
      else await insert('competition_rounds', { ...payload, session_id: id })
      await reload()
    }, 'Babak tersimpan')
    if (ok) setRound(null)
  }
  const delRound = async (r: CompetitionRound) => {
    if (await confirm({ title: `Hapus ${r.name}?`, destructive: true })) await run(async () => { await remove('competition_rounds', { id: r.id }); await reload() }, 'Babak dihapus')
  }

  const openAdd = (r: CompetitionRound) => { setAddTo(r); setPickedQ([]); setPkg(''); setShuffle(false); setSearch('') }
  const questionsOf = (rid: string) => d.roundQs.filter((q) => q.round_id === rid).sort((a, b) => a.sequence - b.sequence)
  const qText = (qid: string) => bank.data?.questions.find((q) => q.id === qid)?.question_text ?? '…'
  const candidates = (bank.data?.questions ?? []).filter((q) => q.is_active && (!q.education_level_id || q.education_level_id === s.education_level_id)
    && !questionsOf(addTo?.id ?? '').some((x) => x.question_id === q.id) && (!search || q.question_text.toLowerCase().includes(search.toLowerCase())))
  const choosePackage = async (pid: string) => {
    setPkg(pid)
    if (!pid) return
    const links = await list<PackageQuestion>('package_questions', { filters: { package_id: pid }, order: [{ column: 'sort_order' }] })
    setPickedQ(links.map((l) => l.question_id))
    const p = d.packages.find((x) => x.id === pid)
    if (p) setShuffle(p.shuffle_questions)
  }
  const submitAdd = async () => {
    if (!addTo) return
    setAdding(true)
    const ok = await run(async () => {
      const n = await rpc<number>('admin_add_questions_to_round', { p_round_id: addTo.id, p_question_ids: pickedQ, p_shuffle: shuffle })
      if (!n) throw new Error('Tidak ada soal baru yang ditambahkan')
      await reload()
    }, 'Soal ditambahkan ke babak')
    setAdding(false)
    if (ok) setAddTo(null)
  }
  const setDuration = async (q: RoundQ, el: HTMLInputElement) => {
    const v = Math.round(Number(el.value))
    if (v === q.duration_seconds) return
    if (!Number.isFinite(v) || v < 3 || v > 600) {
      el.value = String(q.duration_seconds)
      return void run(async () => { throw new Error('Durasi harus 3–600 detik') })
    }
    await run(async () => { await update('competition_questions', { id: q.id }, { duration_seconds: v }); await reload() }, `Soal ${q.sequence}: ${v} detik`)
  }
  const setAllDurations = async (r: CompetitionRound) => {
    const raw = await confirm({ title: `Samakan durasi semua soal di ${r.name}`, promptLabel: 'Durasi menjawab (detik, 3–600)', confirmLabel: 'Terapkan', description: 'Mengganti durasi seluruh soal yang belum tayang pada babak ini.' })
    if (typeof raw !== 'string') return
    const v = Math.round(Number(raw))
    if (!(v >= 3 && v <= 600)) return void run(async () => { throw new Error('Durasi harus 3–600 detik') })
    await run(async () => { await update('competition_questions', { round_id: r.id, status: 'pending' }, { duration_seconds: v }); await reload() }, `Durasi semua soal diatur ${v} detik`)
  }
  const delQ = (qid: string) => run(async () => { await remove('competition_questions', { id: qid }); await reload() })

  const openRoster = async (r: CompetitionRound) => {
    const cur = await list<{ participant_id: string }>('scores', { filters: { round_id: r.id } })
    setRosterFor(r); setRosterPick(cur.map((c) => c.participant_id)); setRosterReason('')
  }
  const saveRoster = async () => {
    if (!rosterFor) return
    const ok = await run(async () => { await rpc('set_round_roster', { p_round_id: rosterFor.id, p_participant_ids: rosterPick, p_reason: rosterReason || null }); await reload() }, 'Roster babak disimpan (tercatat di audit log)')
    if (ok) setRosterFor(null)
  }

  const openSession = () => run(async () => { await rpc('open_session', { p_session_id: id }); await reload() }, 'Sesi dibuka. Peserta kini dapat bergabung.')

  return (
    <div>
      <Link to="/admin/sessions" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Semua sesi</Link>
      <PageHeader
        title={s.name}
        description={`${levelMap.get(s.education_level_id)?.name ?? ''} · Kode monitor ${s.code}`}
        actions={
          <>
            <SessionStatusBadge status={s.status} />
            {canControl && s.status === 'draft' && <Button variant="outline" loading={busy} onClick={() => void openSession()}><DoorOpen /> Buka sesi untuk peserta</Button>}
            {canControl && <Button variant="accent" asChild><Link to={`/admin/control/${s.id}`}><Play /> Panel kontrol</Link></Button>}
          </>
        }
      />
      {!canControl && <p className="mb-4 rounded-lg bg-orange-50 px-4 py-2 text-sm text-orange-900">Anda tidak memiliki izin mengatur sesi ini (hanya melihat).</p>}

      <Tabs defaultValue="rounds">
        <TabsList><TabsTrigger value="rounds">Babak & soal ({d.rounds.length})</TabsTrigger><TabsTrigger value="members"><Users className="h-4 w-4" /> Peserta ({d.members.length})</TabsTrigger></TabsList>

        <TabsContent value="rounds" className="space-y-4">
          {!d.rounds.length && <Card><EmptyState title="Belum ada babak" description="Tambahkan babak, atur penilaian, lalu isi dengan soal." /></Card>}
          {d.rounds.map((r) => (
            <Card key={r.id}>
              <CardHeader className="flex-row flex-wrap items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-900 font-heading font-bold text-white">{r.sequence}</span>
                <div className="min-w-0 flex-1">
                  <CardTitle>{r.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {LABELS.roundMode[r.mode]} · {r.base_points}+{r.speed_bonus} poin · {r.duration_seconds} dtk · {LABELS.scope[r.participant_scope]}
                    {r.elimination_rule !== 'none' && ` · ${LABELS.eliminationRule[r.elimination_rule]}`}
                  </p>
                </div>
                <Badge variant={r.status === 'active' ? 'green' : r.status === 'finished' ? 'default' : 'gray'}>{r.status === 'pending' ? 'Belum mulai' : r.status === 'active' ? 'Berjalan' : 'Selesai'}</Badge>
                {canControl && r.status === 'pending' && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => void openRoster(r)}><UserPlus /> Roster</Button>
                    <Button size="sm" variant="outline" onClick={() => setRound({ ...r })}>Ubah</Button>
                    <Button size="icon" variant="ghost" className="text-red-600" onClick={() => void delRound(r)} aria-label="Hapus babak"><Trash2 /></Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {questionsOf(r.id).length ? (
                  <ol className="divide-y rounded-lg border">
                    {questionsOf(r.id).map((q) => (
                      <li key={q.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className="tabular w-6 font-semibold text-navy-600">{q.sequence}</span>
                        <span className="line-clamp-1 flex-1">{qText(q.question_id)}</span>
                        {canControl && r.status === 'pending' && q.status === 'pending' ? (
                          <label className="flex items-center gap-1 text-xs text-muted-foreground" title="Durasi menjawab soal ini">
                            <input key={`${q.id}-${q.duration_seconds}`} type="number" min={3} max={600} defaultValue={q.duration_seconds} aria-label={`Durasi soal ${q.sequence} (detik)`}
                              onBlur={(e) => void setDuration(q, e.target)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                              className={`tabular h-8 w-16 rounded-md border bg-white px-2 text-right text-sm ${q.duration_seconds !== r.duration_seconds ? 'border-flame-500 font-semibold text-flame-600' : 'border-input text-foreground'}`} />
                            dtk
                          </label>
                        ) : <span className="tabular text-xs text-muted-foreground">{q.duration_seconds} dtk</span>}
                        <Badge variant={q.status === 'pending' ? 'gray' : q.status === 'cancelled' ? 'red' : 'blue'}>{LABELS.cqStatus[q.status as keyof typeof LABELS.cqStatus]}</Badge>
                        {canControl && r.status === 'pending' && <Button size="icon" variant="ghost" onClick={() => void delQ(q.id)} aria-label="Keluarkan soal"><Trash2 /></Button>}
                      </li>
                    ))}
                  </ol>
                ) : <p className="text-sm text-muted-foreground">Belum ada soal.</p>}
                {canControl && r.status === 'pending' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => openAdd(r)}><ListPlus /> Tambah soal / paket</Button>
                    {!!questionsOf(r.id).length && <Button size="sm" variant="outline" onClick={() => void setAllDurations(r)}>Samakan durasi semua soal</Button>}
                  </div>
                )}
                {!!questionsOf(r.id).length && r.status === 'pending' && <p className="mt-2 text-xs text-muted-foreground">Durasi bawaan babak {r.duration_seconds} dtk. Angka oranye = durasi khusus soal tersebut. Setelah soal tayang durasinya terkunci.</p>}
              </CardContent>
            </Card>
          ))}
          {canControl && !['finished', 'cancelled'].includes(s.status) && (
            <div className="flex flex-wrap gap-2">
              {(['normal', 'speed', 'elimination', 'final'] as RoundMode[]).map((m) => (
                <Button key={m} variant="outline" onClick={() => setRound(newRound(m))}><Plus /> Babak {LABELS.roundMode[m]}</Button>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="members">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between"><CardTitle>Anggota sesi ({d.members.length})</CardTitle></CardHeader>
              <CardContent>
                {!d.members.length ? <p className="text-sm text-muted-foreground">Belum ada peserta.</p> : (
                  <ul className="max-h-[60vh] divide-y overflow-y-auto">
                    {d.members.map((m) => pMap.get(m.participant_id)).filter((p): p is Participant => !!p)
                      .sort((a, b) => a.participant_number.localeCompare(b.participant_number, 'id', { numeric: true }))
                      .map((p) => (
                        <li key={p.id} className="flex items-center gap-3 py-2">
                          <Avatar name={p.full_name} src={p.photo_url} size={30} />
                          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-navy-900">{p.participant_number} · {p.full_name}</span><span className="block truncate text-xs text-muted-foreground">{p.school} · {districtMap.get(p.district_id)?.name}</span></span>
                          {editable && <Button size="icon" variant="ghost" onClick={() => void removeMember(p.id)} aria-label="Keluarkan"><Trash2 /></Button>}
                        </li>
                      ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            {canControl && (
              <Card>
                <CardHeader className="flex-row items-center justify-between gap-2">
                  <CardTitle>Peserta terverifikasi ({notMembers.length})</CardTitle>
                  <Button size="sm" disabled={!editable || !notMembers.length} loading={busy} onClick={() => void addMembers(notMembers.map((p) => p.id))}><UserPlus /> Tambahkan semua</Button>
                </CardHeader>
                <CardContent className="space-y-2">
                  <SearchInput value={memberSearch} onChange={setMemberSearch} placeholder="Cari peserta…" />
                  {!notMembers.length ? <p className="py-6 text-center text-sm text-muted-foreground">{eligible.length ? 'Semua peserta sudah masuk sesi.' : 'Belum ada peserta terverifikasi untuk jenjang ini.'}</p> : (
                    <ul className="max-h-[52vh] divide-y overflow-y-auto">
                      {notMembers.map((p) => (
                        <li key={p.id} className="flex items-center gap-3 py-2">
                          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.participant_number} · {p.full_name}</span><span className="block truncate text-xs text-muted-foreground">{p.school}</span></span>
                          <Button size="sm" variant="outline" disabled={!editable} onClick={() => void addMembers([p.id])}>Tambah</Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* form babak */}
      <Dialog open={!!round} onOpenChange={(o) => !o && setRound(null)}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>{round?.id ? 'Ubah babak' : 'Babak baru'}</DialogTitle>{round && MODE_HINT[round.mode] && <DialogDescription>{MODE_HINT[round.mode]}</DialogDescription>}</DialogHeader>
          {round && (
            <DialogBody className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nama babak"><Input value={round.name} onChange={(e) => setRound({ ...round, name: e.target.value })} /></Field>
                <Field label="Mode"><SimpleSelect value={round.mode} onChange={(v) => setRound({ ...round, mode: v as RoundMode, ...MODE_DEFAULTS[v as RoundMode] })} options={(['normal', 'speed', 'elimination', 'final'] as RoundMode[]).map((m) => ({ value: m, label: LABELS.roundMode[m] }))} /></Field>
                <Field label="Peserta babak ini"><SimpleSelect value={round.participant_scope} onChange={(v) => setRound({ ...round, participant_scope: v as ParticipantScope })} options={Object.entries(LABELS.scope).filter(([k]) => k !== 'manual').map(([value, label]) => ({ value, label }))} /></Field>
                {round.participant_scope === 'top_n' && <Field label="Jumlah finalis (Top-N)"><Input type="number" min={1} value={round.top_n ?? 3} onChange={(e) => setRound({ ...round, top_n: Number(e.target.value) })} /></Field>}
              </div>
              <SwitchRow label="Mulai dari skor 0 (reset)" hint="Poin babak sebelumnya tidak ikut dihitung untuk peserta di babak ini (umum untuk final)." checked={!!round.reset_scores} onChange={(v) => setRound({ ...round, reset_scores: v })} />
              <SwitchRow label="Acak urutan pilihan jawaban" hint="Diacak sekali oleh server; monitor dan semua HP melihat urutan yang sama." checked={!!round.shuffle_options} onChange={(v) => setRound({ ...round, shuffle_options: v })} />
              <div className="rounded-xl border p-4">
                <p className="mb-3 text-sm font-semibold text-navy-900">Aturan eliminasi</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Aturan"><SimpleSelect value={round.elimination_rule} onChange={(v) => setRound({ ...round, elimination_rule: v as EliminationRule })} options={Object.entries(LABELS.eliminationRule).map(([value, label]) => ({ value, label }))} /></Field>
                  {round.elimination_rule === 'wrong_count' && <Field label="Gugur setelah … kesalahan"><Input type="number" min={1} value={round.elimination_wrong_limit ?? 1} onChange={(e) => setRound({ ...round, elimination_wrong_limit: Number(e.target.value) })} /></Field>}
                  {round.elimination_rule === 'score_threshold' && (
                    <>
                      <Field label="Ambang skor minimal"><Input type="number" value={round.elimination_score_threshold ?? 0} onChange={(e) => setRound({ ...round, elimination_score_threshold: Number(e.target.value) })} /></Field>
                      <Field label="Berlaku mulai soal ke-"><Input type="number" min={1} value={round.elimination_after_question ?? 1} onChange={(e) => setRound({ ...round, elimination_after_question: Number(e.target.value) })} /></Field>
                    </>
                  )}
                </div>
                {round.elimination_rule === 'wrong_count' && <div className="mt-3"><SwitchRow label="Tidak menjawab dihitung salah" checked={round.count_unanswered_as_wrong ?? true} onChange={(v) => setRound({ ...round, count_unanswered_as_wrong: v })} /></div>}
                {round.elimination_rule === 'manual' && <p className="mt-2 text-xs text-muted-foreground">Operator mengeliminasi peserta dari panel kontrol dengan alasan; setiap keputusan tercatat di audit log.</p>}
              </div>
              <div>
                <p className="mb-3 text-sm font-semibold text-navy-900">Penilaian babak ini</p>
                <ScoringForm value={round} onChange={(v) => setRound({ ...round, ...v })} />
              </div>
            </DialogBody>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setRound(null)}>Batal</Button><Button loading={busy} onClick={() => void saveRound()}>Simpan babak</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* tambah soal */}
      <Dialog open={!!addTo} onOpenChange={(o) => !o && setAddTo(null)}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>Tambah soal ke {addTo?.name}</DialogTitle><DialogDescription>{pickedQ.length} soal dipilih. Soal yang sudah ada di babak ini otomatis dilewati.</DialogDescription></DialogHeader>
          <DialogBody className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Muat dari paket soal"><SimpleSelect value={pkg} onChange={(v) => void choosePackage(v)} allLabel="— pilih manual —" options={d.packages.map((p) => ({ value: p.id, label: p.name }))} /></Field>
              <div className="flex items-end"><SwitchRow label="Acak urutan soal" checked={shuffle} onChange={setShuffle} /></div>
            </div>
            <div className="flex gap-2">
              <SearchInput value={search} onChange={setSearch} placeholder="Cari soal…" className="flex-1" />
              <Button variant="outline" onClick={() => setPickedQ([...new Set([...pickedQ, ...candidates.map((c) => c.id)])])}>Pilih semua</Button>
              <Button variant="ghost" onClick={() => setPickedQ([])}>Kosongkan</Button>
            </div>
            <ul className="max-h-[46vh] divide-y overflow-y-auto rounded-lg border">
              {candidates.map((q) => (
                <li key={q.id}>
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-navy-50/60">
                    <Checkbox className="mt-0.5" checked={pickedQ.includes(q.id)} onCheckedChange={(v) => setPickedQ(v ? [...pickedQ, q.id] : pickedQ.filter((x) => x !== q.id))} />
                    <span className="min-w-0 flex-1 text-sm"><span className="line-clamp-2">{q.question_text}</span><span className="text-xs text-muted-foreground">{LABELS.questionType[q.type]} · {LABELS.difficulty[q.difficulty]}</span></span>
                    {shuffle && <Shuffle className="h-3.5 w-3.5 text-flame-500" />}
                  </label>
                </li>
              ))}
              {!candidates.length && <li className="p-6 text-center text-sm text-muted-foreground">Tidak ada soal yang tersedia.</li>}
            </ul>
          </DialogBody>
          <DialogFooter><Button variant="outline" onClick={() => setAddTo(null)}>Batal</Button><Button loading={adding} disabled={!pickedQ.length} onClick={() => void submitAdd()}>Tambahkan {pickedQ.length} soal</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* roster manual */}
      <Dialog open={!!rosterFor} onOpenChange={(o) => !o && setRosterFor(null)}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>Roster manual: {rosterFor?.name}</DialogTitle><DialogDescription>Pilih peserta yang boleh mengikuti babak ini. Keputusan ini tercatat di audit log.</DialogDescription></DialogHeader>
          <DialogBody className="space-y-3">
            <Field label="Alasan / dasar pemilihan"><Input value={rosterReason} onChange={(e) => setRosterReason(e.target.value)} placeholder="mis. Finalis hasil keputusan juri" /></Field>
            <ul className="max-h-[46vh] divide-y overflow-y-auto rounded-lg border">
              {d.members.map((m) => pMap.get(m.participant_id)).filter((p): p is Participant => !!p).map((p) => (
                <li key={p.id}><label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-navy-50/60">
                  <Checkbox checked={rosterPick.includes(p.id)} onCheckedChange={(v) => setRosterPick(v ? [...rosterPick, p.id] : rosterPick.filter((x) => x !== p.id))} />
                  <span className="text-sm">{p.participant_number} · {p.full_name} <span className="text-muted-foreground">({p.school})</span></span>
                </label></li>
              ))}
            </ul>
          </DialogBody>
          <DialogFooter><Button variant="outline" onClick={() => setRosterFor(null)}>Batal</Button><Button loading={busy} disabled={!rosterPick.length} onClick={() => void saveRoster()}>Simpan {rosterPick.length} peserta</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
