import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, Ban, Eye, Flag, ListOrdered, MonitorPlay, Pause, Play, PlayCircle, Radio, SkipForward, Trophy, UserMinus, UserPlus, Users, Wifi, WifiOff, XCircle,
} from 'lucide-react'
import { rpc } from '@/services/db'
import { useLiveState } from '@/hooks/useLiveState'
import { useAction } from '@/hooks/useAction'
import { useConfirm } from '@/components/confirm'
import { useQuestionBank } from '@/features/questions/QuestionsPage'
import { useQuestionCountdown, TimerBar } from './Countdown'
import { Avatar, ErrorNote, Loading, SessionStatusBadge } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Checkbox, SwitchRow } from '@/components/ui/switch'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { fmtPoints, fmtSeconds, LABELS } from '@/utils/format'
import type { ControlState, LeaderboardRow } from '@/types'

export default function ControlPanelPage() {
  const { id = '' } = useParams()
  const confirm = useConfirm()
  const { busyKey, run } = useAction()
  const { data, error, link, answered, refresh } = useLiveState<ControlState>({
    fetcher: () => rpc<ControlState>('admin_get_control_state', { p_session_id: id }),
    enabled: !!id, fastPollMs: 1500, slowPollMs: 4000,
  })
  const [tie, setTie] = useState<{ ids: string[]; qs: string[]; name: string } | null>(null)
  const [force, setForce] = useState(false)
  const [lbFilter, setLbFilter] = useState('')
  const cq = data?.current ?? null
  const cd = useQuestionCountdown(cq && cq.status === 'active' ? cq : null)
  const bank = useQuestionBank(data?.event_id ?? '')

  const act = (key: string, fn: () => Promise<unknown>, ok?: string) => run(async () => { await fn(); await refresh() }, ok, key)
  const call = (name: string, extra: Record<string, unknown> = {}) => () => rpc(name, { p_session_id: id, ...extra })

  const round = data?.rounds.find((r) => r.id === data?.round?.id)
  const roundQs = round?.questions ?? []
  const pending = roundQs.filter((q) => q.status === 'pending').length
  const nextPending = roundQs.find((q) => q.status === 'pending')
  const nextRound = data?.rounds.find((r) => r.status === 'pending')
  const tiedRows = useMemo(() => (data?.leaderboard ?? []).filter((r) => r.tied && r.rank <= 3), [data])

  if (error && !data) return <ErrorNote message={error} onRetry={() => void refresh()} />
  if (!data) return <Loading />
  const s = data.session
  const can = data.can_control
  const st = s.status
  const qStatus = cq?.status
  const hasActiveRound = round?.status === 'active'
  const isActive = qStatus === 'active'
  const finished = st === 'finished' || st === 'cancelled'
  const roundsDone = data.rounds.some((r) => r.status === 'finished') && !hasActiveRound

  const stateLabel = finished ? 'Sesi selesai' : st === 'draft' ? 'Sesi belum dibuka' : st === 'paused' ? 'DIJEDA'
    : isActive ? (cd?.phase === 'lead' ? `Soal ${cq?.sequence} tayang dalam ${cd.seconds} dtk` : `Soal ${cq?.sequence} berjalan`)
    : qStatus === 'closed' ? 'Soal ditutup — menunggu jawaban dibuka' : qStatus === 'revealed' ? 'Jawaban dibuka'
    : hasActiveRound ? 'Siap menayangkan soal' : roundsDone ? 'Babak selesai' : 'Menunggu babak dimulai'

  const lb = (data.leaderboard ?? []).filter((r) => !lbFilter || `${r.name} ${r.school} ${r.number}`.toLowerCase().includes(lbFilter.toLowerCase()))

  const eliminate = async (r: LeaderboardRow) => {
    const reason = await confirm({ title: `Eliminasi ${r.name}?`, promptLabel: 'Alasan (wajib, tercatat di audit log)', confirmLabel: 'Eliminasi', destructive: true, description: 'Peserta tidak dapat menjawab soal berikutnya pada babak ini.' })
    if (typeof reason === 'string') await act('elim', call('eliminate_participant', { p_participant_id: r.participant_id, p_reason: reason }), 'Peserta dieliminasi')
  }
  const reinstate = async (r: LeaderboardRow) => {
    const reason = await confirm({ title: `Kembalikan ${r.name}?`, promptLabel: 'Alasan (wajib)', confirmLabel: 'Kembalikan' })
    if (typeof reason === 'string') await act('elim', call('reinstate_participant', { p_participant_id: r.participant_id, p_reason: reason }), 'Peserta dikembalikan')
  }
  const cancelQ = async () => {
    const reason = await confirm({ title: `Batalkan soal ${cq?.sequence}?`, promptLabel: 'Alasan pembatalan', promptRequired: false, destructive: true, confirmLabel: 'Batalkan soal',
      description: 'Skor soal ini dihapus dari klasemen dan peserta yang gugur karenanya dikembalikan. Riwayat jawaban tetap tersimpan.' })
    if (reason) await act('cancel', call('cancel_question', { p_reason: typeof reason === 'string' ? reason : null }), 'Soal dibatalkan')
  }
  const announce = async () => {
    if (await confirm({ title: 'Umumkan pemenang?', description: 'Sesi diakhiri, monitor menampilkan podium, dan hasil dipublikasikan.', confirmLabel: 'Umumkan' })) {
      const ok = await act('announce', call('announce_winners', { p_force: force }), 'Pemenang diumumkan')
      void ok
    }
  }
  const startTie = async () => {
    if (!tie) return
    const ok = await run(async () => { await rpc('create_tiebreak_round', { p_session_id: id, p_participant_ids: tie.ids, p_question_ids: tie.qs, p_name: tie.name || null }); await refresh() }, 'Babak soal tambahan dibuat. Mulai dari daftar babak.')
    if (ok) setTie(null)
  }

  const Btn = ({ k, icon: Icon, label, fn, ok, variant = 'default', disabled = false, size = 'lg' }: { k: string; icon: typeof Play; label: string; fn: () => Promise<unknown> | void; ok?: string; variant?: 'default' | 'accent' | 'flame' | 'outline' | 'destructive'; disabled?: boolean; size?: 'lg' | 'default' }) => (
    <Button size={size} variant={variant} disabled={!can || disabled} loading={busyKey === k} onClick={() => void act(k, async () => fn(), ok)}><Icon /> {label}</Button>
  )

  return (
    <div>
      <Link to="/admin/sessions" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Semua sesi</Link>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-navy-900">{s.name}</h1>
          <p className="text-sm text-muted-foreground">{s.event_name} · {s.level} · Kode <b className="font-mono tracking-wider">{s.code}</b></p>
        </div>
        <SessionStatusBadge status={st} />
        <Badge variant={link === 'live' ? 'green' : link === 'polling' ? 'orange' : 'red'}>{link === 'live' ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{link === 'live' ? 'Realtime' : link === 'polling' ? 'Polling' : 'Terputus'}</Badge>
        <Button variant="outline" asChild><a href={`/live/${s.code}`} target="_blank" rel="noreferrer"><MonitorPlay /> Buka monitor</a></Button>
        <Button variant="outline" asChild><Link to={`/admin/sessions/${id}`}>Atur sesi</Link></Button>
      </div>
      {!can && <p className="mb-4 rounded-lg bg-orange-50 px-4 py-2 text-sm text-orange-900">Anda hanya dapat melihat. Izin kontrol pertandingan tidak diberikan.</p>}
      {error && <div className="mb-4"><ErrorNote message={`Koneksi bermasalah: ${error}`} /></div>}

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <div className="space-y-4">
          {/* status & kontrol */}
          <Card className="overflow-hidden">
            <div className="stage-bg p-5 text-white">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-electric-400">{round ? `${round.name} · ${LABELS.roundMode[round.mode]}` : 'Belum ada babak aktif'}</p>
                  <p className="mt-1 font-heading text-2xl font-bold">{stateLabel}</p>
                </div>
                {isActive && cd && (
                  <div className="text-right">
                    <p className="tabular font-heading text-5xl font-extrabold leading-none">{cd.phase === 'lead' ? cd.seconds : cd.seconds}<span className="ml-1 text-lg text-navy-200">dtk</span></p>
                  </div>
                )}
              </div>
              {isActive && cd && cd.phase === 'running' && <TimerBar fraction={cd.fraction} className="mt-4 bg-white/15" />}
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { l: 'Peserta aktif', v: data.counts.active, i: Users }, { l: 'Online', v: data.counts.online, i: Radio },
                  { l: 'Sudah menjawab', v: `${answered}/${data.counts.active}`, i: Eye }, { l: 'Tereliminasi', v: data.counts.eliminated, i: UserMinus },
                ].map((x) => (
                  <div key={x.l} className="rounded-xl bg-white/10 p-3"><x.i className="h-4 w-4 text-electric-400" /><p className="tabular mt-1 text-2xl font-bold">{x.v}</p><p className="text-xs text-navy-200">{x.l}</p></div>
                ))}
              </div>
            </div>
            <CardContent className="space-y-4 p-5">
              {cq && (
                <div className="rounded-xl border bg-navy-50/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Soal {cq.sequence} dari {cq.total} · {LABELS.questionType[cq.type]}</p>
                  <p className="mt-1 font-semibold text-navy-900">{cq.text}</p>
                  {cq.options.length > 0 && (
                    <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                      {cq.options.map((o) => (
                        <li key={o.id} className={cn('flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-sm', o.is_correct && 'border-emerald-400 bg-emerald-50')}>
                          <b className="text-navy-600">{o.label}</b><span className="flex-1">{o.text}</span>
                          {o.is_correct && <Badge variant="green">Kunci</Badge>}<span className="tabular text-xs text-muted-foreground">{o.count} jawab</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {cq.reveal && <p className="mt-2 text-sm text-emerald-700">Jawaban: <b>{cq.reveal.correct_text}</b> · benar {cq.reveal.correct_count} dari {cq.reveal.answered} penjawab</p>}
                </div>
              )}

              {/* tombol aksi sesuai status */}
              <div className="flex flex-wrap gap-2">
                {st === 'draft' && <Btn k="open" icon={PlayCircle} label="Buka sesi untuk peserta" variant="accent" fn={call('open_session')} ok="Sesi dibuka" />}
                {(st === 'open' || (st === 'running' && !hasActiveRound)) && nextRound && (
                  <Btn k="startRound" icon={Flag} label={`Mulai ${nextRound.name}`} variant="accent" fn={() => rpc('start_round', { p_round_id: nextRound.id })} ok="Babak dimulai" />
                )}
                {st === 'running' && hasActiveRound && !isActive && qStatus !== 'closed' && nextPending && (
                  <Btn k="next" icon={SkipForward} label={cq ? 'Soal berikutnya' : 'Tayangkan soal pertama'} variant="accent" fn={call('next_question')} />
                )}
                {st === 'running' && isActive && <Btn k="close" icon={XCircle} label="Tutup soal" variant="flame" fn={call('close_question')} ok="Soal ditutup" />}
                {st === 'running' && qStatus === 'closed' && <Btn k="reveal" icon={Eye} label="Tampilkan jawaban benar" variant="accent" fn={call('reveal_answer')} />}
                {st === 'running' && qStatus === 'revealed' && <Btn k="lb" icon={ListOrdered} label="Tampilkan leaderboard" variant="outline" fn={call('set_display', { p_screen: 'leaderboard' })} />}
                {st === 'running' && qStatus === 'closed' || st === 'running' && qStatus === 'revealed' ? <Btn k="back" icon={Eye} label="Layar soal/hasil" variant="outline" size="default" fn={call('set_display', { p_screen: qStatus === 'revealed' ? 'result' : 'question' })} /> : null}
                {st === 'running' && hasActiveRound && !isActive && !pending && <Btn k="endRound" icon={Flag} label="Akhiri babak" variant="flame" fn={call('end_round')} ok="Babak diakhiri" />}
                {st === 'running' && hasActiveRound && !isActive && !!pending && qStatus !== 'closed' && cq && <Btn k="endRound2" icon={Flag} label="Akhiri babak sekarang" variant="outline" size="default" fn={call('end_round')} />}
                {(st === 'running' || st === 'paused') && (isActive || st === 'paused') && (st === 'running'
                  ? <Btn k="pause" icon={Pause} label="Jeda" variant="outline" fn={call('pause_session')} ok="Lomba dijeda" />
                  : <Btn k="resume" icon={Play} label="Lanjutkan" variant="accent" fn={call('resume_session')} ok="Lomba dilanjutkan" />)}
                {st === 'running' && !!cq && ['active', 'closed', 'revealed'].includes(qStatus ?? '') && <Button size="lg" variant="outline" className="text-red-600" disabled={!can} onClick={() => void cancelQ()}><Ban /> Batalkan soal</Button>}
                {(st === 'running') && roundsDone && (
                  <>
                    <Button size="lg" variant="outline" disabled={!can} onClick={() => setTie({ ids: tiedRows.map((r) => r.participant_id), qs: [], name: '' })}><Users /> Soal tambahan (seri)</Button>
                    <Btn k="announce" icon={Trophy} label="Umumkan pemenang" variant="flame" fn={announce} />
                  </>
                )}
              </div>
              {st === 'running' && roundsDone && tiedRows.length > 0 && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
                  <b>{tiedRows.length} peserta seri pada tiga besar.</b> Jalankan soal tambahan untuk memutus seri.
                  <div className="mt-2"><SwitchRow label="Umumkan tanpa memutus seri" hint="Urutan ditentukan nomor peserta. Tidak disarankan." checked={force} onChange={setForce} /></div>
                </div>
              )}
              {data.counts.participants === 0 && <p className="text-sm text-red-600">Sesi belum memiliki peserta.</p>}
            </CardContent>
          </Card>

          {/* babak */}
          <Card>
            <CardHeader><CardTitle>Babak & soal</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {data.rounds.map((r) => (
                <div key={r.id} className={cn('rounded-xl border p-3', r.status === 'active' && 'border-emerald-400 bg-emerald-50/50')}>
                  <div className="flex items-center gap-2">
                    <b className="text-navy-900">{r.sequence}. {r.name}</b><Badge>{LABELS.roundMode[r.mode]}</Badge>
                    <Badge variant={r.status === 'active' ? 'green' : r.status === 'finished' ? 'default' : 'gray'}>{r.status === 'pending' ? 'Belum mulai' : r.status === 'active' ? 'Berjalan' : 'Selesai'}</Badge>
                    <span className="ml-auto text-xs text-muted-foreground">{r.roster} peserta</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.questions.map((q) => (
                      <span key={q.id} title={q.text} className={cn('tabular flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-bold',
                        q.status === 'pending' && 'bg-slate-100 text-slate-500', q.status === 'active' && 'bg-electric-500 text-white', q.status === 'closed' && 'bg-amber-200 text-amber-900',
                        q.status === 'revealed' && 'bg-emerald-200 text-emerald-900', q.status === 'cancelled' && 'bg-red-100 text-red-700 line-through')}>{q.sequence}</span>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* leaderboard */}
        <Card className="h-fit">
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>Klasemen ({data.leaderboard.length})</CardTitle>
            <Input value={lbFilter} onChange={(e) => setLbFilter(e.target.value)} placeholder="Cari…" className="h-8 w-36" />
          </CardHeader>
          <div className="max-h-[75vh] overflow-y-auto">
            <Table>
              <THead><TR><TH className="w-10">#</TH><TH>Peserta</TH><TH className="text-right">Poin</TH><TH className="text-right">B/S</TH>{can && hasActiveRound && <TH className="w-10" />}</TR></THead>
              <TBody>
                {lb.map((r) => (
                  <TR key={r.participant_id} className={cn(r.is_eliminated && 'opacity-55')}>
                    <TD className="tabular font-bold text-navy-700">{r.rank}{r.tied && <span title="Seri" className="ml-0.5 text-flame-500">=</span>}</TD>
                    <TD><div className="flex items-center gap-2"><Avatar name={r.name} src={r.photo_url} size={26} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{r.name}</span><span className="block truncate text-xs text-muted-foreground">{r.school}{r.is_eliminated ? ' · gugur' : ''}</span></span></div></TD>
                    <TD className="tabular text-right font-semibold">{fmtPoints(r.points)}</TD>
                    <TD className="tabular whitespace-nowrap text-right text-xs text-muted-foreground">{r.correct}/{r.wrong + r.unanswered}<br />{r.correct_ms ? fmtSeconds(r.correct_ms) : ''}</TD>
                    {can && hasActiveRound && (
                      <TD>{r.is_eliminated
                        ? <Button size="icon" variant="ghost" onClick={() => void reinstate(r)} aria-label="Kembalikan"><UserPlus /></Button>
                        : <Button size="icon" variant="ghost" className="text-red-600" onClick={() => void eliminate(r)} aria-label="Eliminasi"><UserMinus /></Button>}</TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>
      </div>

      <Dialog open={!!tie} onOpenChange={(o) => !o && setTie(null)}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>Soal tambahan (tie breaker)</DialogTitle><DialogDescription>Hanya peserta yang dipilih yang menjawab. Poin soal tambahan menjadi pemutus seri tanpa mengubah total poin.</DialogDescription></DialogHeader>
          {tie && (
            <DialogBody className="space-y-4">
              <div>
                <p className="mb-1.5 text-sm font-semibold">Peserta seri</p>
                <ul className="max-h-40 divide-y overflow-y-auto rounded-lg border">
                  {(data.leaderboard ?? []).slice(0, 12).map((r) => (
                    <li key={r.participant_id}><label className="flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm hover:bg-navy-50/60">
                      <Checkbox checked={tie.ids.includes(r.participant_id)} onCheckedChange={(v) => setTie({ ...tie, ids: v ? [...tie.ids, r.participant_id] : tie.ids.filter((x) => x !== r.participant_id) })} />
                      #{r.rank} {r.name} <span className="ml-auto tabular text-muted-foreground">{fmtPoints(r.points)}</span>
                    </label></li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1.5 text-sm font-semibold">Soal tambahan ({tie.qs.length})</p>
                <ul className="max-h-52 divide-y overflow-y-auto rounded-lg border">
                  {(bank.data?.questions ?? []).filter((q) => q.is_active).map((q) => (
                    <li key={q.id}><label className="flex cursor-pointer items-start gap-3 px-3 py-1.5 text-sm hover:bg-navy-50/60">
                      <Checkbox className="mt-0.5" checked={tie.qs.includes(q.id)} onCheckedChange={(v) => setTie({ ...tie, qs: v ? [...tie.qs, q.id] : tie.qs.filter((x) => x !== q.id) })} />
                      <span className="line-clamp-2">{q.question_text}</span>
                    </label></li>
                  ))}
                </ul>
              </div>
            </DialogBody>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setTie(null)}>Batal</Button><Button disabled={!tie || tie.ids.length < 2 || !tie.qs.length} loading={busyKey === 'default'} onClick={() => void startTie()}>Buat babak soal tambahan</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
