/** Mesin formulir sederhana: definisi kolom → nilai input (string) → validasi → payload bertipe. */
export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'date' | 'time' | 'toggle' | 'color' | 'file' | 'email' | 'password'

export type Values = Record<string, unknown>

export interface FieldDef {
  /** nama kolom; "a.b" untuk kunci di dalam kolom jsonb */
  name: string
  label: string
  type: FieldType
  required?: boolean
  options?: { value: string; label: string }[]
  /** select bernilai angka */
  numeric?: boolean
  integer?: boolean
  min?: number
  max?: number
  step?: number
  minLength?: number
  maxLength?: number
  pattern?: { regex: RegExp; message: string }
  placeholder?: string
  hint?: string
  suffix?: string
  /** lebar penuh pada grid 2 kolom */
  full?: boolean
  rows?: number
  rtl?: boolean
  showIf?: (v: Values) => boolean
  /** saat disembunyikan showIf: simpan null (bawaan: nilai di database tidak diubah) */
  clearWhenHidden?: boolean
  // unggah berkas
  accept?: 'image' | 'media'
  folder?: string
  pathField?: string
  typeField?: string
  /** kosong disimpan sebagai null (bawaan untuk date/time/number/file) */
  nullable?: boolean
}

export const getPath = (obj: unknown, path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o as Values | null | undefined)?.[k], obj)

function setPath(target: Values, path: string, value: unknown) {
  const keys = path.split('.')
  let o = target
  keys.slice(0, -1).forEach((k) => {
    o[k] = { ...((o[k] as Values | undefined) ?? {}) }
    o = o[k] as Values
  })
  o[keys[keys.length - 1]] = value
}

/** Baris database → nilai formulir. */
export function toForm(row: Values, fields: FieldDef[]): Values {
  const v: Values = {}
  for (const f of fields) {
    const raw = getPath(row, f.name)
    if (f.type === 'toggle') v[f.name] = Boolean(raw)
    else if (f.type === 'time') v[f.name] = typeof raw === 'string' ? raw.slice(0, 5) : ''
    else if (f.type === 'date') v[f.name] = typeof raw === 'string' ? raw.slice(0, 10) : ''
    else if (f.type === 'select' && f.numeric) v[f.name] = raw === null || raw === undefined || raw === '' ? '' : String(Number(raw)) // "1.00" → "1"
    else v[f.name] = raw === null || raw === undefined ? '' : String(raw)
    if (f.pathField) v[f.pathField] = getPath(row, f.pathField) ?? null
    if (f.typeField) v[f.typeField] = getPath(row, f.typeField) ?? null
  }
  return v
}

const visible = (f: FieldDef, v: Values) => !f.showIf || f.showIf(v)

export function validateForm(values: Values, fields: FieldDef[]): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const f of fields) {
    if (!visible(f, values) || f.type === 'toggle') continue
    const raw = values[f.name]
    const s = typeof raw === 'string' ? raw.trim() : raw === null || raw === undefined ? '' : String(raw)
    if (!s) {
      if (f.required) errors[f.name] = f.type === 'file' ? 'Berkas wajib diunggah' : `${f.label} wajib diisi`
      continue
    }
    if (f.minLength && s.length < f.minLength) errors[f.name] = `Minimal ${f.minLength} karakter`
    else if (f.maxLength && s.length > f.maxLength) errors[f.name] = `Maksimal ${f.maxLength} karakter`
    else if (f.type === 'number') {
      const n = Number(s.replace(',', '.'))
      if (!Number.isFinite(n)) errors[f.name] = 'Harus berupa angka'
      else if (f.integer && !Number.isInteger(n)) errors[f.name] = 'Harus bilangan bulat'
      else if (f.min !== undefined && n < f.min) errors[f.name] = `Minimal ${f.min}`
      else if (f.max !== undefined && n > f.max) errors[f.name] = `Maksimal ${f.max}`
    } else if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) errors[f.name] = 'Format email tidak valid'
    else if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(s)) errors[f.name] = 'Tanggal tidak valid'
    else if (f.type === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) errors[f.name] = 'Jam tidak valid (JJ:MM)'
    else if (f.type === 'color' && !/^#[0-9a-fA-F]{6}$/.test(s)) errors[f.name] = 'Warna tidak valid'
    else if (f.type === 'select' && f.options && !f.options.some((o) => o.value === s)) errors[f.name] = 'Pilihan tidak valid'
    else if (f.pattern && !f.pattern.regex.test(s)) errors[f.name] = f.pattern.message
  }
  return errors
}

/** Nilai formulir → payload untuk Supabase (tipe sesuai kolom; "a.b" digabung ke objek jsonb asal). */
export function fromForm(values: Values, fields: FieldDef[], original: Values = {}): Values {
  const out: Values = {}
  const roots = new Set<string>()
  for (const f of fields) {
    const root = f.name.split('.')[0]
    if (f.name.includes('.') && !roots.has(root)) {
      roots.add(root)
      out[root] = { ...((original[root] as Values | undefined) ?? {}) }
    }
    const shown = visible(f, values)
    if (!shown) {
      if (f.clearWhenHidden) setPath(out, f.name, null)
      continue
    }
    const raw = values[f.name]
    const s = typeof raw === 'string' ? raw.trim() : ''
    const emptyNull = f.nullable ?? ['date', 'time', 'number', 'file'].includes(f.type) ?? false
    let val: unknown
    if (f.type === 'toggle') val = Boolean(raw)
    else if (!s) val = emptyNull || f.numeric ? null : ''
    else if (f.type === 'number' || f.numeric) val = Number(s.replace(',', '.'))
    else val = s
    setPath(out, f.name, val)
    if (f.pathField) out[f.pathField] = s ? values[f.pathField] ?? null : null
    if (f.typeField && values[f.typeField]) out[f.typeField] = values[f.typeField]
  }
  return out
}

/** Hasil validasi lintas kolom (boleh berisi undefined) digabung ke galat per kolom. */
export type ExtraErrors = Record<string, string | undefined>
export function mergeErrors(base: Record<string, string>, extra: ExtraErrors | undefined): Record<string, string> {
  const out = { ...base }
  for (const [k, v] of Object.entries(extra ?? {})) if (v) out[k] = v
  return out
}
