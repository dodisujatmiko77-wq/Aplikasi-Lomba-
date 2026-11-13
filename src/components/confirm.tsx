// Dialog konfirmasi & prompt imperatif:  if (await confirm({ title: 'Hapus?' })) …
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'

interface ConfirmOptions {
  title: string
  description?: ReactNode
  confirmLabel?: string
  destructive?: boolean
  /** bila diisi, dialog meminta teks (mis. alasan) dan mengembalikannya */
  promptLabel?: string
  promptRequired?: boolean
}
type Resolver = (value: string | boolean) => void

const Ctx = createContext<{ ask: (o: ConfirmOptions) => Promise<string | boolean> } | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const [text, setText] = useState('')
  const resolver = useRef<Resolver>()
  const ask = useCallback((o: ConfirmOptions) => {
    setText('')
    setOpts(o)
    return new Promise<string | boolean>((resolve) => (resolver.current = resolve))
  }, [])
  const close = (value: string | boolean) => {
    resolver.current?.(value)
    setOpts(null)
  }
  return (
    <Ctx.Provider value={{ ask }}>
      {children}
      <AlertDialog.Root open={!!opts} onOpenChange={(o) => !o && close(false)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[70] bg-navy-950/55 backdrop-blur-[2px]" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[70] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-white p-6 shadow-2xl">
            <AlertDialog.Title className="font-heading text-lg font-semibold text-navy-900">{opts?.title}</AlertDialog.Title>
            <AlertDialog.Description asChild>
              <div className="mt-2 text-sm text-muted-foreground">{opts?.description ?? 'Tindakan ini tidak dapat dibatalkan.'}</div>
            </AlertDialog.Description>
            {opts?.promptLabel && (
              <label className="mt-4 block space-y-1.5">
                <span className="text-sm font-medium text-navy-800">{opts.promptLabel}</span>
                <Textarea value={text} onChange={(e) => setText(e.target.value)} autoFocus />
              </label>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => close(false)}>Batal</Button>
              <Button
                variant={opts?.destructive ? 'destructive' : 'default'}
                disabled={!!opts?.promptLabel && opts.promptRequired !== false && !text.trim()}
                onClick={() => close(opts?.promptLabel ? text.trim() || true : true)}
              >
                {opts?.confirmLabel ?? 'Ya, lanjutkan'}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </Ctx.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('ConfirmProvider belum dipasang')
  return ctx.ask
}
