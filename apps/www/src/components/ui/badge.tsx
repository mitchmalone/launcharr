import { type VariantProps, cva } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-2 rounded-full border border-(--border) font-mono',
  {
    variants: {
      variant: {
        /** Version pill, "macOS · Apple Silicon" eyebrow. */
        default: 'px-2 py-0.5 text-[11px] text-(--dim)',
        /** Feature-card milestone tag. */
        milestone: 'px-2 py-px text-[10px] tracking-[0.1em] text-(--dim)',
        /** Hero eyebrow with the live dot. */
        eyebrow: 'px-3.5 py-1.5 text-xs text-(--dim)',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant, className }))} {...props} />
  )
}

export { Badge, badgeVariants }
