import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Select = SelectPrimitive.Root
export const SelectValue = SelectPrimitive.Value

export const SelectTrigger = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>>(
  ({ className, children, ...props }, ref) => (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn('flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-white px-3 text-sm data-[placeholder]:text-muted-foreground disabled:opacity-50 [&>span]:truncate', className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild><ChevronDown className="h-4 w-4 shrink-0 opacity-60" /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  ),
)
SelectTrigger.displayName = 'SelectTrigger'

export const SelectContent = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Content>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>>(
  ({ className, children, ...props }, ref) => (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position="popper"
        sideOffset={4}
        className={cn('z-[60] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border bg-white shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0', className)}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  ),
)
SelectContent.displayName = 'SelectContent'

export const SelectItem = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Item>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>>(
  ({ className, children, ...props }, ref) => (
    <SelectPrimitive.Item
      ref={ref}
      className={cn('relative flex w-full cursor-pointer select-none items-center rounded-md py-2 pl-8 pr-3 text-sm outline-none data-[highlighted]:bg-secondary data-[disabled]:opacity-50', className)}
      {...props}
    >
      <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator><Check className="h-4 w-4 text-electric-600" /></SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  ),
)
SelectItem.displayName = 'SelectItem'

/** Select sederhana berbasis daftar opsi. Nilai kosong direpresentasikan dengan `allLabel`. */
export function SimpleSelect({ value, onChange, options, placeholder, allLabel, className, disabled }: {
  value: string | null | undefined
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  allLabel?: string
  className?: string
  disabled?: boolean
}) {
  const ALL = '__all__'
  return (
    <Select value={value ? value : allLabel ? ALL : undefined} onValueChange={(v) => onChange(v === ALL ? '' : v)} disabled={disabled}>
      <SelectTrigger className={className}><SelectValue placeholder={placeholder ?? 'Pilih…'} /></SelectTrigger>
      <SelectContent>
        {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}
