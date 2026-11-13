import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Download, FileDown, Image as ImageIcon, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import { list, listByIds, remove, rpc, update } from '@/services/db'
import { useAuth } from '@/contexts/AuthContext'
import { useEvent, useLevels } from '@/contexts/EventContext'
import { useAction } from '@/hooks/useAction'
import { useConfirm } from '@/components/confirm'
import { NeedEvent } from '@/features/auth/guards'
import { EmptyState, ImageUpload, Loading, PageHeader, Pager, SearchInput, usePaged } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { Switch, SwitchRow } from '@/components/ui/switch'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { exportExcel, readExcel } from '@/utils/excel'
import { LABELS } from '@/utils/format'
import type { Difficulty, Question, QuestionCategory, QuestionOption, QuestionType } from '@/types'

interface DraftOption { id?: string; text: string; is_correct: boolean }
interface Draft {
  id?: string; type: QuestionType; question_text: string; image_url: string | null; category_id: string; category: string
  education_level_id: string; difficulty: Difficulty; explanation: string; case_sensitive: boolean; ignore_whitespace: boolean
  is_active: boolean; options: DraftOption[]
}
interface ImportResult { row: number; ok: boolean; error?: string }

const DIFF_VARIANT = { easy: 'green', medium: 'blue', hard: 'orange' } as const
const defaultOptions = (type: QuestionType): DraftOption[] =>
  type === 'true_false' ? [{ text: 'Benar', is_correct: true }, { text: 'Salah', is_correct: false }]
  : type === 'short_answer' ? [{ text: '', is_correct: true }]
  : [0, 1, 2, 3].map((i) => ({ text: '', is_correct: i === 0 }))

export function useQuestionBank(eventId: string) {
  return useQuery({
    queryKey: ['questions', eventId],
    queryFn: async () => {
      const questions = await list<Question>('questions', { filters: { event_id: eventId }, order: [{ column: 'created_at', ascending: false }] })
      const options = await listByIds<QuestionOption>('question_options', questions.map((q) => q.id), 'question_id')
      const byQ = new Map<string, QuestionOption[]>()
      for (const o of options.sort((a, b) => a.sort_order - b.sort_order)) byQ.set(o.question_id, [...(byQ.get(o.question_id) ?? []), o])
      return { questions, optionsByQuestion: byQ }
    },
  })
}

function parseImportRow(r: Record<string, string>) {
  const t = (r.tipe || r.type || 'PG').toUpperCase().replace(/[^A-Z]/g, '')
  const type: QuestionType = /^(BS|BENARSALAH|TRUEFALSE|TF)$/.test(t) ? 'true_false' : /^(ISIAN|JAWABANSINGKAT|SHORT|SHORTANSWER)$/.test(t) ? 'short_answer' : 'multiple_choice'
  const key = (r.kunci || r.kuncijawaban || r.jawaban || '').trim()
  let options: DraftOption[] = []
  if (type === 'multiple_choice') {
    const letters = ['a', 'b', 'c', 'd', 'e', 'f']
    options = letters.map((l) => ({ text: r['opsi' + l] || r['pilihan' + l] || '', letter: l })).filter((o) => o.text)
      .map((o) => ({ text: o.text, is_correct: key.toLowerCase() === o.letter || key.toLowerCase() === o.text.toLowerCase() }))
  } else if (type === 'true_false') {
    const benar = /^(b|benar|true|ya)$/i.test(key)
    const salah = /^(s|salah|false|tidak)$/i.test(key)
    options = [{ text: 'Benar', is_correct: benar }, { text: 'Salah', is_correct: salah }]
  } else {
    options = key.split('|').map((s) => s.trim()).filter(Boolean).map((text) => ({ text, is_correct: true }))
  }
  const d = (r.kesulitan || r.tingkatkesulitan || '').toLowerCase()
  return {
    type, question_text: r.soal || r.pertanyaan || '', options,
    category: r.kategori || undefined, level: r.jenjang || undefined,
    difficulty: d.startsWith('mud') || d === 'easy' ? 'easy' : d.startsWith('sul') || d === 'hard' ? 'hard' : 'medium',
    explanation: r.pembahasan || undefined, image_url: r.gambar || r.urlgambar || undefined,
  }
}

