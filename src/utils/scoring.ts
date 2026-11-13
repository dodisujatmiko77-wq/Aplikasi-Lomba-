// Cermin rumus skor server (public.calculate_score) — HANYA untuk pratinjau di antarmuka admin.
// Skor final selalu dihitung PostgreSQL; nilai dari fungsi ini tidak pernah dikirim ke server.
import type { RoundingMode } from '@/types'

export interface ScoringConfig {
  basePoints: number
  speedBonus: number
  wrongPenalty?: number
  roundingMode?: RoundingMode
  roundingDecimals?: number
}

export function applyRounding(value: number, mode: RoundingMode = 'round', decimals = 2): number {
  const f = 10 ** decimals
  // toPrecision(12) menghilangkan galat biner (mis. 130.8625 * 100 = 13086.249999…)
  const scaled = Number((value * f).toPrecision(12))
  if (mode === 'floor') return Math.floor(scaled) / f
  if (mode === 'ceil') return Math.ceil(scaled) / f
  return Math.round(scaled) / f
}

/** skor = dasar + bonus × (sisa waktu / total waktu) untuk jawaban benar; salah = −penalti. */
export function calculateScore(isCorrect: boolean, totalMs: number, remainingMs: number, cfg: ScoringConfig): number {
  const { basePoints, speedBonus, wrongPenalty = 0, roundingMode = 'round', roundingDecimals = 2 } = cfg
  if (!isCorrect) return applyRounding(wrongPenalty === 0 ? 0 : -wrongPenalty, roundingMode, roundingDecimals)
  const ratio = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0
  return applyRounding(basePoints + speedBonus * ratio, roundingMode, roundingDecimals)
}

export function normalizeAnswer(text: string, caseSensitive = false, ignoreWhitespace = true): string {
  const t = ignoreWhitespace ? text.replace(/\s+/g, '') : text.trim().replace(/\s+/g, ' ')
  return caseSensitive ? t : t.toLowerCase()
}
