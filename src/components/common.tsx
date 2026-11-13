import { useRef, useState, type ReactNode } from 'react'
import { ImagePlus, Inbox, Loader2, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { uploadImage } from '@/services/db'
import { LABELS, initials } from '@/utils/format'
import type { SessionStatus } from '@/types'

export function Logo({ className, size = 36 }: { className?: string; size?: number }) {
  return <img src="/logo.svg" alt="Lomba Rangking 1" width={size} height={size} className={cn('shrink-0 rounded-xl', className)} />
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-navy-900">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-navy-50 text-navy-400">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <p className="font-semibold text-navy-900">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Loading({ label = 'Memuat data…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground', className)}>
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  )
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <span>{message}</span>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Coba lagi</Button>}
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Cari…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9" />
    </div>
  )
}

const sessionVariant: Record<SessionStatus, 'gray' | 'blue' | 'green' | 'orange' | 'default' | 'red'> = {
  draft: 'gray', open: 'blue', running: 'green', paused: 'orange', finished: 'default', cancelled: 'red',
}
export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  return (
    <Badge variant={sessionVariant[status]}>
      {status === 'running' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600" />}
      {LABELS.sessionStatus[status]}
    </Badge>
  )
}

export function Avatar({ name, src, size = 36, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: size * 0.38 }
  if (src) return <img src={src} alt="" style={style} className={cn('shrink-0 rounded-full object-cover', className)} />
  return (
    <span style={style} className={cn('flex shrink-0 items-center justify-center rounded-full bg-navy-100 font-semibold text-navy-700', className)}>
      {initials(name) || '?'}
    </span>
  )
}

export function ImageUpload({ value, onChange, bucket, label = 'Unggah gambar' }: {
  value: string | null | undefined
  onChange: (url: string | null) => void
  bucket: 'participant-photos' | 'question-images' | 'branding'
  label?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const pick = async (file?: File) => {
    if (!file) return
    setBusy(true)
    try {
      onChange(await uploadImage(bucket, file))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengunggah')
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ''
    }
  }
  return (
    <div className="flex items-center gap-3">
      {value ? (
        <img src={value} alt="" className="h-16 w-16 rounded-lg border object-cover" />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed text-muted-foreground"><ImagePlus className="h-5 w-5" /></div>
      )}
      <div className="flex gap-2">
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void pick(e.target.files?.[0])} />
        <Button variant="outline" size="sm" loading={busy} onClick={() => ref.current?.click()}>{label}</Button>
        {value && <Button variant="ghost" size="icon" onClick={() => onChange(null)} aria-label="Hapus gambar"><Trash2 /></Button>}
      </div>
    </div>
  )
}

/** Pagination sisi klien untuk daftar besar. */
export function usePaged<T>(rows: T[], pageSize = 25) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const current = Math.min(page, pages - 1)
  return { page: current, pages, setPage, slice: rows.slice(current * pageSize, (current + 1) * pageSize), total: rows.length, pageSize }
}

export function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (pages <= 1) return <div className="px-4 py-2.5 text-xs text-muted-foreground">{total} data</div>
  return (
    <div className="no-print flex items-center justify-between gap-3 border-t px-4 py-2.5 text-xs text-muted-foreground">
      <span>{total} data · halaman {page + 1} dari {pages}</span>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => onPage(page - 1)}>Sebelumnya</Button>
        <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Berikutnya</Button>
      </div>
    </div>
  )
}
