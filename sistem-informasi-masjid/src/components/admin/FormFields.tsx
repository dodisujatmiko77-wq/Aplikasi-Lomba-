import { useRef, useState, type ReactNode } from 'react'
import { ImagePlus, Trash2, UploadCloud } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Spinner, Toggle } from '@/components/ui'
import type { FieldDef, Values } from '@/lib/form'
import { checkFile, MAX_IMAGE_MB, MAX_VIDEO_MB, uploadMedia } from '@/lib/storage'
import { errorMessage } from '@/lib/supabase'

export function Field({ label, error, hint, required, children, htmlFor }: { label: string; error?: string; hint?: string; required?: boolean; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-red-600" role="alert">{error}</p> : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

interface FileProps {
  value: string
  mediaType: string | null
  accept: 'image' | 'media'
  folder: string
  mosqueId: string
  error?: boolean
  disabled?: boolean
  onUploaded: (url: string, path: string, mediaType: 'image' | 'video') => void
  onClear: () => void
}

export function FileInput({ value, mediaType, accept, folder, mosqueId, error, disabled, onUploaded, onClear }: FileProps) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const pick = async (file: File | undefined) => {
    if (!file) return
    const problem = checkFile(file, accept)
    if (problem) return void toast.error(problem)
    setBusy(true)
    try {
      const up = await uploadMedia(file, mosqueId, folder)
      onUploaded(up.url, up.path, up.mediaType)
    } catch (e) {
      toast.error('Gagal mengunggah: ' + errorMessage(e))
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ''
    }
  }
  return (
    <div className={`rounded-xl border border-dashed p-3 ${error ? 'border-red-400 bg-red-50/40' : 'border-slate-300 bg-slate-50'}`}>
      <input ref={ref} type="file" className="hidden" data-testid={`file-${folder}`}
        accept={accept === 'media' ? 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm' : 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'}
        onChange={(e) => void pick(e.target.files?.[0])} />
      {value ? (
        <div className="flex items-center gap-4">
          {mediaType === 'video'
            ? <video src={value} className="h-24 w-40 rounded-lg bg-black object-contain" muted controls />
            : <img src={value} alt="Pratinjau" className="h-24 w-24 rounded-lg border border-slate-200 bg-white object-contain" />}
          <div className="flex flex-col gap-2">
            <Button size="sm" variant="secondary" icon={<UploadCloud />} loading={busy} disabled={disabled} onClick={() => ref.current?.click()}>Ganti berkas</Button>
            <Button size="sm" variant="ghost" icon={<Trash2 />} disabled={disabled || busy} onClick={onClear}>Hapus</Button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={disabled || busy} onClick={() => ref.current?.click()}
          className="flex w-full flex-col items-center gap-1.5 py-5 text-sm text-slate-600 hover:text-emerald-700 disabled:opacity-60">
          {busy ? <Spinner /> : <ImagePlus className="h-7 w-7 text-emerald-600" />}
          <span className="font-medium">{busy ? 'Mengunggah…' : 'Klik untuk memilih berkas'}</span>
          <span className="text-xs text-slate-500">
            {accept === 'media' ? `Gambar (maks. ${MAX_IMAGE_MB} MB) atau video MP4/WEBM (maks. ${MAX_VIDEO_MB} MB)` : `PNG, JPG, WEBP, atau SVG · maks. ${MAX_IMAGE_MB} MB`}
          </span>
        </button>
      )}
    </div>
  )
}

interface FormProps {
  fields: FieldDef[]
  values: Values
  errors: Record<string, string>
  onChange: (patch: Values) => void
  mosqueId: string
  disabled?: boolean
  columns?: 1 | 2 | 3 | 4
  /** awalan id elemen — formulir di dalam dialog memakai awalan berbeda agar id tidak ganda */
  idPrefix?: string
}

const GRID = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'grid-cols-2 lg:grid-cols-4' }
const SPAN = { 1: '', 2: 'sm:col-span-2', 3: 'sm:col-span-2 lg:col-span-3', 4: 'col-span-2 lg:col-span-4' }

