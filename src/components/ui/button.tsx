import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-navy-800 shadow-sm',
        accent: 'bg-electric-500 text-white hover:bg-electric-600 shadow-sm',
        flame: 'bg-flame-500 text-white hover:bg-flame-600 shadow-sm',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-white text-foreground hover:bg-secondary',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-navy-100',
        ghost: 'text-foreground hover:bg-secondary',
        link: 'text-electric-600 underline-offset-4 hover:underline',
      },
      size: { default: 'h-10 px-4', sm: 'h-8 px-3 text-xs', lg: 'h-12 px-6 text-base', icon: 'h-9 w-9' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, type, ...props }, ref) => {
    if (asChild) return <Slot className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>{children}</Slot>
    return (
      <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} type={type ?? 'button'} disabled={disabled || loading} {...props}>
        {loading && <Loader2 className="animate-spin" />}
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'
