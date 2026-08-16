'use client'

import * as TabsPrimitive from '@radix-ui/react-tabs'
import type * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * The one Radix primitive the site admits (DECISIONS 2026-08-16): roving
 * tabindex, arrow-key navigation, and the tab/panel ARIA wiring are worth the
 * dependency; the rest of the redesign's chrome is markup we own.
 */
const Tabs = TabsPrimitive.Root

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'flex items-center gap-1 border-b border-(--border) bg-(--chip) px-2 pt-1',
        className,
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'cursor-pointer rounded-t-md border-b-2 border-transparent px-3.5 py-2 font-mono text-xs text-(--dim) transition-colors',
        'hover:text-(--fg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--dim)',
        'data-[state=active]:border-(--accent) data-[state=active]:text-(--fg)',
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn('focus-visible:outline-none', className)}
      {...props}
    />
  )
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
