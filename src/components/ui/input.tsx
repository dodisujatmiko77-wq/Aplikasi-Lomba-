import * as React from 'react'
import { cn } from '@/lib/utils'

const base =
  'flex w-full rounded-lg border border-input bg-white px-3 text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => <input type={type} className={cn(base, 'h-10', className)} ref={ref} {...props} />,
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea className={cn(base, 'min-h-[84px] py-2', className)} ref={ref} {...props} />,
)
Textarea.displayName = 'Textarea'
