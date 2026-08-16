'use client'

import {
  AgentCells,
  AgentHoverCard,
  useCellHover,
} from '@/components/demo/agent-cells'
import { AGENTS } from '@/lib/demo-data'

const MONO_CODE = 'font-mono text-(--fg)'

/**
 * "Hover a cell" — the bar's agent cluster, magnified so the card is readable
 * on a marketing page. The cluster renders at its real geometry and is scaled
 * as a whole (transform, not bigger paddings), so nothing here can drift from
 * `.bar-agent*` in bar/bar.css.
 *
 * One deliberate difference from the bar: the selection is sticky. The bar
 * closes its card ~200ms after you leave, because it's a status readout you
 * glance at; here the card is the thing you're meant to read, so leaving a
 * cell keeps the last one open instead of snapping back.
 */
export function AgentSpotlight() {
  const blocked = AGENTS.find((a) => a.state === 'attention') ?? AGENTS[0]!
  const { hovered, enter, stay } = useCellHover(blocked)
  const shown = hovered ?? blocked

  return (
    <div
      className="overflow-hidden rounded-xl border border-(--hair) bg-[#14151d] px-[26px] pb-[30px] pt-[26px]"
      /* The kit's default panel tokens — the same fallbacks bar.css declares. */
      style={
        {
          '--d-bg': 'rgba(20, 21, 29, 0.96)',
          '--d-fg': '#dde1f0',
          '--d-dim': '#7f86a5',
          '--d-accent': '#9db2ff',
        } as React.CSSProperties
      }
    >
      <div className="mb-4 text-[11px] uppercase tracking-[0.14em] text-[#73747c]">
        hover a cell
      </div>
      {/* real cluster geometry, magnified as a unit */}
      <div className="origin-left scale-[1.6]">
        <AgentCells hovered={shown} onEnter={enter} onLeave={stay} />
      </div>
      <div className="mt-8 min-h-[118px]">
        <AgentHoverCard agent={shown} />
      </div>
      <p className="m-0 mt-4 font-sans text-[13px] leading-[1.55] text-(--muted)">
        Also a panel: type <code className={MONO_CODE}>agents ⏎</code> in the
        launcher for the full keyboard-driven list.
      </p>
    </div>
  )
}
