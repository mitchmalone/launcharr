import { type VariantProps, cva } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        /** The one loud button on the page: hero download. */
        cta: 'bg-(--cta) text-(--cta-fg) hover:bg-(--cta-hover) hover:no-underline',
        outline:
          'border border-(--border) text-(--fg) hover:border-(--accent) hover:text-(--fg) hover:no-underline',
        ghost: 'text-(--dim) hover:text-(--fg) hover:no-underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        lg: 'rounded-[7px] px-5 py-3 text-sm',
        sm: 'h-8 rounded-md px-3 text-xs',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'outline', size: 'default' },
  },
)

function Button({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

/** Same visual contract for anchors — most of the site's "buttons" are links. */
function ButtonLink({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<'a'> & VariantProps<typeof buttonVariants>) {
  return (
    <a
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, ButtonLink, buttonVariants }