/** Merender daftar kolom formulir dari definisi FieldDef. */
export function FormFields({ fields, values, errors, onChange, mosqueId, disabled, columns = 2, idPrefix = 'f-' }: FormProps) {
  return (
    <div className={`grid grid-cols-1 gap-x-5 gap-y-4 ${GRID[columns]}`}>
      {fields.map((f) => {
        if (f.showIf && !f.showIf(values)) return null
        const id = `${idPrefix}${f.name}`
        const err = errors[f.name]
        const val = values[f.name]
        const str = typeof val === 'string' ? val : val === null || val === undefined ? '' : String(val)
        const cls = `input ${err ? 'input-error' : ''}`
        const set = (v: unknown) => onChange({ [f.name]: v })
        const wide = f.full || f.type === 'textarea' || f.type === 'file'

        if (f.type === 'toggle') {
          return (
            <div key={f.name} className={`flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 ${wide ? SPAN[columns] : ''}`}>
              <div>
                <p className="text-sm font-medium text-slate-800">{f.label}</p>
                {f.hint && <p className="text-xs text-slate-500">{f.hint}</p>}
              </div>
              <Toggle checked={Boolean(val)} onChange={set} disabled={disabled} label={f.label} />
            </div>
          )
        }
        return (
          <div key={f.name} className={wide ? SPAN[columns] : ''}>
            <Field label={f.label} error={err} hint={f.hint} required={f.required} htmlFor={id}>
              {f.type === 'textarea' ? (
                <textarea id={id} className={`${cls} ${f.rtl ? 'font-arabic text-xl leading-loose' : ''}`} dir={f.rtl ? 'rtl' : undefined} rows={f.rows ?? 3} value={str} maxLength={f.maxLength}
                  placeholder={f.placeholder} disabled={disabled} onChange={(e) => set(e.target.value)} />
              ) : f.type === 'select' ? (
                <select id={id} className={cls} value={str} disabled={disabled} onChange={(e) => set(e.target.value)}>
                  {(!f.required || !str) && <option value="">{f.placeholder ?? '— Pilih —'}</option>}
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === 'file' ? (
                <FileInput value={str} mediaType={f.typeField ? (values[f.typeField] as string | null) : 'image'} accept={f.accept ?? 'image'} folder={f.folder ?? 'umum'}
                  mosqueId={mosqueId} error={!!err} disabled={disabled}
                  onUploaded={(url, path, mediaType) => onChange({ [f.name]: url, ...(f.pathField ? { [f.pathField]: path } : {}), ...(f.typeField ? { [f.typeField]: mediaType } : {}) })}
                  onClear={() => onChange({ [f.name]: '', ...(f.pathField ? { [f.pathField]: null } : {}) })} />
              ) : f.type === 'color' ? (
                <div className="flex items-center gap-3">
                  <input id={id} type="color" value={/^#[0-9a-fA-F]{6}$/.test(str) ? str : '#000000'} disabled={disabled} onChange={(e) => set(e.target.value)}
                    className="h-11 w-14 cursor-pointer rounded-lg border border-slate-300 bg-white p-1" />
                  <input className={cls} value={str} disabled={disabled} onChange={(e) => set(e.target.value)} aria-label={`${f.label} (kode hex)`} maxLength={7} />
                </div>
              ) : (
                <div className="relative">
                  <input id={id} className={`${cls} ${f.suffix ? 'pr-16' : ''}`} value={str} disabled={disabled} placeholder={f.placeholder} maxLength={f.maxLength}
                    type={f.type === 'number' ? 'number' : f.type} min={f.min} max={f.max} step={f.step ?? (f.type === 'number' && !f.integer ? 'any' : undefined)}
                    inputMode={f.type === 'number' ? 'decimal' : undefined} autoComplete={f.type === 'password' ? 'new-password' : 'off'}
                    onChange={(e) => set(e.target.value)} />
                  {f.suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-slate-400">{f.suffix}</span>}
                </div>
              )}
            </Field>
          </div>
        )
      })}
    </div>
  )
}
