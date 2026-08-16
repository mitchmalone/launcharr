'use client'

import { BarAgents } from '@launcharr/tui'
import { useMemo, useState } from 'react'

import { useWebBarHover } from '@/components/demo/bar-hover'
import { demoAgents } from '@/lib/demo-data'

import { BarThemeScope } from './bar-theme-scope'

const MONO_CODE = 'font-mono text-(--fg)'

/**
 * "Hover a cell" — the bar's agent cluster, magnified so the card is readable
 * on a marketing page. This is `BarAgents` from `@launcharr/tui`, the same
 * component the bar renders; only the scale wrapper is the website's, so the
 * geometry and card layout cannot drift.
 *
 * The blocked session is open by default and hover is sticky — the bar closes
 * its card because it's a status readout you glance at, whereas here the card
 * is the thing you're meant to read.
 */
export function AgentSpotlight() {
  const [now] = useState(() => new Date())
  const agents = useMemo(
    () => demoAgents(Math.floor(now.getTime() / 1000)),
    [now],
  )
  const blocked = agents.find((a) => a.state === 'attention') ?? agents[0]!
  const hover = useWebBarHover(`agent:${blocked.session}`)

  return (
    <BarThemeScope className="overflow-hidden rounded-xl border border-(--hair) bg-[#14151d] px-[26px] pb-[30px] pt-[26px]">
      <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.14em] text-(--dim)">
        hover a cell
      </div>
      {/* real cluster geometry, magnified as a unit */}
      <div className="origin-left scale-[1.6]">
        <BarAgents agents={agents} now={now} hover={hover} />
      </div>
      <p className="m-0 mt-24 font-sans text-[13px] leading-[1.55] text-(--muted)">
        Also a panel: type <code className={MONO_CODE}>agents ⏎</code> in the
        launcher for the full keyboard-driven list.
      </p>
    </BarThemeScope>
  )
}