function Inner({ eventId }: { eventId: string }) {
  const { can } = useAuth()
  const { event } = useEvent()
  const { levels, levelMap } = useLevels()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { busy, run } = useAction()
  const canEdit = can(eventId, 'questions')
  const fileRef = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [cat, setCat] = useState('')
  const [level, setLevel] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [importResult, setImportResult] = useState<ImportResult[] | null>(null)

  const bank = useQuestionBank(eventId)
  const { data: categories = [] } = useQuery({ queryKey: ['question_categories'], queryFn: () => list<QuestionCategory>('question_categories', { order: [{ column: 'name' }] }) })
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const reload = async () => { await qc.invalidateQueries({ queryKey: ['questions', eventId] }); await qc.invalidateQueries({ queryKey: ['question_categories'] }) }

  const questions = bank.data?.questions ?? []
  const opts = bank.data?.optionsByQuestion ?? new Map<string, QuestionOption[]>()
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return questions.filter((x) => (!type || x.type === type) && (!cat || x.category_id === cat) && (!level || x.education_level_id === level) && (!q || x.question_text.toLowerCase().includes(q)))
  }, [questions, search, type, cat, level])
  const paged = usePaged(filtered, 20)
  const keyOf = (q: Question) => (opts.get(q.id) ?? []).filter((o) => o.is_correct).map((o) => o.option_text).join(' / ')

  const openNew = () => setDraft({ type: 'multiple_choice', question_text: '', image_url: null, category_id: cat, category: '', education_level_id: level, difficulty: 'medium', explanation: '', case_sensitive: false, ignore_whitespace: true, is_active: true, options: defaultOptions('multiple_choice') })
  const openEdit = (q: Question) => setDraft({
    id: q.id, type: q.type, question_text: q.question_text, image_url: q.image_url, category_id: q.category_id ?? '', category: '', education_level_id: q.education_level_id ?? '',
    difficulty: q.difficulty, explanation: q.explanation ?? '', case_sensitive: q.case_sensitive, ignore_whitespace: q.ignore_whitespace, is_active: q.is_active,
    options: (opts.get(q.id) ?? []).map((o) => ({ id: o.id, text: o.option_text, is_correct: o.is_correct })),
  })
  const setOpt = (i: number, patch: Partial<DraftOption>) => setDraft((d) => d && { ...d, options: d.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) })
  const markCorrect = (i: number) => setDraft((d) => d && { ...d, options: d.options.map((o, j) => ({ ...o, is_correct: j === i })) })

  const save = async () => {
    if (!draft) return
    const ok = await run(async () => {
      await rpc('admin_save_question', { p_data: { ...draft, event_id: eventId, category_id: draft.category ? '' : draft.category_id, category: draft.category || undefined } })
      await reload()
    }, 'Soal tersimpan')
    if (ok) setDraft(null)
  }
  const del = async (q: Question) => {
    if (await confirm({ title: 'Hapus soal ini?', description: 'Soal yang sudah dipakai pada sesi kompetisi tidak dapat dihapus; nonaktifkan saja.', destructive: true }))
      await run(async () => { await remove('questions', { id: q.id }); await reload() }, 'Soal dihapus')
  }
  const toggleActive = (q: Question, v: boolean) => run(async () => { await update('questions', { id: q.id }, { is_active: v }); await reload() })

  const doExport = () => exportExcel(`bank-soal-${event?.name ?? 'event'}`, [{
    name: 'Soal',
    columns: COLS,
    rows: filtered.map((q) => {
      const o = opts.get(q.id) ?? []
      const letters = ['A', 'B', 'C', 'D', 'E']
      return {
        tipe: q.type === 'multiple_choice' ? 'PG' : q.type === 'true_false' ? 'BS' : 'ISIAN', soal: q.question_text,
        a: q.type === 'multiple_choice' ? o[0]?.option_text : '', b: q.type === 'multiple_choice' ? o[1]?.option_text : '', c: q.type === 'multiple_choice' ? o[2]?.option_text : '',
        d: q.type === 'multiple_choice' ? o[3]?.option_text : '', e: q.type === 'multiple_choice' ? o[4]?.option_text : '',
        kunci: q.type === 'multiple_choice' ? letters[o.findIndex((x) => x.is_correct)] : q.type === 'true_false' ? o.find((x) => x.is_correct)?.option_text : o.map((x) => x.option_text).join(' | '),
        kategori: q.category_id ? catMap.get(q.category_id) : '', jenjang: q.education_level_id ? levelMap.get(q.education_level_id)?.code : '',
        kesulitan: LABELS.difficulty[q.difficulty], pembahasan: q.explanation ?? '',
      }
    }),
  }])
  const template = () => exportExcel('template-import-soal', [{
    name: 'Soal', columns: COLS,
    rows: [
      { tipe: 'PG', soal: 'Ibu kota Indonesia adalah …', a: 'Jakarta', b: 'Bandung', c: 'Surabaya', d: 'Medan', kunci: 'A', kategori: 'Pengetahuan Umum', jenjang: 'SMP', kesulitan: 'Mudah', pembahasan: '' },
      { tipe: 'BS', soal: 'Matahari terbit dari timur.', kunci: 'Benar', kategori: 'IPA', jenjang: 'SD', kesulitan: 'Mudah' },
      { tipe: 'ISIAN', soal: 'Berapakah 7 × 8?', kunci: '56 | lima puluh enam', kategori: 'Matematika', jenjang: 'SMP', kesulitan: 'Sedang' },
    ],
    note: 'Tipe: PG / BS / ISIAN. Kunci PG = huruf opsi; BS = Benar/Salah; ISIAN = jawaban yang diterima dipisah tanda |',
  }])
  const doImport = async (file?: File) => {
    if (!file) return
    await run(async () => {
      const rows = (await readExcel(file)).map(parseImportRow)
      if (!rows.length) throw new Error('Tidak ada baris data pada berkas')
      const out: ImportResult[] = []
      for (let i = 0; i < rows.length; i += 200) {
        const part = await rpc<ImportResult[]>('admin_import_questions', { p_event_id: eventId, p_rows: rows.slice(i, i + 200) })
        out.push(...part.map((r) => ({ ...r, row: r.row + i })))
      }
      setImportResult(out)
      await reload()
    })
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div>
      <PageHeader
        title="Bank Soal"
        description="Kunci jawaban tersimpan di server dan tidak pernah dikirim ke peserta atau monitor selama soal aktif."
        actions={
          <>
            <Button variant="outline" onClick={() => void doExport()} disabled={!questions.length}><Download /> Export</Button>
            {canEdit && (
              <>
                <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => void doImport(e.target.files?.[0])} />
                <Button variant="outline" onClick={() => void template()}><FileDown /> Template</Button>
                <Button variant="outline" loading={busy} onClick={() => fileRef.current?.click()}><Upload /> Import Excel</Button>
                <Button onClick={openNew}><Plus /> Soal baru</Button>
              </>
            )}
          </>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Cari teks soal…" className="w-full sm:w-72" />
          <SimpleSelect value={type} onChange={setType} allLabel="Semua tipe" options={Object.entries(LABELS.questionType).map(([value, label]) => ({ value, label }))} className="w-44" />
          <SimpleSelect value={cat} onChange={setCat} allLabel="Semua kategori" options={categories.map((c) => ({ value: c.id, label: c.name }))} className="w-48" />
          <SimpleSelect value={level} onChange={setLevel} allLabel="Semua jenjang" options={levels.map((l) => ({ value: l.id, label: l.name }))} className="w-40" />
        </div>
        {bank.isLoading ? <Loading /> : !filtered.length ? (
          <EmptyState title={questions.length ? 'Tidak ada soal yang cocok' : 'Bank soal masih kosong'} description={questions.length ? 'Ubah kata kunci atau filter.' : 'Buat soal baru atau impor dari Excel.'} />
        ) : (
          <>
            <Table>
              <THead><TR><TH>Soal</TH><TH>Tipe</TH><TH>Kategori</TH><TH>Jenjang</TH><TH>Kesulitan</TH><TH>Kunci jawaban</TH><TH>Aktif</TH>{canEdit && <TH className="w-20" />}</TR></THead>
              <TBody>
                {paged.slice.map((q) => (
                  <TR key={q.id}>
                    <TD className="max-w-md"><p className="line-clamp-2 font-medium text-navy-900">{q.image_url && <ImageIcon className="mr-1.5 inline h-3.5 w-3.5 text-electric-500" />}{q.question_text}</p></TD>
                    <TD className="whitespace-nowrap">{LABELS.questionType[q.type]}</TD>
                    <TD>{q.category_id ? catMap.get(q.category_id) : '—'}</TD>
                    <TD>{q.education_level_id ? levelMap.get(q.education_level_id)?.code : 'Semua'}</TD>
                    <TD><Badge variant={DIFF_VARIANT[q.difficulty]}>{LABELS.difficulty[q.difficulty]}</Badge></TD>
                    <TD className="max-w-[14rem]"><span className="line-clamp-1 text-emerald-700"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />{keyOf(q) || '—'}</span></TD>
                    <TD><Switch checked={q.is_active} disabled={!canEdit} onCheckedChange={(v) => void toggleActive(q, v)} aria-label="Aktif" /></TD>
                    {canEdit && (
                      <TD className="whitespace-nowrap text-right">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(q)} aria-label="Ubah"><Pencil /></Button>
                        <Button size="icon" variant="ghost" className="text-red-600" onClick={() => void del(q)} aria-label="Hapus"><Trash2 /></Button>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pager page={paged.page} pages={paged.pages} total={paged.total} onPage={paged.setPage} />
          </>
        )}
      </Card>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>{draft?.id ? 'Ubah soal' : 'Soal baru'}</DialogTitle></DialogHeader>
          {draft && (
            <DialogBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Tipe soal">
                  <SimpleSelect value={draft.type} onChange={(v) => setDraft({ ...draft, type: v as QuestionType, options: defaultOptions(v as QuestionType) })} options={Object.entries(LABELS.questionType).map(([value, label]) => ({ value, label }))} />
                </Field>
                <Field label="Jenjang"><SimpleSelect value={draft.education_level_id} onChange={(v) => setDraft({ ...draft, education_level_id: v })} allLabel="Semua jenjang" options={levels.map((l) => ({ value: l.id, label: l.name }))} /></Field>
                <Field label="Tingkat kesulitan"><SimpleSelect value={draft.difficulty} onChange={(v) => setDraft({ ...draft, difficulty: v as Difficulty })} options={Object.entries(LABELS.difficulty).map(([value, label]) => ({ value, label }))} /></Field>
              </div>
              <Field label="Pertanyaan"><Textarea rows={3} value={draft.question_text} onChange={(e) => setDraft({ ...draft, question_text: e.target.value })} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Kategori"><SimpleSelect value={draft.category_id} onChange={(v) => setDraft({ ...draft, category_id: v, category: '' })} allLabel="Tanpa kategori" options={categories.map((c) => ({ value: c.id, label: c.name }))} /></Field>
                <Field label="…atau kategori baru"><Input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="Nama kategori baru" /></Field>
              </div>
              <Field label="Gambar soal (opsional)"><ImageUpload bucket="question-images" value={draft.image_url} onChange={(url) => setDraft({ ...draft, image_url: url })} /></Field>

              <div className="rounded-xl border bg-navy-50/50 p-4">
                <p className="mb-3 text-sm font-semibold text-navy-900">
                  {draft.type === 'short_answer' ? 'Jawaban yang diterima' : 'Pilihan jawaban'}
                  <span className="ml-2 font-normal text-muted-foreground">{draft.type === 'short_answer' ? 'Semua variasi di bawah dianggap benar.' : 'Tandai satu kunci jawaban.'}</span>
                </p>
                <div className="space-y-2">
                  {draft.options.map((o, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {draft.type !== 'short_answer' && (
                        <button type="button" onClick={() => markCorrect(i)} aria-label={`Jadikan opsi ${i + 1} kunci jawaban`} aria-pressed={o.is_correct}
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-sm font-bold ${o.is_correct ? 'border-emerald-500 bg-emerald-500 text-white' : 'bg-white text-navy-600'}`}>
                          {String.fromCharCode(65 + i)}
                        </button>
                      )}
                      <Input value={o.text} disabled={draft.type === 'true_false'} onChange={(e) => setOpt(i, { text: e.target.value })} placeholder={draft.type === 'short_answer' ? 'Jawaban yang diterima' : `Opsi ${String.fromCharCode(65 + i)}`} />
                      {draft.type !== 'true_false' && draft.options.length > (draft.type === 'short_answer' ? 1 : 2) && (
                        <Button size="icon" variant="ghost" onClick={() => setDraft({ ...draft, options: draft.options.filter((_, j) => j !== i) })} aria-label="Hapus opsi"><X /></Button>
                      )}
                    </div>
                  ))}
                </div>
                {draft.type !== 'true_false' && draft.options.length < 6 && (
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => setDraft({ ...draft, options: [...draft.options, { text: '', is_correct: draft.type === 'short_answer' }] })}><Plus /> Tambah {draft.type === 'short_answer' ? 'variasi jawaban' : 'opsi'}</Button>
                )}
                {draft.type === 'short_answer' && (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <SwitchRow label="Abaikan spasi" hint='"buku tulis" = "bukutulis"' checked={draft.ignore_whitespace} onChange={(v) => setDraft({ ...draft, ignore_whitespace: v })} />
                    <SwitchRow label="Peka huruf besar/kecil" hint='Bila mati, "Asia" = "asia"' checked={draft.case_sensitive} onChange={(v) => setDraft({ ...draft, case_sensitive: v })} />
                  </div>
                )}
              </div>
              <Field label="Pembahasan (ditampilkan setelah jawaban dibuka)"><Textarea rows={2} value={draft.explanation} onChange={(e) => setDraft({ ...draft, explanation: e.target.value })} /></Field>
            </DialogBody>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setDraft(null)}>Batal</Button><Button loading={busy} onClick={() => void save()}>Simpan soal</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!importResult} onOpenChange={(o) => !o && setImportResult(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Hasil import soal</DialogTitle><DialogDescription>{importResult?.filter((r) => r.ok).length ?? 0} soal berhasil, {importResult?.filter((r) => !r.ok).length ?? 0} gagal.</DialogDescription></DialogHeader>
          <DialogBody>
            {importResult?.some((r) => !r.ok) ? (
              <ul className="space-y-1.5 text-sm">{importResult.filter((r) => !r.ok).map((r) => <li key={r.row} className="rounded-md bg-red-50 px-3 py-2 text-red-800">Baris {r.row + 1}: {r.error}</li>)}</ul>
            ) : <p className="text-sm text-emerald-700">Semua baris berhasil diimpor.</p>}
          </DialogBody>
          <DialogFooter><Button onClick={() => setImportResult(null)}>Tutup</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const COLS = [
  { header: 'Tipe', key: 'tipe', width: 8 }, { header: 'Soal', key: 'soal', width: 50 }, { header: 'Opsi A', key: 'a', width: 20 }, { header: 'Opsi B', key: 'b', width: 20 },
  { header: 'Opsi C', key: 'c', width: 20 }, { header: 'Opsi D', key: 'd', width: 20 }, { header: 'Opsi E', key: 'e', width: 20 }, { header: 'Kunci', key: 'kunci', width: 20 },
  { header: 'Kategori', key: 'kategori', width: 18 }, { header: 'Jenjang', key: 'jenjang', width: 10 }, { header: 'Kesulitan', key: 'kesulitan', width: 12 }, { header: 'Pembahasan', key: 'pembahasan', width: 40 },
]

export default function QuestionsPage() {
  return <NeedEvent>{(id) => <Inner key={id} eventId={id} />}</NeedEvent>
}
