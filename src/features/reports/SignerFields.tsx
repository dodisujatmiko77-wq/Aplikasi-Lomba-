// Isian penanda tangan piagam: nama, jabatan, NIP/NPA, serta gambar tanda tangan dan stempel.
// Gambar hanya diproses di perangkat ini (tidak diunggah ke server) dan latar putihnya dibuat transparan.
import { useRef } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

export interface SignerState { name: string; title: string; idLine: string; sign: string | null; stamp: string | null }

/** Membaca berkas gambar, mengecilkan (maks 900 px), dan membuat latar putih/terang menjadi transparan. */
async function toTransparentPng(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Berkas harus berupa gambar (PNG/JPG)')
  if (file.size > 8 * 1024 * 1024) throw new Error('Ukuran gambar maksimal 8 MB')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('Gambar tidak dapat dibaca')); i.src = url })
    const s = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s))
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0, w, h)
    const d = ctx.getImageData(0, 0, w, h)
    let minX = w, minY = h, maxX = -1, maxY = -1
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4
      const r = d.data[k], g = d.data[k + 1], b = d.data[k + 2]
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      const sat = Math.max(r, g, b) - Math.min(r, g, b)
      // kertas putih/abu terang → transparan; tepi dibuat halus
      const a = sat > 40 ? 255 : lum > 225 ? 0 : lum > 185 ? Math.round(255 * (225 - lum) / 40) : 255
      d.data[k + 3] = Math.min(d.data[k + 3], a)
      if (d.data[k + 3] > 20) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
    }
    if (maxX < 0) throw new Error('Gambar tampak kosong. Pastikan tanda tangan/stempel terlihat jelas.')
    ctx.putImageData(d, 0, 0)
    const pad = 4, cw = Math.min(w, maxX - minX + 1 + pad * 2), ch = Math.min(h, maxY - minY + 1 + pad * 2)
    const out = document.createElement('canvas'); out.width = cw; out.height = ch
    out.getContext('2d')!.drawImage(c, Math.max(0, minX - pad), Math.max(0, minY - pad), cw, ch, 0, 0, cw, ch)
    return out.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

function ImagePick({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const pick = async (f?: File) => {
    if (!f) return
    try { onChange(await toTransparentPng(f)) } catch (e) { toast.error(e instanceof Error ? e.message : 'Gagal memproses gambar') }
    if (ref.current) ref.current.value = ''
  }
  return (
    <Field label={label}>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      <div className="flex items-center gap-2">
        <div className="flex h-14 w-28 items-center justify-center rounded-md border bg-[repeating-conic-gradient(#f3f6fb_0_25%,#fff_0_50%)] bg-[length:12px_12px]">
          {value ? <img src={value} alt="" className="max-h-12 max-w-[6.5rem] object-contain" /> : <span className="text-xs text-muted-foreground">Belum ada</span>}
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => ref.current?.click()}><ImagePlus /> {value ? 'Ganti' : 'Unggah'}</Button>
        {value && <Button type="button" size="icon" variant="ghost" onClick={() => onChange(null)} aria-label={`Hapus ${label}`}><X /></Button>}
      </div>
    </Field>
  )
}

export function SignerFields({ heading, value, onChange, namePlaceholder, idLabel }: {
  heading: string; value: SignerState; onChange: (v: SignerState) => void; namePlaceholder: string; idLabel: string
}) {
  return (
    <div className="rounded-xl border bg-navy-50/40 p-3">
      <p className="mb-2 text-sm font-semibold text-navy-900">{heading}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Nama"><Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder={namePlaceholder} /></Field>
        <Field label="Jabatan"><Input value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} /></Field>
        <Field label={idLabel}><Input value={value.idLine} onChange={(e) => onChange({ ...value, idLine: e.target.value })} placeholder="Kosongkan bila tidak perlu" /></Field>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <ImagePick label="Gambar tanda tangan (opsional)" value={value.sign} onChange={(v) => onChange({ ...value, sign: v })} />
        <ImagePick label="Gambar stempel (opsional)" value={value.stamp} onChange={(v) => onChange({ ...value, stamp: v })} />
      </div>
    </div>
  )
}
