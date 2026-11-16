import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Save, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Section } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { fromForm, mergeErrors, toForm, validateForm, type ExtraErrors, type FieldDef, type Values } from '@/lib/form'
import { errorMessage } from '@/lib/supabase'
import { FormFields } from './FormFields'

export interface SettingsSection {
  title: string
  description?: string
  fields: FieldDef[]
  columns?: 1 | 2 | 3 | 4
  /** konten tambahan di bawah kolom (mis. pratinjau) — menerima nilai formulir saat ini */
  extra?: (values: Values, set: (patch: Values) => void) => ReactNode
}

interface Props {
  row: Values
  sections: SettingsSection[]
  onSave: (payload: Values) => Promise<unknown>
  validate?: (values: Values) => ExtraErrors
  /** kolom tambahan di luar FieldDef yang ikut disimpan (mis. daftar kontak) */
  extraPayload?: () => Values
  extraDirty?: boolean
  onReset?: () => void
  successMessage?: string
}

/** Formulir pengaturan berbagian dengan bilah simpan melekat. */
export function SettingsForm({ row, sections, onSave, validate, extraPayload, extraDirty, onReset, successMessage }: Props) {
  const { mosqueId } = useAuth()
  // Definisi kolom bersifat tetap per halaman; nilai formulir hanya diatur ulang saat baris database berubah
  // (bukan setiap kali induk dirender ulang), agar isian yang belum disimpan tidak hilang.
  const fields = sections.flatMap((s) => s.fields)
  const fieldsRef = useRef(fields)
  fieldsRef.current = fields
  const initial = useMemo(() => toForm(row, fieldsRef.current), [row])
  const [values, setValues] = useState<Values>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  useEffect(() => setValues(initial), [initial])

  const dirty = extraDirty || JSON.stringify(values) !== JSON.stringify(initial)
  const set = (patch: Values) => {
    setValues((v) => ({ ...v, ...patch }))
    setErrors((e) => {
      const n = { ...e }
      Object.keys(patch).forEach((k) => delete n[k])
      return n
    })
  }

  const submit = async () => {
    const errs = mergeErrors(validateForm(values, fields), validate?.(values))
    setErrors(errs)
    if (Object.keys(errs).length) {
      toast.error('Periksa kembali isian yang ditandai merah.')
      document.getElementById(`f-${Object.keys(errs)[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setSaving(true)
    try {
      await onSave({ ...fromForm(values, fields, row), ...(extraPayload?.() ?? {}) })
      toast.success(successMessage ?? 'Perubahan disimpan dan langsung tampil di layar.')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="space-y-5 pb-24" noValidate onSubmit={(e) => { e.preventDefault(); void submit() }}>
      {sections.map((s) => (
        <Section key={s.title} title={s.title} description={s.description}>
          {s.fields.length > 0 && <FormFields fields={s.fields} values={values} errors={errors} onChange={set} mosqueId={mosqueId ?? ''} disabled={saving} columns={s.columns ?? 2} />}
          {s.extra?.(values, set)}
        </Section>
      ))}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-3">
          <span className="mr-auto text-sm text-slate-500">{dirty ? 'Ada perubahan yang belum disimpan.' : 'Semua perubahan tersimpan.'}</span>
          <Button variant="secondary" icon={<Undo2 />} disabled={!dirty || saving} onClick={() => { setValues(initial); setErrors({}); onReset?.() }}>Batalkan</Button>
          <Button type="submit" icon={<Save />} loading={saving} disabled={!dirty} data-testid="settings-save">Simpan perubahan</Button>
        </div>
      </div>
    </form>
  )
}
