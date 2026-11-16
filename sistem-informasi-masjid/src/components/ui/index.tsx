import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, TriangleAlert, X } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'gold'
const VARIANT: Record<Variant, string> = {
  primary: 'bg-emerald-700 text-white hover:bg-emerald-800 shadow-sm',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  ghost: 'text-slate-600 hover:bg-slate-100',
  gold: 'bg-gold-500 text-emerald-950 hover:bg-gold-400 shadow-sm',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md'
  loading?: boolean
  icon?: ReactNode
}

export function Button({ variant = 'primary', size = 'md', loading, icon, children, className = '', disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm'} ${VARIANT[variant]} ${className}`}
      {...rest}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon ? <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span> : null}
      {children}
    </button>
  )
}

export function IconButton({ label, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" title={label} aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40 [&>svg]:h-4 [&>svg]:w-4 ${className}`} {...rest}>
      {children}
    </button>
  )
}

export const Spinner = ({ className = '' }: { className?: string }) => <Loader2 className={`h-5 w-5 animate-spin text-emerald-600 ${className}`} />

export function Loading({ text = 'Memuat data…' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
      <Spinner /> {text}
    </div>
  )
}

const TONE = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  gray: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
}
export function Badge({ tone = 'gray', children }: { tone?: keyof typeof TONE; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE[tone]}`}>{children}</span>
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${checked ? 'bg-emerald-600' : 'bg-slate-300'}`}>
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  )
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div role="dialog" aria-modal="true" aria-label={title}
            className={`flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-xl'}`}
            initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              <IconButton label="Tutup" onClick={onClose}><X /></IconButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Hapus', loading, onConfirm, onClose }: {
  open: boolean; title: string; message: ReactNode; confirmLabel?: string; loading?: boolean; onConfirm: () => void; onClose: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button variant="danger" loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <div className="flex gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600"><TriangleAlert className="h-5 w-5" /></span>
        <div className="pt-1 text-sm leading-relaxed text-slate-600">{message}</div>
      </div>
    </Modal>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 [&>svg]:h-7 [&>svg]:w-7">{icon}</span>
      <p className="mt-4 font-heading text-base font-semibold text-slate-800">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Section({ title, description, children, aside }: { title: string; description?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="card p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function StatCard({ icon, label, value, hint, tone = 'emerald' }: { icon: ReactNode; label: string; value: ReactNode; hint?: ReactNode; tone?: 'emerald' | 'gold' | 'sky' | 'rose' }) {
  const tones = { emerald: 'bg-emerald-50 text-emerald-700', gold: 'bg-amber-50 text-amber-700', sky: 'bg-sky-50 text-sky-700', rose: 'bg-rose-50 text-rose-700' }
  return (
    <div className="card flex items-center gap-4 p-5">
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl [&>svg]:h-6 [&>svg]:w-6 ${tones[tone]}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="truncate font-heading text-2xl font-bold text-slate-900">{value}</p>
        {hint && <p className="truncate text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  )
}

export function Alert({ tone = 'amber', children }: { tone?: 'amber' | 'red' | 'green' | 'blue'; children: ReactNode }) {
  const tones = { amber: 'border-amber-200 bg-amber-50 text-amber-900', red: 'border-red-200 bg-red-50 text-red-800', green: 'border-emerald-200 bg-emerald-50 text-emerald-900', blue: 'border-sky-200 bg-sky-50 text-sky-900' }
  return <div className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>
}
