'use client'

import { BatteryMedium, Wifi } from 'lucide-react'
import { useEffect, useState } from 'react'

import { AgentCells, AgentHoverCard, useCellHover } from './agent-cells'

const WORKSPACES = ['1', '2', '3', '4']

/**
 * The bar as it renders across the top of the demo desktop — ported from
 * apps/desktop/src/bar/{main.tsx,bar.css}, not from the design export.
 *
 * Colour rules worth stating because they're easy to get backwards:
 *   .bar-app  → --fg   (front app is NOT dim)
 *   .bar-cell → --fg   ("fg, not dim — the dim tone read too dark against the
 *                        strip"; dim stays for truly secondary text)
 *   .bar-ws   → --dim, and the focused one inverts: bg --fg / color --bg
 * The --d-* vars are the demo's per-theme mirror of the app's panel tokens.
 */

/** Sat 16 Aug 09:41 — the bar's clock module format. */
function useClock(): string {
  // Empty on the server: a build-time timestamp would ship stale into static
  // HTML and hydrate-mismatch. The bar fills in on mount.
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
  const { hovered, enter, leave, stay } = useCellHover()

  return (
    <div className="absolute inset-x-0 top-0 z-10 flex h-[30px] items-center justify-between bg-(--d-bg) px-3.5 font-mono text-xs tracking-[0.03em] text-(--d-fg)">
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
                className="cursor-pointer border-none px-1 text-center text-xs tracking-[0.03em] hover:text-(--d-fg)"
                style={{
                  minWidth: 20,
                  height: 18,
                  lineHeight: '18px',
                  // .bar-ws-focused: a solid light block, Omarchy-style.
                  background: active ? 'var(--d-fg)' : 'transparent',
                  color: active ? 'var(--d-bg)' : 'var(--d-dim)',
                  fontWeight: active ? 700 : 400,
                }}
              >
                {w}
              </button>
            )
          })}
        </div>
        <div className="relative">
          <AgentCells hovered={hovered} onEnter={enter} onLeave={leave} />
          {hovered ? (
            // .bar-card: top calc(100% + 5px) below the 30px strip. The card
            // keeps itself open on hover, as `stay()` does in bar/hover.ts.
            <div className="absolute left-0 top-[calc(100%+5px)] z-10">
              <AgentHoverCard
                agent={hovered}
                onMouseEnter={stay}
                onMouseLeave={() => leave()}
              />
            </div>
          ) : null}
        </div>
        {/* .bar-app — fg, truncated at 32ch */}
        <span className="max-w-[32ch] overflow-hidden text-ellipsis whitespace-nowrap text-(--d-fg)">
          {frontApp}
        </span>
      </div>

      {/* center zone: the clock is an ordinary module that happens to live here */}
      <div className="absolute left-1/2 -translate-x-1/2 text-(--d-fg)">
        {clock}
      </div>

      {/* right zone: wifi · trmnl · battery — .bar-cell is fg, not dim */}
      <div className="flex items-center gap-3.5 text-(--d-fg)">
        <span className="inline-flex items-center gap-[5px]">
          <Wifi size={14} strokeWidth={2.2} aria-hidden />
          Blackbeard 5G
        </span>
        <span className="inline-flex items-center gap-[5px]">▣ 87%</span>
        <span className="inline-flex items-center gap-[5px]">
          <BatteryMedium size={14} strokeWidth={2.2} aria-hidden />
          64%
        </span>
      </div>
    </div>
  )
}
