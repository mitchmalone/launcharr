'use client'

import { useState } from 'react'

import { AgentCells, AgentHoverCard } from '@/components/demo/agent-cells'
import { AGENTS, type Agent } from '@/lib/demo-data'

const MONO_CODE = 'font-mono text-(--fg)'

/**
 * "Hover a cell" — the agent module pulled out of the bar at double size so the
 * hover card can be read. Defaults to the blocked session, since that's the
 * state the feature exists for.
 */
export function AgentSpotlight() {
  const blocked = AGENTS.find((a) => a.state === 'blocked') ?? AGENTS[0]!
  const [hovered, setHovered] = useState<Agent | null>(blocked)
  const shown = hovered ?? blocked

  return (
    <div
      className="overflow-hidden rounded-xl border border-(--hair) bg-[#14151d] px-[26px] pb-[30px] pt-[26px]"
      style={
        {
          '--d-glass': 'rgba(20, 21, 29, 0.96)',
          '--d-fg': '#dde1f0',
          '--d-dim': '#7f86a5',
        } as React.CSSProperties
      }
    >
      <div className="mb-4 text-[11px] uppercase tracking-[0.14em] text-[#73747c]">
        hover a cell
      </div>
      <div className="inline-flex">
        <AgentCells
          size="spotlight"
          hovered={hovered}
          onHover={(a) => setHovered(a ?? blocked)}
        />
      </div>
      <div className="mt-3.5 min-h-[118px]">
        <AgentHoverCard agent={shown} showLine1 />
      </div>
      <p className="m-0 mt-4 font-sans text-[13px] leading-[1.55] text-(--muted)">
        Also a panel: type <code className={MONO_CODE}>agents ⏎</code> in the
        launcher for the full keyboard-driven list.
      </p>
    </div>
  )
}
