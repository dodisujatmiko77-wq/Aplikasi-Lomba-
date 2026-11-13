import * as React from 'react'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/utils'

export const DropdownMenu = Menu.Root
export const DropdownMenuTrigger = Menu.Trigger
export const DropdownMenuContent = React.forwardRef<React.ElementRef<typeof Menu.Content>, React.ComponentPropsWithoutRef<typeof Menu.Content>>(
  ({ className, sideOffset = 6, ...props }, ref) => (
    <Menu.Portal>
      <Menu.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn('z-[60] min-w-[11rem] rounded-lg border bg-white p-1 shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0', className)}
        {...props}
      />
    </Menu.Portal>
  ),
)
DropdownMenuContent.displayName = 'DropdownMenuContent'
export const DropdownMenuItem = React.forwardRef<React.ElementRef<typeof Menu.Item>, React.ComponentPropsWithoutRef<typeof Menu.Item> & { destructive?: boolean }>(
  ({ className, destructive, ...props }, ref) => (
    <Menu.Item
      ref={ref}
      className={cn('flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-secondary data-[disabled]:opacity-50 [&_svg]:size-4', destructive && 'text-red-600 data-[highlighted]:bg-red-50', className)}
      {...props}
    />
  ),
)
DropdownMenuItem.displayName = 'DropdownMenuItem'
export const DropdownMenuSeparator = () => <Menu.Separator className="my-1 h-px bg-border" />
export const DropdownMenuLabel = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('px-2.5 py-1.5 text-xs font-semibold text-muted-foreground', className)} {...props} />
)
