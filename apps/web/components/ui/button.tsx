import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

// shadcn/ui's copy-owned button pattern, shared by links and buttons.
export const buttonVariants = cva('inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50', {
  variants: { variant: { default: 'bg-primary text-primary-foreground hover:bg-primary/90', outline: 'border border-border bg-background hover:bg-muted' }, size: { default: 'h-12 px-6', small: 'h-10 px-4' } },
  defaultVariants: { variant: 'default', size: 'default' },
})
export function Button({ className, variant, size, ...props }: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size, className }))} {...props}/>
}
