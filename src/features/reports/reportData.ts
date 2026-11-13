import { useQuery } from '@tanstack/react-query'
import { list, rpc } from '@/services/db'
import { fmtSeconds, LABELS } from '@/utils/format'
import type { AnswerHistoryRow, CompetitionSession, LeaderboardRow, SessionReport } from '@/types'

export function useEventSessions(eventId: string) {
  return useQuery({
    queryKey: ['sessions', eventId],
    queryFn: () => list<CompetitionSession>('competition_sessions', { filters: { event_id: eventId }, order: [{ column: 'created_at', ascending: false }] }),
  })
}

export function useSessionReport(sessionId: string, roundId: string) {
  return useQuery({
    queryKey: ['report', sessionId, roundId],
    enabled: !!sessionId,
    queryFn: () => rpc<SessionReport>('admin_get_session_report', { p_session_id: sessionId, p_round_id: roundId || null }),
  })
}

export const useAnswerHistory = (sessionId: string, roundId: string, enabled: boolean) =>
  useQuery({
    queryKey: ['history', sessionId, roundId], enabled: enabled && !!sessionId,
    queryFn: () => rpc<AnswerHistoryRow[]>('admin_get_answer_history', { p_session_id: sessionId, p_round_id: roundId || null }),
  })

export interface RowFilter { district: string; school: string; q: string }
export const applyFilter = (rows: LeaderboardRow[], f: RowFilter) =>
  rows.filter((r) => (!f.district || r.district === f.district) && (!f.school || r.school === f.school) &&
    (!f.q || `${r.name} ${r.school} ${r.number}`.toLowerCase().includes(f.q.toLowerCase())))

export const status = (r: LeaderboardRow, finished = true) => (r.is_eliminated ? 'Tereliminasi' : finished && r.rank <= 3 ? `Juara ${r.rank}` : finished ? 'Peserta' : `Peringkat ${r.rank}`)

export const rankingColumns = [
  { header: 'Peringkat', key: 'rank', width: 10 }, { header: 'No Peserta', key: 'number', width: 12 }, { header: 'Nama', key: 'name', width: 30 },
  { header: 'Sekolah', key: 'school', width: 28 }, { header: 'Kecamatan', key: 'district', width: 18 }, { header: 'Total Poin', key: 'points', width: 12 },
  { header: 'Benar', key: 'correct', width: 8 }, { header: 'Salah', key: 'wrong', width: 8 }, { header: 'Tidak Menjawab', key: 'unanswered', width: 16 },
  { header: 'Total Waktu Benar (dtk)', key: 'correctSec', width: 22 }, { header: 'Rata-rata Waktu Benar (dtk)', key: 'avgSec', width: 24 },
  { header: 'Poin Soal Tambahan', key: 'tb', width: 18 }, { header: 'Status', key: 'status', width: 14 },
]
export const rankingRows = (rows: LeaderboardRow[], finished = true) => rows.map((r) => ({
  rank: r.rank, number: r.number, name: r.name, school: r.school, district: r.district, points: Number(r.points), correct: r.correct, wrong: r.wrong,
  unanswered: r.unanswered, correctSec: +(r.correct_ms / 1000).toFixed(2), avgSec: r.avg_ms == null ? '' : +(Number(r.avg_ms) / 1000).toFixed(2),
  tb: Number(r.tiebreak_points), status: status(r, finished),
}))
export const rankingPdfBody = (rows: LeaderboardRow[], finished = true) => rows.map((r) => [r.rank, r.number, r.name, r.school, r.district, Number(r.points).toLocaleString('id-ID'), r.correct, r.wrong, r.unanswered, fmtSeconds(r.avg_ms), status(r, finished)])
export const rankingPdfHead = ['#', 'No', 'Nama', 'Sekolah', 'Kecamatan', 'Poin', 'Benar', 'Salah', 'Kosong', 'Rata² waktu', 'Status']

/** Rekap per kecamatan / sekolah (dihitung dari klasemen yang sudah diurutkan backend). */
export function recap(rows: LeaderboardRow[], by: 'district' | 'school') {
  const m = new Map<string, { n: number; pts: number; best: number; correct: number; wrong: number }>()
  for (const r of rows) {
    const k = r[by] || '—'
    const x = m.get(k) ?? { n: 0, pts: 0, best: 0, correct: 0, wrong: 0 }
    x.n++; x.pts += Number(r.points); x.best = Math.max(x.best, Number(r.points)); x.correct += r.correct; x.wrong += r.wrong + r.unanswered
    m.set(k, x)
  }
  return [...m.entries()].map(([name, x]) => ({ name, peserta: x.n, total: +x.pts.toFixed(2), rata: +(x.pts / x.n).toFixed(2), tertinggi: x.best, benar: x.correct, salah: x.wrong })).sort((a, b) => b.rata - a.rata)
}

export const historyColumns = [
  { header: 'Babak', key: 'round', width: 18 }, { header: 'Soal ke-', key: 'seq', width: 9 }, { header: 'Pertanyaan', key: 'question', width: 50 },
  { header: 'No Peserta', key: 'number', width: 12 }, { header: 'Nama', key: 'name', width: 28 }, { header: 'Sekolah', key: 'school', width: 26 },
  { header: 'Kecamatan', key: 'district', width: 16 }, { header: 'Jawaban', key: 'answer', width: 26 }, { header: 'Hasil', key: 'ok', width: 10 },
  { header: 'Waktu Respons (dtk)', key: 'sec', width: 18 }, { header: 'Poin', key: 'points', width: 10 }, { header: 'Status Soal', key: 'qs', width: 12 },
]
export const historyRows = (rows: AnswerHistoryRow[]) => rows.map((h) => ({
  round: h.round, seq: h.sequence, question: h.question, number: h.number, name: h.name, school: h.school, district: h.district,
  answer: h.answer ?? '', ok: h.is_correct ? 'Benar' : 'Salah', sec: +(h.response_time_ms / 1000).toFixed(2), points: Number(h.points), qs: LABELS.cqStatus[h.question_status],
}))
