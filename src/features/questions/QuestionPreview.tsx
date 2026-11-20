// Pratinjau soal untuk admin: menampilkan soal seperti di HP peserta dan di layar utama (monitor).
// Murni tampilan (tidak mengirim jawaban, tidak memakai timer/RPC) dan berdiri sendiri, sehingga tidak
// memengaruhi halaman peserta maupun monitor yang sebenarnya.
import { useState } from 'react'
import { CheckCircle2, Monitor, Smartphone } from 'lucide-react'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { QuestionType } from '@/types'

export interface PreviewQuestion {
  type: QuestionType
  text: string
  imageUrl?: string | null
  category?: string | null
  explanation?: string | null
  options: { text: string; isCorrect: boolean }[]
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
const HP_COLORS = ['bg-blue-600', 'bg-orange-500', 'bg-emerald-600', 'bg-purple-600', 'bg-pink-600', 'bg-teal-600']
const MON_COLORS = ['bg-blue-600', 'bg-orange-500', 'bg-emerald-600', 'bg-purple-600', 'bg-pink-600', 'bg-teal-600']
const u = (n: number) => `${n}cqw`

function visibleOptions(q: PreviewQuestion) {
  return q.type === 'true_false'
    ? [{ text: 'Benar', isCorrect: q.options[0]?.isCorrect ?? false }, { text: 'Salah', isCorrect: q.options[1]?.isCorrect ?? false }]
    : q.options.filter((o) => o.text.trim())
}

/** Tampilan di HP peserta saat soal aktif (atau setelah jawaban dibuka bila `reveal`). */
function PhoneView({ q, reveal, seconds }: { q: PreviewQuestion; reveal: boolean; seconds: number }) {
  const options = visibleOptions(q)
  const correct = options.filter((o) => o.isCorrect).map((o) => o.text).join(' / ')
  return (
    <div className="mx-auto w-[340px] max-w-full overflow-hidden rounded-[2.2rem] border-[10px] border-navy-900 bg-background shadow-2xl">
      <div className="flex h-[560px] flex-col">
        <div className="bg-navy-900 px-4 pb-3 pt-3 text-white">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-navy-200">
            <span>Soal 1 / 10</span>{q.category && <span>{q.category}</span>}
          </div>
          {!reveal && (
            <div className="mt-2 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/15"><div className="h-full w-[80%] rounded-full bg-emerald-400" /></div>
              <span className="tabular w-10 text-right font-heading text-2xl font-extrabold">{seconds}</span>
            </div>
          )}
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <h2 className="text-xl font-bold leading-snug text-navy-900">{q.text || <span className="text-muted-foreground">(Teks soal masih kosong)</span>}</h2>
          {q.imageUrl && <img src={q.imageUrl} alt="" className="max-h-56 w-full rounded-xl border object-contain" />}
          {q.type === 'short_answer' ? (
            <div className="flex h-16 items-center rounded-md border bg-white px-3 text-xl text-muted-foreground">Ketik jawaban…</div>
          ) : (
            <div className="grid gap-3">
              {options.map((o, i) => {
                const good = reveal && o.isCorrect
                return (
                  <div key={i} className={cn('flex min-h-[64px] items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-lg font-semibold',
                    good ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-border bg-white text-navy-900')}>
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base font-bold text-white', HP_COLORS[i % 6])}>{LETTERS[i]}</span>
                    <span className="flex-1 break-words">{o.text}</span>
                    {good && <CheckCircle2 className="h-6 w-6 text-emerald-600" />}
                  </div>
                )
              })}
            </div>
          )}
          {reveal && (
            <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-900">
              <p className="text-sm">Jawaban benar: <b>{correct || '—'}</b></p>
              {q.explanation && <p className="mt-2 text-sm opacity-90">{q.explanation}</p>}
            </div>
          )}
        </div>
        {!reveal && (
          <div className="border-t bg-white p-3">
            <div className="flex h-14 w-full items-center justify-center rounded-md bg-gradient-to-r from-orange-500 to-orange-400 text-lg font-semibold text-white">Kirim jawaban</div>
            <p className="mt-1.5 text-center text-xs text-muted-foreground">Jawaban tidak dapat diubah setelah dikirim.</p>
          </div>
        )}
      </div>
    </div>
  )
}

/** Tampilan di layar utama (monitor 16:9) saat soal tayang. */
function MonitorView({ q, reveal, seconds }: { q: PreviewQuestion; reveal: boolean; seconds: number }) {
  const options = visibleOptions(q)
  return (
    <div className="stage-bg relative w-full overflow-hidden rounded-xl text-white shadow-2xl" style={{ aspectRatio: '16 / 9', containerType: 'size' }}>
      <div className="grid-lines absolute inset-0 flex flex-col" style={{ padding: `${u(2.2)} ${u(3)}`, gap: u(1.6) }}>
        <div className="flex items-center" style={{ gap: u(2) }}>
          <span className="rounded-2xl bg-white/10 font-heading font-extrabold" style={{ padding: `${u(0.6)} ${u(1.6)}`, fontSize: u(2.4) }}>Soal 1<span className="text-navy-300">/10</span></span>
          {q.category && <span className="rounded-full bg-electric-500/20 font-semibold text-electric-400" style={{ padding: `${u(0.4)} ${u(1.2)}`, fontSize: u(1.6) }}>{q.category}</span>}
          <span className="font-heading font-extrabold tabular" style={{ fontSize: u(7), lineHeight: 1, marginLeft: 'auto' }}>{seconds}</span>
        </div>
        <div className="overflow-hidden rounded-full bg-white/10" style={{ height: u(1) }}><div className="h-full w-[80%] rounded-full bg-emerald-400" /></div>
        <div className="flex min-h-0 flex-1 flex-col justify-center" style={{ gap: u(2) }}>
          <div className="flex items-center" style={{ gap: u(2.4) }}>
            {q.imageUrl && <img src={q.imageUrl} alt="" className="shrink-0 rounded-2xl object-contain" style={{ maxHeight: u(18), maxWidth: u(26) }} />}
            <h2 className="font-heading font-bold leading-tight text-balance" style={{ fontSize: u(q.text.length > 140 ? 2.7 : q.text.length > 80 ? 3.3 : 4) }}>{q.text || '(Teks soal masih kosong)'}</h2>
          </div>
          {q.type === 'short_answer'
            ? <p className="rounded-2xl border border-dashed border-white/25 text-center text-navy-200" style={{ padding: u(2), fontSize: u(2.4) }}>Ketik jawaban singkat di HP masing-masing</p>
            : (
              <div className={cn('grid', options.length > 2 ? 'grid-cols-2' : 'grid-cols-1')} style={{ gap: u(1.4) }}>
                {options.map((o, i) => {
                  const good = reveal && o.isCorrect
                  return (
                    <div key={i} className={cn('flex items-center rounded-2xl border', good ? 'border-emerald-400 bg-emerald-500/20' : 'border-white/15 bg-white/[0.08]', reveal && !o.isCorrect && 'opacity-60')}
                      style={{ gap: u(1.4), padding: `${u(1.1)} ${u(1.6)}` }}>
                      <span className={cn('flex shrink-0 items-center justify-center rounded-xl font-heading font-extrabold', MON_COLORS[i % 6])} style={{ width: u(4.4), height: u(4.4), fontSize: u(2.4) }}>{LETTERS[i]}</span>
                      <span className="font-semibold leading-snug" style={{ fontSize: u(2.6) }}>{o.text}</span>
                    </div>
                  )
                })}
              </div>
            )}
        </div>
      </div>
    </div>
  )
}

/** Jendela pratinjau: pilih tampilan HP atau layar utama; opsional tampilkan kunci jawaban. */
export function QuestionPreviewDialog({ open, onOpenChange, question, seconds = 20 }: {
  open: boolean; onOpenChange: (o: boolean) => void; question: PreviewQuestion | null; seconds?: number
}) {
  const [view, setView] = useState<'hp' | 'monitor'>('hp')
  const [reveal, setReveal] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Pratinjau soal</DialogTitle>
          <DialogDescription>Perkiraan tampilan soal di HP peserta dan di layar utama. Tampilan asli dapat sedikit berbeda menurut ukuran layar.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={view === 'hp' ? 'default' : 'outline'} onClick={() => setView('hp')}><Smartphone /> HP peserta</Button>
            <Button size="sm" variant={view === 'monitor' ? 'default' : 'outline'} onClick={() => setView('monitor')}><Monitor /> Layar utama (laptop/proyektor)</Button>
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm font-medium text-navy-800">
              <input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} className="h-4 w-4" /> Tampilkan kunci jawaban
            </label>
          </div>
          {question && (view === 'hp' ? <PhoneView q={question} reveal={reveal} seconds={seconds} /> : <MonitorView q={question} reveal={reveal} seconds={seconds} />)}
        </DialogBody>
        <DialogFooter><Button onClick={() => onOpenChange(false)}>Tutup</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
