// Form konfigurasi penilaian — dipakai untuk pengaturan event, default global, dan per babak.
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { calculateScore } from '@/utils/scoring'
import { fmtPoints } from '@/utils/format'
import type { RoundingMode } from '@/types'

export interface ScoringValues {
  base_points: number; speed_bonus: number; wrong_penalty: number; duration_seconds: number
  lead_seconds: number; rounding_mode: RoundingMode; rounding_decimals: number
}

export function ScoringForm({ value, onChange, disabled }: { value: ScoringValues; onChange: (v: ScoringValues) => void; disabled?: boolean }) {
  const num = (k: keyof ScoringValues) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value === '' ? 0 : Number(e.target.value) })
  const d = Math.max(1, Number(value.duration_seconds) || 20)
  const cfg = { basePoints: Number(value.base_points), speedBonus: Number(value.speed_bonus), wrongPenalty: Number(value.wrong_penalty), roundingMode: value.rounding_mode, roundingDecimals: Number(value.rounding_decimals) }
  const samples = [0.1, 0.5, 0.9].map((f) => Math.round(d * f * 10) / 10)
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Skor dasar jawaban benar"><Input type="number" min={0} step="any" value={value.base_points} onChange={num('base_points')} disabled={disabled} /></Field>
        <Field label="Bonus maksimal kecepatan"><Input type="number" min={0} step="any" value={value.speed_bonus} onChange={num('speed_bonus')} disabled={disabled} /></Field>
        <Field label="Penalti jawaban salah" hint="0 = tanpa penalti"><Input type="number" min={0} step="any" value={value.wrong_penalty} onChange={num('wrong_penalty')} disabled={disabled} /></Field>
        <Field label="Durasi menjawab (detik)"><Input type="number" min={3} max={600} value={value.duration_seconds} onChange={num('duration_seconds')} disabled={disabled} /></Field>
        <Field label="Hitung mundur sebelum soal (detik)"><Input type="number" min={0} max={30} value={value.lead_seconds} onChange={num('lead_seconds')} disabled={disabled} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Pembulatan">
            <SimpleSelect value={value.rounding_mode} onChange={(v) => onChange({ ...value, rounding_mode: v as RoundingMode })} disabled={disabled}
              options={[{ value: 'round', label: 'Terdekat' }, { value: 'floor', label: 'Ke bawah' }, { value: 'ceil', label: 'Ke atas' }]} />
          </Field>
          <Field label="Desimal"><Input type="number" min={0} max={4} value={value.rounding_decimals} onChange={num('rounding_decimals')} disabled={disabled} /></Field>
        </div>
      </div>
      <div className="rounded-xl border bg-navy-50/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-navy-600">Pratinjau · skor = {fmtPoints(cfg.basePoints)} + {fmtPoints(cfg.speedBonus)} × (sisa waktu ÷ {d} dtk)</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {samples.map((s) => (
            <div key={s} className="rounded-lg bg-white p-3 shadow-sm">
              <p className="text-xs text-muted-foreground">Benar pada detik ke-{s.toLocaleString('id-ID')}</p>
              <p className="tabular font-heading text-xl font-bold text-navy-900">{fmtPoints(calculateScore(true, d * 1000, (d - s) * 1000, cfg))}</p>
            </div>
          ))}
          <div className="rounded-lg bg-white p-3 shadow-sm">
            <p className="text-xs text-muted-foreground">Salah / tidak menjawab</p>
            <p className="tabular font-heading text-xl font-bold text-red-600">{fmtPoints(calculateScore(false, d * 1000, 0, cfg))} / 0</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Pratinjau saja. Skor resmi selalu dihitung server dari waktu server.</p>
      </div>
    </div>
  )
}
