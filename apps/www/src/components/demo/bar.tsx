'use client'

import { BatteryMedium, Wifi } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { Agent } from '@/lib/demo-data'

import { AgentCells, AgentHoverCard } from './agent-cells'

const WORKSPACES = ['1', '2', '3', '4']

/** Sat 16 Aug 09:41 — the bar's clock module format. */
function useClock(): string {
  // Rendered empty on the server: a build-time timestamp in static HTML would
  // ship stale and hydrate-mismatch. The bar fills in on mount.
  const [now, setNow] = useState<string>('')
  useEffect(() => {
    const fmt = () => {
      const d = new Date()
      const date = d
        .toLocaleDateString('en-AU', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        })
        .replace(',', '')
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      return `${date} ${hh}:${mm}`
    }
    setNow(fmt())
    const id = setInterval(() => setNow(fmt()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

/**
 * The bar, as it renders across the top of the demo desktop. Static mock: the
 * real strip is painted from Rust-pushed snapshots at 1 Hz, and its modules are
 * arranged by `bar.layout`'s left/center/right zones.
 */
export function DemoBar({
  workspace,
  onWorkspace,
  frontApp = 'Ghostty',
}: {
  workspace: string
  onWorkspace: (ws: string) => void
  frontApp?: string
}) {
  const clock = useClock()
  const [hovered, setHovered] = useState<Agent | null>(null)

  return (
    <div className="absolute inset-x-0 top-0 z-10 flex h-[30px] items-center justify-between bg-(--d-glass) px-3.5 font-mono text-xs tracking-[0.03em] text-(--d-fg)">
      {/* left zone: workspaces · agents · front app */}
      <div className="flex items-center gap-3.5">
        <span className="font-bold text-(--d-sigil)">❯</span>
        <div className="flex items-center gap-1.5">
          {WORKSPACES.map((w) => {
            const active = w === workspace
            return (
              <button
                key={w}
                type="button"
                onClick={() => onWorkspace(w)}
                aria-label={`workspace ${w}`}
                aria-current={active}
                className="cursor-pointer border-none px-1 text-center text-xs tracking-[0.03em]"
                style={{
                  minWidth: 20,
                  height: 18,
                  lineHeight: '18px',
                  background: active ? 'var(--d-fg)' : 'transparent',
                  color: active ? 'var(--d-glass)' : 'var(--d-dim)',
                  fontWeight: active ? 700 : 400,
                }}
              >
                {w}
              </button>
            )
          })}
        </div>
        <div className="relative">
          <AgentCells hovered={hovered} onHover={setHovered} />
          {hovered ? (
            <div className="absolute left-0 top-[27px] z-10">
              <AgentHoverCard agent={hovered} />
            </div>
          ) : null}
        </div>
        <span className="max-w-[32ch] overflow-hidden text-ellipsis whitespace-nowrap text-(--d-dim)">
          {frontApp}
        </span>
      </div>

      {/* center zone: the clock is an ordinary module that happens to live here */}
      <div className="absolute left-1/2 -translate-x-1/2 text-(--d-fg)">
        {clock}
      </div>

      {/* right zone: wifi · trmnl · battery */}
      <div className="flex items-center gap-3.5 text-(--d-dim)">
        <span className="inline-flex items-center gap-1.5">
          <Wifi size={14} strokeWidth={2.2} />
          Blackbeard 5G
        </span>
        <span className="inline-flex items-center gap-1.5">▣ 87%</span>
        <span className="inline-flex items-center gap-1.5">
          <BatteryMedium size={14} strokeWidth={2.2} />
          64%
        </span>
      </div>
    </div>
  )
}
